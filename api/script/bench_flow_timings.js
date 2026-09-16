/**
 * Benchmark du flow "update d'une IndicatorValue" : mesure le temps de chaque étage
 * (Mongo, écriture cellule Excel, recalcul, agrégation, lectures dashboard) pour identifier
 * où part le temps entre la modif en base, les fichiers Excel SharePoint et les dashboards.
 *
 * SANS EFFET DE BORD :
 *  - Mongo : lectures uniquement (mêmes requêtes que le PUT /indicator_value/:id)
 *  - Excel : PATCH idempotents (relit la valeur brute de la cellule et réécrit exactement la même)
 *
 * Usage (depuis api/) : node script/bench_flow_timings.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const config = require('../src/config');
const Action = require('../src/models/action');
const IndicatorValue = require('../src/models/indicator_value');
const Indicator = require('../src/models/indicator');
const Collectivity = require('../src/models/collectivity');
const { graphFetch, getSiteId, getAccessToken, createWorkbookSession, closeWorkbookSession, calculateWorkbook } = require('../src/services/microsoftGraph');

const results = [];
const t = async (label, fn) => {
  const start = Date.now();
  try {
    const out = await fn();
    const ms = Date.now() - start;
    results.push({ label, ms });
    console.log(`  ${label.padEnd(70)} ${String(ms).padStart(6)} ms`);
    return out;
  } catch (e) {
    const ms = Date.now() - start;
    results.push({ label: `${label} (ERREUR: ${e.message})`, ms });
    console.log(`  ${label.padEnd(70)} ${String(ms).padStart(6)} ms  ❌ ${e.message}`);
    return null;
  }
};

(async () => {
  await mongoose.connect(config.MONGODB_ENDPOINT);
  console.log('Mongo connecté\n');

  // --- Échantillon : une action avec fichier Excel prev + collectivité avec fichier d'agrégation
  const collectivities = await Collectivity.find({ aggregation_excel_file_id: { $exists: true, $ne: null } });
  let action = null;
  let collectivity = null;
  for (const c of collectivities) {
    action = await Action.findOne({ collectivity_id: c._id.toString(), type: { $ne: 'config' }, owner: 'collectivity', 'exel_files_prev.0.excel_file_id': { $exists: true }, excel_worksheetname: { $exists: true, $ne: null } });
    if (action) {
      collectivity = c;
      break;
    }
  }
  if (!action) {
    console.error('Aucune action avec fichier Excel trouvée');
    process.exit(1);
  }
  const excelFile = action.exel_files_prev.find((f) => f.excel_file_id);
  const iv = await IndicatorValue.findOne({ action_id: action._id.toString(), situation: 'prev', indicator_type: 'number' });
  console.log(`Échantillon : collectivité "${collectivity.name}", action "${action.name}" (${action.excel_worksheetname}), fichier prev ${excelFile.excel_file_id}\n`);

  // ========== 1. MONGO : requêtes du PUT /indicator_value/:id (lectures uniquement) ==========
  console.log('--- 1. Mongo (lectures du flow PUT) ---');
  await t('IndicatorValue.findById', () => IndicatorValue.findById(iv._id));
  await t('Action.findById', () => Action.findById(action._id));
  await t('Collectivity.findById', () => Collectivity.findById(action.collectivity_id));
  await t('Indicator.findById', () => Indicator.findById(iv.indicator_id));
  await t('IndicatorValue.find({action_id}) [computeActionCompletion]', () => IndicatorValue.find({ action_id: action._id.toString() }));
  await t('Action.find({collectivity_id, type≠config}) [completion + stats]', () => Action.find({ collectivity_id: action.collectivity_id, type: { $ne: 'config' }, owner: 'collectivity' }));
  await t('IndicatorValue.find (sync autres IVs même indicateur/situation/année)', () => IndicatorValue.find({ indicator_id: iv.indicator_id, situation: iv.situation, year: iv.year, owner: iv.owner, collectivity_id: iv.collectivity_id }));

  // ========== 2. GRAPH : auth + session ==========
  console.log('\n--- 2. Graph : auth + session workbook (fichier action) ---');
  await t('getAccessToken (froid)', () => getAccessToken());
  const siteId = await t('getSiteId (froid)', () => getSiteId());
  const fileId = excelFile.excel_file_id;
  const sessionId = await t('createWorkbookSession (fichier action)', () => createWorkbookSession(fileId));
  const sh = sessionId ? { headers: { 'workbook-session-id': sessionId } } : {};

  // ========== 3. GRAPH : écriture cellule (flow flush excelSync) ==========
  console.log('\n--- 3. Graph : écriture cellule fichier action (flow flush) ---');
  const sheet = encodeURIComponent('Remplissage - Sit. Prev.');
  const usedRange = await t('usedRange feuille Remplissage (avec session)', () => graphFetch(`/sites/${siteId}/drive/items/${fileId}/workbook/worksheets/${sheet}/usedRange`, sh));
  await t('usedRange feuille Remplissage (SANS session, 2e appel)', () => graphFetch(`/sites/${siteId}/drive/items/${fileId}/workbook/worksheets/${sheet}/usedRange`));

  if (usedRange) {
    const rows = usedRange.values || [];
    const startRow = usedRange.address ? parseInt(usedRange.address.match(/\d+/)?.[0] || 1) : 1;
    const rowIndex = rows.findIndex((row) => row[4] && String(row[4]).trim());
    if (rowIndex !== -1) {
      const rawValue = rows[rowIndex][5] ?? '';
      const addr = `F${startRow + rowIndex}`;
      await t(`PATCH 1 cellule ${addr} (valeur identique, avec session)`, () => graphFetch(`/sites/${siteId}/drive/items/${fileId}/workbook/worksheets/${sheet}/range(address='${addr}')`, { method: 'PATCH', body: JSON.stringify({ values: [[rawValue]] }), ...sh }));
      // Plage de 10 lignes réécrites à l'identique (équivalent updateExcelCellsBatch)
      const endIdx = Math.min(rowIndex + 9, rows.length - 1);
      const rangeValues = [];
      for (let i = rowIndex; i <= endIdx; i++) rangeValues.push([rows[i]?.[5] ?? '']);
      await t(`PATCH plage F${startRow + rowIndex}:F${startRow + endIdx} (valeurs identiques, avec session)`, () => graphFetch(`/sites/${siteId}/drive/items/${fileId}/workbook/worksheets/${sheet}/range(address='F${startRow + rowIndex}:F${startRow + endIdx}')`, { method: 'PATCH', body: JSON.stringify({ values: rangeValues }), ...sh }));
    }
  }

  // ========== 4. GRAPH : recalcul + lecture Agrégation (flow writeAggregationTargets) ==========
  console.log('\n--- 4. Graph : recalcul + lecture feuille Agrégation du fichier action ---');
  await t('calculateWorkbook (avec session)', () => calculateWorkbook(fileId, sessionId));
  await t('usedRange feuille Agrégation (avec session)', () => graphFetch(`/sites/${siteId}/drive/items/${fileId}/workbook/worksheets/${encodeURIComponent('Agrégation')}/usedRange`, sh));
  await t('closeWorkbookSession (fichier action)', () => closeWorkbookSession(fileId, sessionId));

  // ========== 5. GRAPH : fichier d'agrégation collectivité ==========
  console.log("\n--- 5. Graph : fichier d'agrégation de la collectivité ---");
  const aggId = collectivity.aggregation_excel_file_id;
  const inputSheetPath = `/sites/${siteId}/drive/items/${aggId}/workbook/worksheets/${encodeURIComponent("1. Données d'entrée")}`;
  const inputRead = await t("lecture D1:D10000 (1. Données d'entrée, sans session)", () => graphFetch(`${inputSheetPath}/range(address='D1:D10000')`));
  if (inputRead) {
    // PATCH idempotent : relit une cellule I existante et réécrit la même valeur
    const idRow = (inputRead.values || []).findIndex((r) => r[0]);
    if (idRow !== -1) {
      const rowNum = idRow + 1;
      const cur = await t(`lecture I${rowNum} (valeur actuelle)`, () => graphFetch(`${inputSheetPath}/range(address='I${rowNum}')`));
      if (cur) await t(`PATCH I${rowNum} (valeur identique, sans session)`, () => graphFetch(`${inputSheetPath}/range(address='I${rowNum}')`, { method: 'PATCH', body: JSON.stringify({ values: [[cur.values?.[0]?.[0] ?? '']] }) }));
    }
  }

  // ========== 6. GRAPH : lectures dashboard ==========
  console.log('\n--- 6. Graph : lectures dashboards (fichier agrégation, sans session) ---');
  await t('global-gains : Agrégation B7:K39', () => graphFetch(`/sites/${siteId}/drive/items/${aggId}/workbook/worksheets/${encodeURIComponent('Agrégation')}/range(address='B7:K39')`));
  await t('action-contribution : Agrégation C40:H300', () => graphFetch(`/sites/${siteId}/drive/items/${aggId}/workbook/worksheets/${encodeURIComponent('Agrégation')}/range(address='C40:H300')`));
  const ws = action.excel_worksheetname;
  const GAINS_START = { B2: 19, B3: 76, B4: 133, C1: 190, C2: 247, C3: 304, C4: 361, C6: 418, C7: 475, C9: 532 }[ws] || 19;
  const EM_START = { B2: 21, B3: 78, B4: 135, C1: 192, C2: 249, C3: 306, C4: 363, C6: 420, C7: 477, C9: 534 }[ws] || 21;
  await t(`action_aggregation : gains A${GAINS_START}:CK${GAINS_START + 40}`, () => graphFetch(`/sites/${siteId}/drive/items/${aggId}/workbook/worksheets/${encodeURIComponent('4. Gains par action')}/range(address='A${GAINS_START}:CK${GAINS_START + 40}')`));
  await t(`action_aggregation : émissions A${EM_START}:CK${EM_START + 40}`, () => graphFetch(`/sites/${siteId}/drive/items/${aggId}/workbook/worksheets/${encodeURIComponent('3. Émissions par action')}/range(address='A${EM_START}:CK${EM_START + 40}')`));
  await t('home_aggregation : émissions A21:AQ574 (plage complète)', () => graphFetch(`/sites/${siteId}/drive/items/${aggId}/workbook/worksheets/${encodeURIComponent('3. Émissions par action')}/range(address='A21:AQ574')`));
  await t('home_aggregation : 2e appel identique (cache SharePoint ?)', () => graphFetch(`/sites/${siteId}/drive/items/${aggId}/workbook/worksheets/${encodeURIComponent('3. Émissions par action')}/range(address='A21:AQ574')`));

  // ========== 7. GRAPH : lectures dashboard sous session partagée ==========
  console.log('\n--- 7. Graph : mêmes lectures dashboard sous UNE session workbook ---');
  const aggSession = await t('createWorkbookSession (fichier agrégation)', () => createWorkbookSession(aggId));
  const aggSh = aggSession ? { headers: { 'workbook-session-id': aggSession } } : {};
  await t('global-gains B7:K39 (avec session)', () => graphFetch(`/sites/${siteId}/drive/items/${aggId}/workbook/worksheets/${encodeURIComponent('Agrégation')}/range(address='B7:K39')`, aggSh));
  await t('home_aggregation A21:AQ574 (avec session)', () => graphFetch(`/sites/${siteId}/drive/items/${aggId}/workbook/worksheets/${encodeURIComponent('3. Émissions par action')}/range(address='A21:AQ574')`, aggSh));
  await t(`action_aggregation gains A${GAINS_START}:CK${GAINS_START + 40} (avec session)`, () => graphFetch(`/sites/${siteId}/drive/items/${aggId}/workbook/worksheets/${encodeURIComponent('4. Gains par action')}/range(address='A${GAINS_START}:CK${GAINS_START + 40}')`, aggSh));
  await t('closeWorkbookSession (fichier agrégation)', () => closeWorkbookSession(aggId, aggSession));

  // ========== RÉCAP ==========
  console.log('\n========== RÉCAP (trié par durée) ==========');
  for (const r of [...results].sort((a, b) => b.ms - a.ms)) console.log(`  ${String(r.ms).padStart(6)} ms  ${r.label}`);
  const mongoTotal = results.filter((r) => r.label.match(/find|Find/i) && !r.label.includes('Graph')).slice(0, 7).reduce((s, r) => s + r.ms, 0);
  console.log(`\nTotal des 7 lectures Mongo du flow PUT : ~${mongoTotal} ms (le PUT réel en fait ~12-15 séquentielles, écritures comprises)`);

  await mongoose.disconnect();
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
