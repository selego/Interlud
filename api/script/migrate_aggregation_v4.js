/**
 * Migration des fichiers d'agrégation vers le template V4 (Agrégation résultats charte_V4.xlsx).
 *
 * Pour chaque collectivité (et chaque entrée collectivité d'un acteur éco) ayant un fichier d'agrégation :
 *  1. Lit les valeurs saisies dans "1. Données d'entrée" (colonnes I:K, lignes identifiées par l'ID en colonne D)
 *  2. Renomme l'ancien fichier en "..._OLD_V2.xlsx" (backup)
 *  3. Duplique le template V4 sous le nom canonique dans le dossier SharePoint de la collectivité
 *  4. Réécrit les valeurs dans le nouveau fichier par correspondance d'ID, puis recalcule le workbook
 *  5. Met à jour aggregation_excel_file_id en base (seulement après succès complet)
 *
 * Usage (depuis api/) :
 *   node script/migrate_aggregation_v4.js --dry-run   # rapport sans aucune écriture
 *   node script/migrate_aggregation_v4.js             # migration réelle
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

const sheetPath = (siteId, fileId) => `/sites/${siteId}/drive/items/${fileId}/workbook/worksheets/${encodeURIComponent(INPUT_SHEET)}`;

// Lit colonne D (IDs) + colonnes I:K d'un fichier d'agrégation
async function readInputSheet(siteId, fileId) {
  const idRows = (await graphFetch(`${sheetPath(siteId, fileId)}/range(address='D1:D${MAX_ROWS}')`)).values || [];
  const valueRows = (await graphFetch(`${sheetPath(siteId, fileId)}/range(address='I1:K${MAX_ROWS}')`)).values || [];
  return { idRows, valueRows };
}

// Extrait { id -> [I, J, K] } pour les lignes ayant au moins une valeur saisie.
// Exclut la ligne d'en-têtes (ID = 'ID', déjà présente dans le template V4) et le remplissage
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

async function migrateTarget(siteId, target) {
  const { label, oldFileId, folderId, fileName, saveNewFileId } = target;

  if (!folderId) {
    console.log(`⚠️  [${label}] pas de sharepoint_folder_id → ignoré`);
    return { status: 'skipped' };
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
    console.log(`🔎 [${label}] ${filled.size} ligne(s) avec valeurs à transférer`);
    return { status: 'dry-run', count: filled.size };
  }

  const oldName = `${fileName.replace(/\.xlsx$/, '')}_OLD_V2.xlsx`;
  await renameFile(siteId, oldFileId, oldName);

  let newFileId;
  try {
    newFileId = await duplicateExcelFile(fileName, folderId, aggregationTemplateFileId);
    const { written, unmatched } = await writeValues(siteId, newFileId, filled);
    if (unmatched.length) console.log(`⚠️  [${label}] IDs non trouvés dans le V4 (valeurs non transférées) :`, unmatched);
    await calculateWorkbook(newFileId).catch((e) => console.log(`⚠️  [${label}] recalcul échoué : ${e.message}`));
    await saveNewFileId(newFileId);
    console.log(`✅ [${label}] migré → ${newFileId} (${written} cellule(s) transférée(s), ancien fichier : ${oldName})`);
    return { status: 'migrated' };
  } catch (e) {
    console.log(`❌ [${label}] échec (${e.message}) → restauration du nom de l'ancien fichier`);
    await renameFile(siteId, oldFileId, fileName).catch((err) => console.log(`❌ [${label}] restauration du nom échouée : ${err.message}`));
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
      fileName: `${collectivity.name} - Aggregation.xlsx`,
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
        fileName: `${actor.name} - ${entry.name} - Aggregation.xlsx`,
        saveNewFileId: async (newFileId) => EconomicActor.updateOne({ _id: actor._id, 'collectivities.id': entry.id }, { $set: { 'collectivities.$.aggregation_excel_file_id': newFileId } }),
      });
    }
  }

  return targets;
}

(async () => {
  console.log(`Mode : ${DRY_RUN ? 'DRY-RUN (aucune écriture)' : 'MIGRATION RÉELLE'} — template V4 : ${aggregationTemplateFileId}`);
  await mongoose.connect(config.MONGODB_ENDPOINT);
  console.log('Connecté à MongoDB');

  const siteId = await getSiteId();
  const targets = await buildTargets();
  console.log(`${targets.length} fichier(s) d'agrégation à migrer\n`);

  const counts = { migrated: 0, 'dry-run': 0, skipped: 0, error: 0 };
  for (const target of targets) {
    const { status } = await migrateTarget(siteId, target);
    counts[status]++;
  }

  console.log(`\nTerminé — migrés: ${counts.migrated}, dry-run: ${counts['dry-run']}, ignorés: ${counts.skipped}, erreurs: ${counts.error}`);
  await mongoose.disconnect();
  process.exit(counts.error > 0 ? 1 : 0);
})().catch((e) => {
  console.error('Erreur fatale :', e);
  process.exit(1);
});
