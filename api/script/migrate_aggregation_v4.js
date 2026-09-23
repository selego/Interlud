/**
 * Migration des fichiers d'agrégation vers le template V5 (Agrégation résultats charte_V5.xlsx).
 *
 * Pour chaque collectivité (et chaque entrée collectivité d'un acteur éco) ayant un fichier d'agrégation :
 *  1. Lit les valeurs saisies dans "1. Données d'entrée" (colonnes I:K, lignes identifiées par l'ID en colonne D)
 *  2. Renomme l'ancien fichier en "..._OLD_V4.xlsx" (backup)
 *  3. Duplique le template V5 sous le nom "... - Aggregation_V5.xlsx" dans le dossier SharePoint de la collectivité
 *  4. Réécrit les valeurs dans le nouveau fichier par correspondance d'ID, puis recalcule le workbook
 *  5. Met à jour aggregation_excel_file_id en base (seulement après succès complet)
 *
 * Relançable : une cible dont le fichier en base finit déjà par "_V5.xlsx" est sautée. En cas d'échec, la copie V5
 * est supprimée et l'ancien fichier retrouve son nom, pour que la relance reparte d'un état propre.
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

// Supprime la copie V5 laissée par un échec, par id si connu, sinon par nom dans le dossier
async function deleteNewCopy(siteId, folderId, newFileId, newFileName) {
  let id = newFileId;
  if (!id) {
    const escapedName = newFileName.replace(/'/g, "''");
    id = ((await graphFetch(`/sites/${siteId}/drive/items/${folderId}/children?$filter=name eq '${escapedName}'`)).value || [])[0]?.id;
  }
  if (!id) return;
  await graphFetch(`/sites/${siteId}/drive/items/${id}`, { method: 'DELETE' });
}

// Écrit les valeurs dans le nouveau fichier par correspondance d'ID en colonne D (un seul PATCH I:K)
async function writeValues(siteId, newFileId, filled) {
  const { idRows, valueRows } = await readInputSheet(siteId, newFileId);

  const idRowMap = new Map();
  for (let i = 0; i < idRows.length; i++) {
    const id = idRows[i]?.[0] != null && idRows[i][0] !== '' ? String(idRows[i][0]).trim() : '';
    if (id) idRowMap.set(id, i);
  }

  const unmatched = [...filled.keys()].filter((id) => !idRowMap.has(id));
  const matched = [...filled.entries()].filter(([id]) => idRowMap.has(id));
  if (!matched.length) return { written: 0, unmatched };

  const rowIndexes = matched.map(([id]) => idRowMap.get(id));
  const min = Math.min(...rowIndexes);
  const max = Math.max(...rowIndexes);

  // Matrice I:K complète sur min..max : valeurs existantes du template, écrasées par les valeurs migrées
  const matrix = [];
  for (let i = min; i <= max; i++) matrix.push([valueRows[i]?.[0] ?? '', valueRows[i]?.[1] ?? '', valueRows[i]?.[2] ?? '']);
  let written = 0;
  for (const [id, values] of matched) {
    const row = matrix[idRowMap.get(id) - min];
    for (let c = 0; c < 3; c++) {
      if (values[c] === '' || values[c] == null) continue;
      row[c] = values[c];
      written++;
    }
  }

  await graphFetch(`${sheetPath(siteId, newFileId)}/range(address='${VALUE_COLS[0]}${min + 1}:${VALUE_COLS[2]}${max + 1}')`, {
    method: 'PATCH',
    body: JSON.stringify({ values: matrix }),
  });

  return { written, unmatched };
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

  let filled;
  try {
    const { idRows, valueRows } = await readInputSheet(siteId, oldFileId);
    filled = extractFilledValues(idRows, valueRows);
  } catch (e) {
    console.log(`⚠️  [${label}] lecture de l'ancien fichier impossible (${e.message}) → ignoré`);
    return { status: 'error' };
  }

  if (DRY_RUN) {
    const unmatched = [...filled.keys()].filter((id) => !templateIds.has(id));
    console.log(`🔎 [${label}] ${filled.size} ligne(s) avec valeurs à transférer depuis "${currentName}"${unmatched.length ? ` — ${unmatched.length} ID(s) absents du template V5 : ${unmatched.join(', ')}` : ''}`);
    return { status: 'dry-run', count: filled.size };
  }

  // Backup : l'ancien fichier prend le nom _OLD_V4 (sauf s'il le porte déjà, cas d'une migration interrompue)
  if (currentName !== oldName) await renameFile(siteId, oldFileId, oldName);

  let newFileId;
  try {
    newFileId = await duplicateExcelFile(newFileName, folderId, aggregationTemplateFileId);
    await warmUpWorkbook(siteId, newFileId, label);
    const { written, unmatched } = await writeValues(siteId, newFileId, filled);
    if (unmatched.length) console.log(`⚠️  [${label}] IDs non trouvés dans le V5 (valeurs non transférées) :`, unmatched);
    await calculateWorkbook(newFileId).catch((e) => console.log(`⚠️  [${label}] recalcul échoué : ${e.message}`));
    await saveNewFileId(newFileId);
    console.log(`✅ [${label}] migré → ${newFileId} (${written} cellule(s) transférée(s), ancien fichier : ${oldName})`);
    return { status: 'migrated' };
  } catch (e) {
    console.log(`❌ [${label}] échec (${e.message}) → suppression de la copie V5 et restauration du nom de l'ancien fichier`);
    await deleteNewCopy(siteId, folderId, newFileId, newFileName).catch((err) => console.log(`❌ [${label}] suppression de la copie V5 échouée : ${err.message}`));
    if (currentName !== oldName) await renameFile(siteId, oldFileId, currentName).catch((err) => console.log(`❌ [${label}] restauration du nom échouée : ${err.message}`));
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
    const { status } = await migrateTarget(siteId, targets[i], templateIds);
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
