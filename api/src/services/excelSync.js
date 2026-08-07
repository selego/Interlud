const Action = require('../models/action');
const Collectivity = require('../models/collectivity');
const EconomicActor = require('../models/economic_actor');
const { graphFetch, getSiteId, updateExcelCellsBatch, calculateWorkbook, createWorkbookSession, closeWorkbookSession } = require('./microsoftGraph');
const { capture } = require('./sentry');

// Synchro Excel différée : les modifs d'indicateurs sont accumulées puis écrites en une passe,
// pour éviter de rejouer tout le pipeline SharePoint (écriture cellule + recalcul + agrégation) à chaque champ modifié.
const DEBOUNCE_MS = 5000;
// Plafond : si les modifs s'enchaînent sans pause, on flush quand même au bout de ce délai
const MAX_WAIT_MS = 30000;

const ACTION_AGREG_ROW = { B2: 12, B3: 13, B4: 14, C1: 15, C2: 16, C3: 17, C4: 18, C6: 19, C7: 20, C9: 21 };
const EMISSION_READ_COL = { GES: 3, PM: 8, NOx: 13, HC: 18, CO: 23, 'Énergie': 28 };
const EMISSION_WRITE_KEY = { 'Énergie': 'Nrj' };
// Column letter for aggregation: instance 1 → I, instance 2 → J, instance 3 → K, etc.
const getAggregationCol = (instanceNumber) => String.fromCharCode(72 + (instanceNumber || 1)); // 72 = 'H', so +1 = 'I'

const getAggregationFileId = async (action) => {
  if (action.owner === 'economic_actor' && action.economic_actor_id) {
    const actor = await EconomicActor.findById(action.economic_actor_id);
    const coll = actor?.collectivities?.find((c) => c.id === action.collectivity_id);
    return coll?.aggregation_excel_file_id || null;
  }
  const collectivityDoc = await Collectivity.findById(action.collectivity_id);
  return collectivityDoc?.aggregation_excel_file_id || null;
};

// Build the list of aggregation-file rows to update based on the modified situation/year.
// Each target = { sourceFileId, sourceColOffset, sitLabel, targetYear }
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
    return targets;
  }

  if (situation === 'expost') {
    const f = (action.excel_files_expost || []).find((file) => file.excel_file_id && file.year_expost === year);
    if (f) targets.push({ sourceFileId: f.excel_file_id, sourceColOffset: 3, sitLabel: 'Expost', targetYear: year });
    return targets;
  }

  return targets;
};

// Read source Agrégation sheets and PATCH the aggregation file rows.
const writeAggregationTargets = async (action, targets) => {
  if (!targets.length) return;
  const agregRow = ACTION_AGREG_ROW[action.excel_worksheetname];
  if (agregRow === undefined) return;

  const aggregationFileId = await getAggregationFileId(action);
  if (!aggregationFileId) return;

  const siteId = await getSiteId();
  const inputSheetPath = `/sites/${siteId}/drive/items/${aggregationFileId}/workbook/worksheets/${encodeURIComponent("1. Données d'entrée")}`;
  // IDs en colonne D — plage fixe pour ne pas dépendre du point de départ de la usedRange
  const inputResult = await graphFetch(`${inputSheetPath}/range(address='D1:D10000')`);
  const inputRows = inputResult.values || [];
  const idRowMap = new Map();
  for (let i = 0; i < inputRows.length; i++) {
    const id = inputRows[i][0];
    if (id) idRowMap.set(String(id).trim(), i + 1);
  }

  const targetsByFile = new Map();
  for (const t of targets) {
    if (!targetsByFile.has(t.sourceFileId)) targetsByFile.set(t.sourceFileId, []);
    targetsByFile.get(t.sourceFileId).push(t);
  }

  // Recalcul + lecture de la feuille Agrégation de chaque fichier source, en parallèle et sous session workbook
  // (la session garantit que la lecture voit l'état recalculé, et évite le coût d'une session éphémère par appel)
  const rowsByFile = new Map();
  await Promise.all(
    [...targetsByFile.keys()].map(async (sourceFileId) => {
      let sessionId = null;
      try {
        sessionId = await createWorkbookSession(sourceFileId);
        await calculateWorkbook(sourceFileId, sessionId).catch(() => {});
        const result = await graphFetch(`/sites/${siteId}/drive/items/${sourceFileId}/workbook/worksheets/${encodeURIComponent('Agrégation')}/usedRange`, sessionId ? { headers: { 'workbook-session-id': sessionId } } : {});
        rowsByFile.set(sourceFileId, result.values || []);
      } catch (e) {
        capture(e);
      } finally {
        await closeWorkbookSession(sourceFileId, sessionId).catch(() => {});
      }
    }),
  );

  // Collecte de toutes les cellules à écrire (ligne -> valeur), colonne unique par instance
  const cellWrites = new Map();
  for (const [sourceFileId, fileTargets] of targetsByFile) {
    const rows = rowsByFile.get(sourceFileId);
    if (!rows || !rows[agregRow]) continue;

    for (const target of fileTargets) {
      for (const [emission, baseCol] of Object.entries(EMISSION_READ_COL)) {
        const rawValue = rows[agregRow][baseCol + target.sourceColOffset];
        const writeKey = EMISSION_WRITE_KEY[emission] || emission;
        const rowNum = idRowMap.get(`${action.excel_worksheetname}-${writeKey}-${target.sitLabel}-${target.targetYear}`);
        if (rowNum === undefined) continue;
        cellWrites.set(rowNum, String(rawValue).includes('#N/A') ? '' : rawValue);
      }
    }
  }
  if (cellWrites.size === 0) return;

  // Écriture par plages de lignes consécutives : un PATCH par plage au lieu d'un par cellule
  const agregCol = getAggregationCol(action.instance_number);
  const runs = [];
  for (const rowNum of [...cellWrites.keys()].sort((a, b) => a - b)) {
    if (runs.length > 0 && rowNum === runs[runs.length - 1].end + 1) {
      runs[runs.length - 1].end = rowNum;
      continue;
    }
    runs.push({ start: rowNum, end: rowNum });
  }
  for (const run of runs) {
    const values = [];
    for (let r = run.start; r <= run.end; r++) values.push([cellWrites.get(r)]);
    await graphFetch(`${inputSheetPath}/range(address='${agregCol}${run.start}:${agregCol}${run.end}')`, { method: 'PATCH', body: JSON.stringify({ values }) });
  }
};

