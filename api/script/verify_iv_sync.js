/**
 * Vérifie la cohérence base ↔ Excel action ↔ Excel d'agrégation après modification d'indicateurs.
 * Lectures uniquement (Mongo + Graph sous session cachée). Rejoue la même logique de ciblage des fichiers
 * que PUT /indicator_value/:id et la même logique d'agrégation qu'excelSync.
 *
 * Usage (depuis api/) :
 *   node script/verify_iv_sync.js --action=<id> --situation=init --year=2023 [--ids=ALNombreTot,ALHDP] [--since=10]
 *   --ids   : excel_indicator_ids à vérifier (défaut : IVs modifiées depuis --since minutes, défaut 10)
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const config = require('../src/config');
const Action = require('../src/models/action');
const Indicator = require('../src/models/indicator');
const IndicatorValue = require('../src/models/indicator_value');
const Collectivity = require('../src/models/collectivity');
const { graphFetchWithSession, getSiteId } = require('../src/services/microsoftGraph');
const { isPercentUnit } = require('../src/utils/indicators');

const arg = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const ACTION_ID = arg('action');
const SITUATION = arg('situation');
const YEAR = parseInt(arg('year'));
const IDS = arg('ids')?.split(',');
const SINCE_MIN = parseInt(arg('since') || '10');
if (!ACTION_ID || !SITUATION || !YEAR) {
  console.error('Usage : node script/verify_iv_sync.js --action=<id> --situation=<init|ref|prev|expost> --year=<yyyy> [--ids=A,B] [--since=10]');
  process.exit(1);
}

const WORKSHEETS = { init: 'Remplissage - Sit. Init.', ref: 'Remplissage - Sit. Ref.', prev: 'Remplissage - Sit. Prev.', expost: 'Remplissage - Sit. Expost' };
const ACTION_AGREG_ROW = { B2: 12, B3: 13, B4: 14, C1: 15, C2: 16, C3: 17, C4: 18, C6: 19, C7: 20, C9: 21 };
const EMISSION_READ_COL = { GES: 3, PM: 8, NOx: 13, HC: 18, CO: 23, 'Énergie': 28 };
const EMISSION_WRITE_KEY = { 'Énergie': 'Nrj' };
const getAggregationCol = (n) => String.fromCharCode(72 + (n || 1));

let ok = 0;
let ko = 0;
const check = (label, expected, actual) => {
  const norm = (v) => (v === null || v === undefined ? '' : typeof v === 'number' ? v : String(v));
  let same = norm(expected) === norm(actual);
  if (typeof expected === 'number' && typeof actual === 'number') same = Math.abs(expected - actual) < 1e-9;
  if (typeof expected === 'number' && typeof actual === 'string' && actual !== '') same = Math.abs(expected - parseFloat(actual)) < 1e-9;
  if (same) ok++;
  if (!same) ko++;
  console.log(`  ${same ? '✅' : '❌'} ${label.padEnd(60)} attendu=${JSON.stringify(expected)}  excel=${JSON.stringify(actual)}`);
};

// Fichiers cibles d'une IV : même logique que PUT /indicator_value/:id
const targetFilesFor = (action, situation, year) => {
  const files = [];
  if (situation === 'init') for (const f of [...(action.exel_files_prev || []), ...(action.excel_files_expost || [])]) if (f.excel_file_id) files.push(f.excel_file_id);
  if (situation === 'prev') for (const f of action.exel_files_prev || []) if (f.excel_file_id && f.year_prev === year) files.push(f.excel_file_id);
  if (situation === 'ref') {
    for (const f of action.exel_files_prev || []) if (f.excel_file_id && f.year_ref === year) files.push(f.excel_file_id);
    for (const f of action.excel_files_expost || []) if (f.excel_file_id && f.year_ref === year) files.push(f.excel_file_id);
  }
  if (situation === 'expost') for (const f of action.excel_files_expost || []) if (f.excel_file_id && f.year_expost === year) files.push(f.excel_file_id);
  return files;
};

// Cibles d'agrégation : même logique qu'excelSync.buildAggregationTargets
const buildAggregationTargets = (action, situation, year) => {
  const targets = [];
  const allFiles = [...(action.exel_files_prev || []), ...(action.excel_files_expost || [])];
  if (situation === 'init') {
    for (const f of action.exel_files_prev || []) {
      if (!f.excel_file_id) continue;
      if (action.year_init != null) targets.push({ sourceFileId: f.excel_file_id, sourceColOffset: 0, sitLabel: 'Init', targetYear: action.year_init });
      if (f.year_ref != null) targets.push({ sourceFileId: f.excel_file_id, sourceColOffset: 1, sitLabel: 'Réf', targetYear: f.year_ref });
      if (f.year_prev != null) targets.push({ sourceFileId: f.excel_file_id, sourceColOffset: 2, sitLabel: 'Prév', targetYear: f.year_prev });
    }
    for (const f of action.excel_files_expost || []) {
      if (!f.excel_file_id) continue;
      if (action.year_init != null) targets.push({ sourceFileId: f.excel_file_id, sourceColOffset: 0, sitLabel: 'Init', targetYear: action.year_init });
      if (f.year_ref != null) targets.push({ sourceFileId: f.excel_file_id, sourceColOffset: 1, sitLabel: 'Réf', targetYear: f.year_ref });
      if (f.year_expost != null) targets.push({ sourceFileId: f.excel_file_id, sourceColOffset: 3, sitLabel: 'Expost', targetYear: f.year_expost });
    }
    return targets;
  }
  if (situation === 'ref') {
    const refFile = allFiles.find((f) => f.excel_file_id && f.year_ref === year);
    if (refFile) targets.push({ sourceFileId: refFile.excel_file_id, sourceColOffset: 1, sitLabel: 'Réf', targetYear: year });
    const prevFile = (action.exel_files_prev || []).find((f) => f.excel_file_id && f.year_prev === year);
    if (prevFile) targets.push({ sourceFileId: prevFile.excel_file_id, sourceColOffset: 2, sitLabel: 'Prév', targetYear: year });
    const expostFile = (action.excel_files_expost || []).find((f) => f.excel_file_id && f.year_expost === year);
    if (expostFile) targets.push({ sourceFileId: expostFile.excel_file_id, sourceColOffset: 3, sitLabel: 'Expost', targetYear: year });
    return targets;
  }
  if (situation === 'prev') {
    const f = (action.exel_files_prev || []).find((file) => file.excel_file_id && file.year_prev === year);
    if (f) targets.push({ sourceFileId: f.excel_file_id, sourceColOffset: 2, sitLabel: 'Prév', targetYear: year });
  }
  if (situation === 'expost') {
    const f = (action.excel_files_expost || []).find((file) => file.excel_file_id && file.year_expost === year);
    if (f) targets.push({ sourceFileId: f.excel_file_id, sourceColOffset: 3, sitLabel: 'Expost', targetYear: year });
  }
  return targets;
};

(async () => {
  await mongoose.connect(config.MONGODB_ENDPOINT);
  const siteId = await getSiteId();
  const action = await Action.findById(ACTION_ID);
  if (!action) throw new Error('action introuvable');
  const collectivity = await Collectivity.findById(action.collectivity_id);
  const aggregationFileId = collectivity?.aggregation_excel_file_id;

  const ivQuery = { action_id: ACTION_ID, situation: SITUATION, year: YEAR };
  if (IDS) ivQuery.indicator_excel_id = { $in: IDS };
  if (!IDS) ivQuery.updatedAt = { $gte: new Date(Date.now() - SINCE_MIN * 60 * 1000) };
  const ivs = await IndicatorValue.find(ivQuery);
  console.log(`\nAction "${action.name}" (${action.type}, ${action.excel_worksheetname || '-'}, inst ${action.instance_number}) — ${SITUATION} ${YEAR} — ${ivs.length} IV(s) à vérifier\n`);

  // Actions dont les fichiers reçoivent les valeurs (config : toutes les actions de même année, comme le PUT)
  let targetActions = [action];
  if (action.type === 'config') {
    const ownerFilter = { owner: action.owner, collectivity_id: action.collectivity_id, type: { $ne: 'config' } };
    if (SITUATION === 'ref') targetActions = await Action.find({ ...ownerFilter, $or: [{ 'exel_files_prev.year_ref': YEAR }, { 'excel_files_expost.year_ref': YEAR }] });
    if (SITUATION === 'prev') targetActions = await Action.find({ ...ownerFilter, 'exel_files_prev.year_prev': YEAR });
    if (SITUATION === 'expost') targetActions = await Action.find({ ...ownerFilter, 'excel_files_expost.year_expost': YEAR });
    if (SITUATION === 'init') targetActions = await Action.find({ ...ownerFilter, year_init: YEAR, 'exel_files_prev.0.excel_file_id': { $exists: true } });
    console.log(`Action config → ${targetActions.length} action(s) cible(s) : ${targetActions.map((a) => `${a.excel_worksheetname}#${a.instance_number}`).join(', ')}\n`);
  }

  // ===== 1. Base → cellules F des fichiers action =====
  console.log('=== 1. Valeur en base vs cellule Excel (colonne F, feuille de la situation) ===');
  const sheetCache = new Map();
  const readSheet = async (fileId) => {
    const key = `${fileId}|${SITUATION}`;
    if (sheetCache.has(key)) return sheetCache.get(key);
    const r = await graphFetchWithSession(fileId, `/sites/${siteId}/drive/items/${fileId}/workbook/worksheets/${encodeURIComponent(WORKSHEETS[SITUATION])}/usedRange`);
    const startRow = r.address ? parseInt(r.address.match(/\d+/)?.[0] || 1) : 1;
    const map = new Map();
    (r.values || []).forEach((row, i) => {
      if (row[4]) map.set(String(row[4]).trim(), { value: row[5], row: startRow + i });
    });
    sheetCache.set(key, map);
    return map;
  };

  for (const iv of ivs) {
    const indicator = await Indicator.findById(iv.indicator_id);
    const raw = iv.value?.[iv.indicator_type];
    let expected = raw;
    if (iv.indicator_type === 'number' && isPercentUnit(indicator?.value_unit) && typeof raw === 'number') expected = raw / 100;
    if (Array.isArray(raw)) expected = raw.join(', ');
    if (expected === null || expected === undefined) expected = '';
    console.log(`\n▶ ${iv.indicator_excel_id} (${iv.indicator_type}${indicator?.value_unit ? ', ' + indicator.value_unit : ''}) — base = ${JSON.stringify(raw)} — modifiée ${iv.updatedAt.toLocaleTimeString()}`);
    for (const ta of targetActions) {
      for (const fileId of targetFilesFor(ta, SITUATION, YEAR)) {
        const cell = (await readSheet(fileId)).get(String(iv.indicator_excel_id).trim());
        if (!cell) {
          console.log(`  ⚠️  ${ta.excel_worksheetname}#${ta.instance_number} ${fileId.slice(-8)} : ID absent de la feuille`);
          continue;
        }
        check(`${ta.excel_worksheetname}#${ta.instance_number} fichier …${fileId.slice(-8)} F${cell.row}`, expected, cell.value);
      }
    }
  }

  // ===== 2. Feuille Agrégation des fichiers action → fichier d'agrégation (1. Données d'entrée) =====
  console.log("\n=== 2. Feuille Agrégation (source) vs fichier d'agrégation (1. Données d'entrée) ===");
  if (!aggregationFileId) {
    console.log("  ⚠️  Pas de fichier d'agrégation");
  }
  if (aggregationFileId) {
    const inputPath = `/sites/${siteId}/drive/items/${aggregationFileId}/workbook/worksheets/${encodeURIComponent("1. Données d'entrée")}`;
    const inputRead = await graphFetchWithSession(aggregationFileId, `${inputPath}/range(address='D1:K10000')`);
    const idRowMap = new Map();
    (inputRead.values || []).forEach((row, i) => {
      if (row[0]) idRowMap.set(String(row[0]).trim(), i);
    });
    const inputRows = inputRead.values || [];

    for (const ta of targetActions) {
      const agregRow = ACTION_AGREG_ROW[ta.excel_worksheetname];
      if (agregRow === undefined) continue;
      const targets = buildAggregationTargets(ta, SITUATION, YEAR);
      const col = getAggregationCol(ta.instance_number);
      const colIdx = col.charCodeAt(0) - 'D'.charCodeAt(0);
      console.log(`\n▶ ${ta.excel_worksheetname}#${ta.instance_number} → colonne ${col}, ${targets.length} cible(s)`);
      for (const t of targets) {
        // Recalcul puis lecture, comme excelSync
        await graphFetchWithSession(t.sourceFileId, `/sites/${siteId}/drive/items/${t.sourceFileId}/workbook/application/calculate`, { method: 'POST', body: JSON.stringify({ calculationType: 'Recalculate' }) }).catch(() => {});
        const src = await graphFetchWithSession(t.sourceFileId, `/sites/${siteId}/drive/items/${t.sourceFileId}/workbook/worksheets/${encodeURIComponent('Agrégation')}/usedRange`);
        const rows = src.values || [];
        for (const [emission, baseCol] of Object.entries(EMISSION_READ_COL)) {
          const rawValue = rows[agregRow]?.[baseCol + t.sourceColOffset];
          const expected = String(rawValue).includes('#N/A') ? '' : rawValue;
          const key = `${ta.excel_worksheetname}-${EMISSION_WRITE_KEY[emission] || emission}-${t.sitLabel}-${t.targetYear}`;
          const rowIdx = idRowMap.get(key);
          if (rowIdx === undefined) {
            console.log(`  ⚠️  ${key} : ID absent du fichier d'agrégation`);
            continue;
          }
          check(`${key} (ligne ${rowIdx + 1})`, expected, inputRows[rowIdx]?.[colIdx]);
        }
      }
    }
  }

  console.log(`\n===== RÉSULTAT : ${ok} OK / ${ko} KO =====\n`);
  await mongoose.disconnect();
  process.exit(ko > 0 ? 2 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
