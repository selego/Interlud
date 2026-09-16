/**
 * Migration one-shot : corrige les valeurs par défaut des indicateurs en % stockées en fraction.
 *
 * Contexte : Excel stocke les pourcentages en fraction (0.36 pour 36%). L'API convertit (×100) à la
 * relecture des défauts depuis l'Excel de la collectivité (depuis juin 2026), mais :
 *  - le script scrap_indicator_excel.js stockait le défaut du template brut (0.36) dans Indicator.value_default,
 *    et l'étape 4 (sync vers les actions existantes) créait des IndicatorValues avec ce défaut brut ;
 *  - les IVs créées avant le fix API ont un défaut relu depuis l'Excel mais non converti (ex: 0.3635).
 *
 * Ce que fait le script :
 *  1. Indicator.value_default.{init,ref,prev,expost}.number ×100 pour les indicateurs en % (type number)
 *  2. Pour chaque IV en % (type number, hors "Données de base") : relit le défaut dans l'Excel de l'action
 *     (même logique que l'API : fichier prev → init/ref/prev, fichier expost → ref/expost) et applique ×100.
 *     Sans fichier Excel : ×100 uniquement si le défaut de l'IV est encore égal au défaut brut de l'Indicator.
 *     Un défaut ≥ 1 en valeur absolue est considéré déjà converti et n'est pas touché (sauf s'il est égal au brut).
 *  3. Si la valeur saisie (value) était égale à l'ancien défaut (préremplissage), elle est remplacée par le
 *     nouveau défaut et la cellule Excel correspondante est réécrite (÷100 par updateExcelCellsBatch).
 *
 * ⚠️ Ne pas relancer sur une unité déjà migrée : l'étape 1 n'est pas idempotente.
 * Historique : "%" migré le 2026-09-07. Reste "% du PTAC" (reconnu comme pourcentage depuis isPercentUnit).
 *
 * Usage (depuis api/) :
 *   node script/migrate_percent_defaults.js --unit="% du PTAC" --dry-run   # rapport sans aucune écriture (Mongo ni Excel)
 *   node script/migrate_percent_defaults.js --unit="% du PTAC"             # migration réelle
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const config = require('../src/config');
const Indicator = require('../src/models/indicator');
const Action = require('../src/models/action');
const IndicatorValue = require('../src/models/indicator_value');
const { readExcelDefaultValues, updateExcelCellsBatch, createWorkbookSession, closeWorkbookSession } = require('../src/services/microsoftGraph');

const DRY_RUN = process.argv.includes('--dry-run');
// Unité exacte ciblée (--unit="% du PTAC"). Obligatoire : l'étape 1 n'étant pas rejouable, on migre une unité à la fois.
const UNIT = process.argv.find((a) => a.startsWith('--unit='))?.slice('--unit='.length);
if (!UNIT) {
  console.error('Usage : node script/migrate_percent_defaults.js --unit="% du PTAC" [--dry-run]');
  process.exit(1);
}

const parseDefaultValue = (rawValue) => {
  if (rawValue === null || rawValue === undefined || rawValue === '') return null;
  if (typeof rawValue === 'string' && rawValue.startsWith('#')) return null;
  const p = parseFloat(rawValue);
  if (isNaN(p)) return null;
  return p * 100;
};

const groupKey = (a) => `${a.collectivity_id}|${a.owner || 'collectivity'}|${a.economic_actor_id || ''}`;

(async () => {
  await mongoose.connect(config.MONGODB_ENDPOINT);
  console.log(`🔄 Migration des défauts en pourcentage, unité "${UNIT}" ${DRY_RUN ? '(DRY RUN)' : ''}\n`);

  // --- 1. Indicators ---
  const pctIndicators = await Indicator.find({ value_unit: UNIT, value_type: 'number' });
  const indicatorOps = [];
  for (const ind of pctIndicators) {
    const set = {};
    for (const sit of ['init', 'ref', 'prev', 'expost']) {
      const v = ind.value_default?.[sit]?.number;
      if (typeof v === 'number') set[`value_default.${sit}.number`] = v * 100;
    }
    if (Object.keys(set).length) indicatorOps.push({ updateOne: { filter: { _id: ind._id }, update: { $set: set } } });
  }
  console.log(`📋 ${pctIndicators.length} indicateurs "${UNIT}" (number), ${indicatorOps.length} avec un défaut à multiplier par 100`);
  const indMap = new Map(pctIndicators.map((i) => [i._id.toString(), i]));

  // --- 2. Lecture des défauts depuis les Excel de chaque action ---
  const userActions = await Action.find({ type: { $ne: 'config' } });
  const defaultsByAction = new Map(); // actionId -> Map<`${situation}|${year}`, Map<excelId, raw>>
  const defaultsByGroup = new Map(); // groupKey -> Map<`${situation}|${year}`, Map<excelId, raw>> (pour Parc types)
  let filesRead = 0;
  let filesFailed = 0;

  const readFile = async (fileId, pairs) => {
    const out = [];
    for (const { situation, year } of pairs) {
      try {
        out.push({ situation, year, defaults: await readExcelDefaultValues(fileId, situation) });
      } catch (e) {
        filesFailed++;
        console.log(`⚠️ Lecture impossible ${fileId} (${situation}) : ${e.message}`);
      }
    }
    filesRead++;
    return out;
  };

  for (const action of userActions) {
    const byKey = new Map();
    const reads = [];
    for (const f of action.exel_files_prev || []) {
      if (!f.excel_file_id) continue;
      const pairs = [];
      if (action.year_init != null) pairs.push({ situation: 'init', year: action.year_init });
      if (f.year_ref != null) pairs.push({ situation: 'ref', year: f.year_ref });
      if (f.year_prev != null) pairs.push({ situation: 'prev', year: f.year_prev });
      reads.push(readFile(f.excel_file_id, pairs));
    }
    for (const f of action.excel_files_expost || []) {
      if (!f.excel_file_id) continue;
      const pairs = [];
      if (f.year_ref != null) pairs.push({ situation: 'ref', year: f.year_ref });
      if (f.year_expost != null) pairs.push({ situation: 'expost', year: f.year_expost });
      reads.push(readFile(f.excel_file_id, pairs));
    }
    for (const results of await Promise.all(reads)) {
      for (const { situation, year, defaults } of results) if (!byKey.has(`${situation}|${year}`)) byKey.set(`${situation}|${year}`, defaults);
    }
    if (byKey.size === 0) continue;
    defaultsByAction.set(action._id.toString(), byKey);
    const gk = groupKey(action);
    if (!defaultsByGroup.has(gk)) defaultsByGroup.set(gk, new Map());
    const groupMap = defaultsByGroup.get(gk);
    for (const [k, v] of byKey) if (!groupMap.has(k)) groupMap.set(k, v);
  }
  console.log(`📋 ${filesRead} fichiers Excel lus (${filesFailed} feuilles en échec), ${defaultsByAction.size} actions avec défauts Excel`);

  // --- 3. IVs ---
  const ivs = await IndicatorValue.find({ indicator_id: { $in: [...indMap.keys()] }, indicator_type: 'number', indicator_category_name: { $ne: 'Données de base' } });
  const configActions = await Action.find({ type: 'config' });
  const configActionIds = new Set(configActions.map((a) => a._id.toString()));
  const actionById = new Map(userActions.map((a) => [a._id.toString(), a]));
  const configById = new Map(configActions.map((a) => [a._id.toString(), a]));

  const stats = { total: ivs.length, noDefault: 0, zero: 0, alreadyConverted: 0, fromExcel: 0, fromIndicator: 0, unresolvedNoYear: 0, unresolvedNoFile: 0, unresolvedNotInExcel: 0, unchanged: 0, defaultUpdated: 0, valueUpdated: 0 };
  const ivOps = [];
  const excelCells = new Map(); // `${fileId}|${situation}` -> Map<excelId, { excel_indicator_id, value, unit }>
  const samples = [];

  const queueCell = (fileId, situation, iv, value) => {
    const key = `${fileId}|${situation}`;
    if (!excelCells.has(key)) excelCells.set(key, new Map());
    excelCells.get(key).set(iv.indicator_excel_id, { excel_indicator_id: iv.indicator_excel_id, value, unit: UNIT });
  };

  // Fichiers Excel où une valeur doit être réécrite (même mapping que le PUT indicator_value)
  const targetFiles = (iv) => {
    const out = [];
    const actions = configActionIds.has(iv.action_id) ? userActions.filter((a) => groupKey(a) === groupKey(configById.get(iv.action_id))) : [actionById.get(iv.action_id)].filter(Boolean);
    for (const a of actions) {
      if (iv.situation === 'init' && a.year_init === iv.year) for (const f of [...(a.exel_files_prev || []), ...(a.excel_files_expost || [])]) if (f.excel_file_id) out.push(f.excel_file_id);
      if (iv.situation === 'ref') for (const f of [...(a.exel_files_prev || []), ...(a.excel_files_expost || [])]) if (f.excel_file_id && f.year_ref === iv.year) out.push(f.excel_file_id);
      if (iv.situation === 'prev') for (const f of a.exel_files_prev || []) if (f.excel_file_id && f.year_prev === iv.year) out.push(f.excel_file_id);
      if (iv.situation === 'expost') for (const f of a.excel_files_expost || []) if (f.excel_file_id && f.year_expost === iv.year) out.push(f.excel_file_id);
    }
    return [...new Set(out)];
  };

  for (const iv of ivs) {
    const currentDefault = iv.value_default?.number ?? null;
    const rawIndicatorDefault = indMap.get(iv.indicator_id)?.value_default?.[iv.situation]?.number ?? null;
    const key = `${iv.situation}|${iv.year}`;
    const defaultsMap = configActionIds.has(iv.action_id) ? defaultsByGroup.get(groupKey(configById.get(iv.action_id) || {}))?.get(key) : defaultsByAction.get(iv.action_id)?.get(key);

    // Rien à convertir : pas de défaut, ou défaut 0 (0 × 100 = 0)
    if (currentDefault === null) {
      stats.noDefault++;
      continue;
    }
    if (currentDefault === 0) {
      stats.zero++;
      continue;
    }
    // Déjà converti (|défaut| ≥ 1, ex : 36.35) sauf s'il porte encore le défaut brut de l'Indicator (ex : -1 pour -100%)
    if (Math.abs(currentDefault) >= 1 && currentDefault !== rawIndicatorDefault) {
      stats.alreadyConverted++;
      continue;
    }

    // Source du nouveau défaut : l'Excel de l'action en priorité, sinon le défaut brut de l'Indicator ×100 (si l'IV le porte encore)
    const excelDefault = defaultsMap && iv.indicator_excel_id && defaultsMap.has(iv.indicator_excel_id) ? parseDefaultValue(defaultsMap.get(iv.indicator_excel_id)) : null;
    const fromIndicator = excelDefault === null && rawIndicatorDefault !== null && currentDefault === rawIndicatorDefault;
    if (excelDefault === null && !fromIndicator) {
      if (iv.year == null) stats.unresolvedNoYear++;
      if (iv.year != null && !defaultsMap) stats.unresolvedNoFile++;
      if (iv.year != null && defaultsMap) stats.unresolvedNotInExcel++;
      if (iv.year != null && samples.length < 20) samples.push(`  ? non résolu ${iv.indicator_excel_id} ${iv.situation} ${iv.year} — ${iv.collectivity_name} / ${iv.action_name} : défaut ${currentDefault} (${!defaultsMap ? 'pas de fichier Excel' : 'absent de l’Excel'})`);
      continue;
    }
    if (fromIndicator) stats.fromIndicator++;
    if (!fromIndicator) stats.fromExcel++;
    const newDefault = fromIndicator ? rawIndicatorDefault * 100 : excelDefault;

    if (newDefault === currentDefault) {
      stats.unchanged++;
      continue;
    }

    const set = { 'value_default.number': newDefault };
    stats.defaultUpdated++;
    const currentValue = iv.value?.number ?? null;
    if (currentValue !== null && currentDefault !== null && currentValue === currentDefault) {
      set['value.number'] = newDefault;
      stats.valueUpdated++;
      if (newDefault !== null && iv.indicator_excel_id) for (const fileId of targetFiles(iv)) queueCell(fileId, iv.situation, iv, newDefault);
    }
    ivOps.push({ updateOne: { filter: { _id: iv._id }, update: { $set: set } } });
    if (samples.length < 20) samples.push(`  → ${iv.indicator_excel_id} ${iv.situation} ${iv.year} — ${iv.collectivity_name} / ${iv.action_name} : défaut ${currentDefault} → ${newDefault}${set['value.number'] !== undefined ? ' (valeur aussi)' : ''}`);
  }

  const cellCount = [...excelCells.values()].reduce((n, m) => n + m.size, 0);
  console.log(`\n📊 IVs en % : ${stats.total} | sans défaut : ${stats.noDefault} | défaut 0 : ${stats.zero} | déjà convertis : ${stats.alreadyConverted} | défaut relu Excel : ${stats.fromExcel} | défaut Indicator ×100 : ${stats.fromIndicator}`);
  console.log(`📊 Non résolus (laissés tels quels) : sans année ${stats.unresolvedNoYear} | sans fichier Excel ${stats.unresolvedNoFile} | absent de l’Excel ${stats.unresolvedNotInExcel}`);
  console.log(`📊 Inchangés : ${stats.unchanged} | défauts modifiés : ${stats.defaultUpdated} | valeurs préremplies modifiées : ${stats.valueUpdated} | cellules Excel à réécrire : ${cellCount} (${excelCells.size} feuilles)`);
  console.log('\nExemples :');
  for (const s of samples) console.log(s);

  if (DRY_RUN) {
    console.log('\n✅ DRY RUN terminé, aucune écriture effectuée');
    await mongoose.disconnect();
    return;
  }

  if (indicatorOps.length) {
    const r = await Indicator.bulkWrite(indicatorOps);
    console.log(`\n✅ ${r.modifiedCount} indicateurs mis à jour`);
  }
  for (let i = 0; i < ivOps.length; i += 5000) {
    const r = await IndicatorValue.bulkWrite(ivOps.slice(i, i + 5000));
    console.log(`✅ ${Math.min(i + 5000, ivOps.length)}/${ivOps.length} IVs traitées (${r.modifiedCount} modifiées)`);
  }

  const byFile = new Map();
  for (const [key, cells] of excelCells) {
    const [fileId, situation] = key.split('|');
    if (!byFile.has(fileId)) byFile.set(fileId, []);
    byFile.get(fileId).push({ situation, updates: [...cells.values()] });
  }
  let written = 0;
  for (const [fileId, groups] of byFile) {
    let sessionId = null;
    try {
      sessionId = await createWorkbookSession(fileId);
      for (const g of groups) {
        await updateExcelCellsBatch(fileId, g.updates, g.situation, sessionId);
        written += g.updates.length;
      }
    } catch (e) {
      console.log(`⚠️ Écriture Excel impossible ${fileId} : ${e.message}`);
    } finally {
      await closeWorkbookSession(fileId, sessionId).catch(() => {});
    }
  }
  console.log(`✅ ${written}/${cellCount} cellules Excel réécrites`);

  console.log('\n✅ Migration terminée');
  await mongoose.disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