let pendingCells = new Map(); // `${fileId}|${situation}` -> Map<excelIndicatorId, { excel_indicator_id, value, unit }>
let pendingAggregations = new Map(); // `${actionId}|${situation}|${year}` -> { actionId, situation, year }
const pendingSyncActionIds = new Set(); // actions dont le dashboard n'est pas encore à jour (en attente ou en cours de flush)
let flushTimer = null;
let oldestPendingAt = null;
let flushChain = Promise.resolve();

const scheduleFlush = () => {
  if (oldestPendingAt === null) oldestPendingAt = Date.now();
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(startFlush, Math.min(DEBOUNCE_MS, Math.max(0, oldestPendingAt + MAX_WAIT_MS - Date.now())));
};

const startFlush = () => {
  flushTimer = null;
  oldestPendingAt = null;
  const cells = pendingCells;
  const aggregations = pendingAggregations;
  pendingCells = new Map();
  pendingAggregations = new Map();
  // Chaîné pour ne jamais exécuter deux flushs en parallèle (écritures potentielles sur les mêmes fichiers)
  flushChain = flushChain.then(() => flush(cells, aggregations)).catch(capture);
};

const flush = async (cells, aggregations) => {
  const updatesByFile = new Map();
  for (const [key, updates] of cells) {
    const [fileId, situation] = key.split('|');
    if (!updatesByFile.has(fileId)) updatesByFile.set(fileId, []);
    updatesByFile.get(fileId).push({ situation, updates: [...updates.values()] });
  }

  await Promise.all(
    [...updatesByFile.entries()].map(async ([fileId, groups]) => {
      let sessionId = null;
      try {
        sessionId = await createWorkbookSession(fileId);
        // catch par groupe : l'échec d'une situation ne doit pas sauter les autres
        for (const group of groups) await updateExcelCellsBatch(fileId, group.updates, group.situation, sessionId).catch(capture);
      } catch (e) {
        capture(e);
      } finally {
        await closeWorkbookSession(fileId, sessionId).catch(() => {});
      }
    }),
  );

  // Agrégations après les cellules : les feuilles Agrégation dépendent des valeurs écrites ci-dessus
  for (const agg of aggregations.values()) {
    try {
      const action = await Action.findById(agg.actionId);
      if (!action) continue;
      await writeAggregationTargets(action, buildAggregationTargets(action, agg.situation, agg.year));
    } catch (e) {
      capture(e);
    } finally {
      // Ne libère le statut que si l'action n'a pas été re-modifiée pendant le flush
      if (![...pendingAggregations.keys()].some((k) => k.startsWith(`${agg.actionId}|`))) pendingSyncActionIds.delete(agg.actionId);
    }
  }
};

// Enregistre une valeur de cellule à écrire dans un fichier Excel d'action (colonne F de la feuille de la situation).
// Une nouvelle valeur pour le même indicateur/fichier/situation écrase la précédente en attente.
const enqueueCellUpdate = ({ fileId, situation, excelIndicatorId, value, unit }) => {
  if (!fileId || !excelIndicatorId) return;
  const key = `${fileId}|${situation}`;
  if (!pendingCells.has(key)) pendingCells.set(key, new Map());
  pendingCells.get(key).set(String(excelIndicatorId), { excel_indicator_id: excelIndicatorId, value, unit });
  scheduleFlush();
};

// Enregistre une propagation vers le fichier d'agrégation de la collectivité (dédupliquée par action/situation/année)
const enqueueAggregation = ({ actionId, situation, year }) => {
  if (!actionId) return;
  pendingAggregations.set(`${actionId}|${situation}|${year}`, { actionId: String(actionId), situation, year });
  pendingSyncActionIds.add(String(actionId));
  scheduleFlush();
};

// Le dashboard de cette action reflète-t-il les dernières modifs ?
const isSyncPending = (actionId) => pendingSyncActionIds.has(String(actionId));

module.exports = { enqueueCellUpdate, enqueueAggregation, isSyncPending };
