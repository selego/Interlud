/**
 * Migration des fichiers d'agrégation vers le template V5 (Agrégation résultats charte_V5.xlsx).
 *
 * Pour chaque collectivité (et chaque entrée collectivité d'un acteur éco) ayant un fichier d'agrégation :
 *  1. Lit les valeurs saisies dans "1. Données d'entrée" (colonnes I:K, lignes identifiées par l'ID en colonne D)
 *  2. Renomme l'ancien fichier en "..._OLD_V4.xlsx" (backup)
 *  3. Duplique le template V5 sous le nom "... - Aggregation_V5.xlsx" dans le dossier SharePoint de la collectivité
 *  4. Réécrit les valeurs dans le nouveau fichier par correspondance d'ID, par blocs de lignes proches, puis recalcule le workbook
 *  5. Met à jour aggregation_excel_file_id en base (seulement après succès complet)
 *
 * Relançable : une cible dont le fichier en base finit déjà par "_V5.xlsx" est sautée. En cas d'échec, l'ancien fichier
 * retrouve son nom et la copie V5 est conservée : la relance la réutilise au lieu d'en créer une autre.
 * Excel Online met plusieurs secondes à ouvrir une copie fraîche de 4 Mo : le classeur est "réchauffé" avec des
 * essais espacés avant la première lecture, et une pause sépare deux cibles.
 *
 * Usage (depuis api/) :
 *   node script/migrate_aggregation_v4.js --dry-run            # rapport sans aucune écriture
 *   node script/migrate_aggregation_v4.js                      # migration réelle
 *   node script/migrate_aggregation_v4.js --only "Morlaix"     # une seule cible (filtre sur le libellé)
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const config = require('../src/config');
const Collectivity = require('../src/models/collectivity');
const EconomicActor = require('../src/models/economic_actor');
const { graphFetch, getSiteId, duplicateExcelFile, calculateWorkbook, aggregationTemplateFileId } = require('../src/services/microsoftGraph');

const INPUT_SHEET = "1. Données d'entrée";
const MAX_ROWS = 10000;
const VALUE_COLS = ['I', 'J', 'K']; // instances 1 à 3
const DRY_RUN = process.argv.includes('--dry-run');
const ONLY = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : null;
const NEW_SUFFIX = '_V5.xlsx';
const PAUSE_BETWEEN_TARGETS_MS = 10000;
const WARMUP_ATTEMPTS = 6;
const WARMUP_DELAY_MS = 10000;
// Écriture par blocs : deux lignes remplies séparées de plus de MAX_GAP_ROWS lignes vides vont dans deux PATCH distincts.
// Un seul PATCH couvrant 6 800 lignes (Morlaix, Nîmes) fait tomber Excel Online en 504.
const MAX_GAP_ROWS = 100;
// Étendue maximale d'un bloc (première → dernière ligne) : les fichiers migrés sans problème couvraient ~900 lignes
const MAX_CLUSTER_ROWS = 500;
const PAUSE_BETWEEN_PATCHES_MS = 500;
const RENAME_ATTEMPTS = 3;
const RENAME_DELAY_MS = 10000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const sheetPath = (siteId, fileId) => `/sites/${siteId}/drive/items/${fileId}/workbook/worksheets/${encodeURIComponent(INPUT_SHEET)}`;

// Lit colonne D (IDs) + colonnes I:K d'un fichier d'agrégation
async function readInputSheet(siteId, fileId) {
  const idRows = (await graphFetch(`${sheetPath(siteId, fileId)}/range(address='D1:D${MAX_ROWS}')`)).values || [];
  const valueRows = (await graphFetch(`${sheetPath(siteId, fileId)}/range(address='I1:K${MAX_ROWS}')`)).values || [];
  return { idRows, valueRows };
}

// Extrait { id -> [I, J, K] } pour les lignes ayant au moins une valeur saisie.
// Exclut la ligne d'en-têtes (ID = 'ID', déjà présente dans le template V5) et le remplissage
// parasite hérité de l'ancien template : cellule = année de l'ID (ex. 'B3-GES-Init-2010' → 2010),
// présent en colonne I ou J selon les fichiers.
function extractFilledValues(idRows, valueRows) {
  const filled = new Map();
  for (let i = 0; i < idRows.length; i++) {
    const id = idRows[i]?.[0] != null && idRows[i][0] !== '' ? String(idRows[i][0]).trim() : '';
    if (!id || id === 'ID') continue;
    const idYear = id.match(/-(\d{4})$/)?.[1];
    const values = [0, 1, 2].map((c) => {
      const v = (valueRows[i] || [])[c] ?? '';
      return idYear && Number(v) === Number(idYear) ? '' : v;
    });
    if (!values.some((v) => v !== '' && v != null)) continue;
    filled.set(id, values);
  }
  return filled;
}

async function renameFile(siteId, fileId, newName) {
  await graphFetch(`/sites/${siteId}/drive/items/${fileId}`, {
    method: 'PATCH',
    body: JSON.stringify({ name: newName, '@microsoft.graph.conflictBehavior': 'rename' }),
  });
}

// Un fichier reste verrouillé quelques secondes après une lecture de classeur (session Excel Online),
// ou tant qu'un utilisateur l'a ouvert dans Excel : on réessaie avant d'abandonner la cible.
async function renameFileWithRetry(siteId, fileId, newName, label) {
  for (let attempt = 1; attempt <= RENAME_ATTEMPTS; attempt++) {
    try {
      await renameFile(siteId, fileId, newName);
      return;
    } catch (e) {
      if (!/locked/i.test(e.message) || attempt === RENAME_ATTEMPTS) throw e;
      console.log(`   ⏳ [${label}] fichier verrouillé, nouvel essai du renommage dans ${RENAME_DELAY_MS / 1000}s (${attempt}/${RENAME_ATTEMPTS})...`);
      await sleep(RENAME_DELAY_MS);
    }
  }
}

// Première ouverture d'une copie fraîche : Excel Online charge et recalcule tout le classeur, ce qui dépasse
// souvent le délai Graph (504). On tente une lecture légère jusqu'à ce que le classeur réponde.
async function warmUpWorkbook(siteId, fileId, label) {
  for (let attempt = 1; attempt <= WARMUP_ATTEMPTS; attempt++) {
    try {
      await graphFetch(`/sites/${siteId}/drive/items/${fileId}/workbook/worksheets?$select=name`);
      return;
    } catch (e) {
      if (attempt === WARMUP_ATTEMPTS) throw new Error(`classeur toujours indisponible après ${WARMUP_ATTEMPTS} essais (${e.message})`);
      console.log(`   ⏳ [${label}] classeur pas encore prêt (${e.message}), nouvel essai dans ${WARMUP_DELAY_MS / 1000}s...`);
      await sleep(WARMUP_DELAY_MS);
    }
  }
}

// Id d'un fichier du dossier par son nom exact, null s'il n'existe pas
async function findFileByName(siteId, folderId, fileName) {
  const escapedName = fileName.replace(/'/g, "''");
  return ((await graphFetch(`/sites/${siteId}/drive/items/${folderId}/children?$filter=name eq '${escapedName}'`)).value || [])[0]?.id || null;
}

// Regroupe des index de lignes (triés) en blocs : coupure dès qu'un trou dépasse maxGap lignes,
// ou dès que le bloc s'étendrait sur plus de maxSpan lignes
function clusterRows(rowIndexes, maxGap, maxSpan = Infinity) {
  const sorted = [...new Set(rowIndexes)].sort((a, b) => a - b);
  const clusters = [];
  for (const row of sorted) {
    const current = clusters[clusters.length - 1];
    const fits = current && row - current[current.length - 1] <= maxGap && row - current[0] + 1 <= maxSpan;
    if (fits) current.push(row);
    if (!fits) clusters.push([row]);
  }
  return clusters;
}

// Écrit les valeurs dans le nouveau fichier par correspondance d'ID en colonne D, un PATCH I:K par bloc de lignes proches
async function writeValues(siteId, newFileId, filled) {
  const { idRows, valueRows } = await readInputSheet(siteId, newFileId);

  const idRowMap = new Map();
  for (let i = 0; i < idRows.length; i++) {
    const id = idRows[i]?.[0] != null && idRows[i][0] !== '' ? String(idRows[i][0]).trim() : '';
    if (id) idRowMap.set(id, i);
  }

  const unmatched = [...filled.keys()].filter((id) => !idRowMap.has(id));
  const matched = [...filled.entries()].filter(([id]) => idRowMap.has(id));
  if (!matched.length) return { written: 0, unmatched, patches: 0 };

  const valuesByRow = new Map(matched.map(([id, values]) => [idRowMap.get(id), values]));
  const clusters = clusterRows([...valuesByRow.keys()], MAX_GAP_ROWS, MAX_CLUSTER_ROWS);
  let written = 0;

  for (let c = 0; c < clusters.length; c++) {
    const min = clusters[c][0];
    const max = clusters[c][clusters[c].length - 1];
    // Matrice I:K complète sur min..max : valeurs existantes du template, écrasées par les valeurs migrées
    const matrix = [];
    for (let i = min; i <= max; i++) matrix.push([valueRows[i]?.[0] ?? '', valueRows[i]?.[1] ?? '', valueRows[i]?.[2] ?? '']);
    for (const row of clusters[c]) {
      const values = valuesByRow.get(row);
      for (let k = 0; k < 3; k++) {
        if (values[k] === '' || values[k] == null) continue;
        matrix[row - min][k] = values[k];
        written++;
      }
    }
    await graphFetch(`${sheetPath(siteId, newFileId)}/range(address='${VALUE_COLS[0]}${min + 1}:${VALUE_COLS[2]}${max + 1}')`, {
      method: 'PATCH',
      body: JSON.stringify({ values: matrix }),
    });
    if (c < clusters.length - 1) await sleep(PAUSE_BETWEEN_PATCHES_MS);
  }

  return { written, unmatched, patches: clusters.length };
}

async function migrateTarget(siteId, target, templateIds) {
  const { label, oldFileId, folderId, baseName, saveNewFileId } = target;
  const newFileName = `${baseName}${NEW_SUFFIX}`;
  const oldName = `${baseName}_OLD_V4.xlsx`;

  if (!folderId) {
    console.log(`⚠️  [${label}] pas de sharepoint_folder_id → ignoré`);
    return { status: 'skipped' };
  }

  // Nom actuel du fichier pointé en base : déjà en _V5 → migration faite, on saute
  let currentName;
  try {
    currentName = (await graphFetch(`/sites/${siteId}/drive/items/${oldFileId}?$select=name`)).name;
  } catch (e) {
    console.log(`⚠️  [${label}] fichier en base introuvable (${e.message}) → ignoré`);
    return { status: 'error' };
  }
  if (currentName.endsWith(NEW_SUFFIX)) {
    console.log(`⏭️  [${label}] déjà migré (${currentName})`);
    return { status: 'already' };
  }

  const readOld = async () => {
    const { idRows, valueRows } = await readInputSheet(siteId, oldFileId);
    return extractFilledValues(idRows, valueRows);
  };

  if (DRY_RUN) {
    let filled;
    try {
      filled = await readOld();
    } catch (e) {
      console.log(`⚠️  [${label}] lecture de l'ancien fichier impossible (${e.message}) → ignoré`);
      return { status: 'error' };
    }
    const unmatched = [...filled.keys()].filter((id) => !templateIds.has(id));
    console.log(`🔎 [${label}] ${filled.size} ligne(s) avec valeurs à transférer depuis "${currentName}"${unmatched.length ? ` — ${unmatched.length} ID(s) absents du template V5 : ${unmatched.join(', ')}` : ''}`);
    return { status: 'dry-run', count: filled.size };
  }

  // Backup : l'ancien fichier prend le nom _OLD_V4 (sauf s'il le porte déjà, cas d'une migration interrompue).
  // Fait AVANT la lecture : lire le classeur pose une session Excel Online qui verrouille le fichier quelques secondes.
  // Facultatif : le nouveau fichier porte _V5, il n'y a pas de conflit de nom. Si l'ancien reste verrouillé
  // (fichier ouvert dans Excel, synchro de l'application en cours), il garde son nom et la migration continue.
  let renamed = false;
  if (currentName !== oldName) {
    try {
      await renameFileWithRetry(siteId, oldFileId, oldName, label);
      renamed = true;
    } catch (e) {
      console.log(`⚠️  [${label}] ancien fichier non renommé, il garde le nom "${currentName}" (${e.message})`);
    }
  }
  const backupName = renamed || currentName === oldName ? oldName : currentName;

  let newFileId;
  try {
    const filled = await readOld();
    // Une copie _V5 laissée par une tentative précédente est réutilisée : elle vient du même template, et les
    // valeurs réécrites sont identiques. Évite aussi de buter sur un fichier encore verrouillé par Excel Online.
    const existing = await findFileByName(siteId, folderId, newFileName);
    if (existing) console.log(`   ♻️  [${label}] copie V5 existante réutilisée (${existing})`);
    newFileId = existing || (await duplicateExcelFile(newFileName, folderId, aggregationTemplateFileId));
    await warmUpWorkbook(siteId, newFileId, label);
    const { written, unmatched, patches } = await writeValues(siteId, newFileId, filled);
    if (unmatched.length) console.log(`⚠️  [${label}] IDs non trouvés dans le V5 (valeurs non transférées) :`, unmatched);
    await calculateWorkbook(newFileId).catch((e) => console.log(`⚠️  [${label}] recalcul échoué : ${e.message}`));
    await saveNewFileId(newFileId);
    console.log(`✅ [${label}] migré → ${newFileId} (${written} cellule(s) transférée(s) en ${patches} bloc(s), ancien fichier : ${backupName})`);
    return { status: 'migrated' };
  } catch (e) {
    // La copie _V5 reste en place pour la relance ; seul l'ancien fichier retrouve son nom
    console.log(`❌ [${label}] échec (${e.message}) → restauration du nom de l'ancien fichier (copie V5 conservée pour la relance)`);
    if (renamed) await renameFileWithRetry(siteId, oldFileId, currentName, label).catch((err) => console.log(`❌ [${label}] restauration du nom échouée : ${err.message}`));
    return { status: 'error' };
  }
}

async function buildTargets() {
  const targets = [];

  const collectivities = await Collectivity.find({ aggregation_excel_file_id: { $exists: true, $nin: [null, ''] } });
  for (const collectivity of collectivities) {
    targets.push({
      label: collectivity.name,
      oldFileId: collectivity.aggregation_excel_file_id,
      folderId: collectivity.sharepoint_folder_id,
      baseName: `${collectivity.name} - Aggregation`,
      saveNewFileId: async (newFileId) => Collectivity.updateOne({ _id: collectivity._id }, { $set: { aggregation_excel_file_id: newFileId } }),
    });
  }

  const actors = await EconomicActor.find({ 'collectivities.aggregation_excel_file_id': { $exists: true, $nin: [null, ''] } });
  for (const actor of actors) {
    for (const entry of actor.collectivities || []) {
      if (!entry.aggregation_excel_file_id) continue;
      const collectivity = await Collectivity.findById(entry.id);
      targets.push({
        label: `${actor.name} / ${entry.name}`,
        oldFileId: entry.aggregation_excel_file_id,
        folderId: collectivity?.sharepoint_folder_id,
        baseName: `${actor.name} - ${entry.name} - Aggregation`,
        saveNewFileId: async (newFileId) => EconomicActor.updateOne({ _id: actor._id, 'collectivities.id': entry.id }, { $set: { 'collectivities.$.aggregation_excel_file_id': newFileId } }),
      });
    }
  }

  return targets;
}

(async () => {
  console.log(`Mode : ${DRY_RUN ? 'DRY-RUN (aucune écriture)' : 'MIGRATION RÉELLE'} — template V5 : ${aggregationTemplateFileId}`);
  await mongoose.connect(config.MONGODB_ENDPOINT);
  console.log('Connecté à MongoDB');

  const siteId = await getSiteId();
  // IDs présents dans le template V5 (colonne D), pour signaler en dry-run les valeurs qui ne seraient pas transférées
  const templateIds = new Set(((await readInputSheet(siteId, aggregationTemplateFileId)).idRows).map((r) => (r?.[0] != null ? String(r[0]).trim() : '')).filter(Boolean));
  console.log(`${templateIds.size} ID(s) dans le template V5`);
  const targets = (await buildTargets()).filter((t) => !ONLY || t.label.toLowerCase().includes(ONLY.toLowerCase()));
  console.log(`${targets.length} fichier(s) d'agrégation à examiner${ONLY ? ` (filtre "${ONLY}")` : ''}\n`);

  const counts = { migrated: 0, already: 0, 'dry-run': 0, skipped: 0, error: 0 };
  for (let i = 0; i < targets.length; i++) {
    let status;
    try {
      status = (await migrateTarget(siteId, targets[i], templateIds)).status;
    } catch (e) {
      console.log(`❌ [${targets[i].label}] erreur inattendue (${e.message}) → cible suivante`);
      status = 'error';
    }
    counts[status]++;
    // Laisser respirer Excel Online entre deux migrations réelles
    if (status === 'migrated' || status === 'error') {
      if (i < targets.length - 1) await sleep(PAUSE_BETWEEN_TARGETS_MS);
    }
  }

  console.log(`\nTerminé — migrés: ${counts.migrated}, déjà migrés: ${counts.already}, dry-run: ${counts['dry-run']}, ignorés: ${counts.skipped}, erreurs: ${counts.error}`);
  await mongoose.disconnect();
  process.exit(counts.error > 0 ? 1 : 0);
})().catch((e) => {
  console.error('Erreur fatale :', e);
  process.exit(1);
});
