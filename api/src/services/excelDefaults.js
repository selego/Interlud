const Action = require('../models/action');
const IndicatorValue = require('../models/indicator_value');
const { getSiteId, graphFetchWithSession, updateExcelCellsBatch, WORKSHEETS } = require('./microsoftGraph');
const { isPercentUnit } = require('../utils/indicators');
const { computeActionCompletion } = require('../utils/completion');

// Relecture des défauts après synchro Excel.
// Les formules de la colonne H que l'app ne sait pas suivre en temps réel (répartition C1, produits C6, SUMIFS C3,
// chaînes de défauts C9…) sont recalculées par Excel une fois les saisies écrites dans la copie de la collectivité.
// On relit alors H et on rejoue la logique de la création d'action sur les IVs de l'action du fichier :
//   - value_default : mis à jour (cellule en erreur Excel #REF!/#N/A → défaut conservé, on ne dégrade pas la base)
//   - value : indicateurs non primordiaux uniquement, et seulement si la valeur est vide ou égale à l'ancien défaut
//     (jamais modifiée par l'utilisateur) ; les valeurs modifiées sont réécrites dans l'Excel (colonne F).
// Chaînes à 2 niveaux : une valeur réécrite en F peut faire bouger d'autres H (C9 : distance unique → distances par
// catégorie), d'où plusieurs passes jusqu'à stabilité, plafonnées à MAX_PASSES.
// Périmètre : l'action du fichier seulement, pas les actions config (Parc types / Données de base sont partagées entre
// actions et ne dépendent pas des saisies).
const MAX_PASSES = 3;

const isEmptyValue = (v) => v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0);

const parseExcelDefaultValue = (rawValue, indicatorType, unit) => {
  if (rawValue === null || rawValue === undefined || rawValue === '') return null;
  if (indicatorType === 'number') {
    const p = parseFloat(rawValue);
    if (isNaN(p)) return null;
    // Excel stocke les % en fraction (0.45 pour 45%), même conversion qu'à l'import
    return isPercentUnit(unit) ? p * 100 : p;
  }
  if (indicatorType === 'text' || indicatorType === 'radio') return String(rawValue).trim() || null;
  if (indicatorType === 'checkbox')
    return String(rawValue)
      .split(',')
      .map((v) => v.trim())
      .filter((v) => v !== '');
  return null;
};

// Couples situation/année couverts par ce fichier (un fichier prév = init + ref + prev ; un fichier ex-post = init + ref + expost)
const fileSituationYears = (action, fileId) => {
  const prevFile = (action.exel_files_prev || []).find((f) => f.excel_file_id === fileId);
  const expostFile = (action.excel_files_expost || []).find((f) => f.excel_file_id === fileId);
  const file = prevFile || expostFile;
  if (!file) return [];
  const out = [];
  if (action.year_init != null) out.push({ situation: 'init', year: action.year_init });
  if (file.year_ref != null) out.push({ situation: 'ref', year: file.year_ref });
  if (prevFile?.year_prev != null) out.push({ situation: 'prev', year: prevFile.year_prev });
  if (expostFile?.year_expost != null) out.push({ situation: 'expost', year: expostFile.year_expost });
  return out;
};

const recalculate = async (fileId) => {
  const siteId = await getSiteId();
  await graphFetchWithSession(fileId, `/sites/${siteId}/drive/items/${fileId}/workbook/application/calculate`, { method: 'POST', body: JSON.stringify({ calculationType: 'Recalculate' }) });
};

// Colonne H de la feuille d'une situation : excel_indicator_id (colonne E) → valeur brute.
// Lecture limitée aux colonnes E:H (l'adresse de la plage utilisée est demandée sans ses valeurs) : la feuille entière
// fait ~20 colonnes × 3 000 lignes, la plage E:H divise le volume transféré par cinq.
const readDefaults = async (fileId, situation) => {
  const siteId = await getSiteId();
  const sheetPath = `/sites/${siteId}/drive/items/${fileId}/workbook/worksheets('${encodeURIComponent(WORKSHEETS[situation])}')`;
  const used = await graphFetchWithSession(fileId, `${sheetPath}/usedRange?$select=address`);
  const lastRow = parseInt(used.address?.match(/(\d+)$/)?.[1] || '0', 10);
  const defaults = new Map();
  if (lastRow === 0) return defaults;
  const range = await graphFetchWithSession(fileId, `${sheetPath}/range(address='E1:H${lastRow}')?$select=values`);
  for (const row of range.values || []) {
    const excelIndicatorId = row[0] ? String(row[0]).trim() : '';
    if (!excelIndicatorId) continue;
    defaults.set(excelIndicatorId, row[3] !== undefined && row[3] !== '' ? row[3] : null);
  }
  return defaults;
};

// Situations dont les défauts peuvent dépendre d'une saisie faite dans `situation` (init alimente tout, ref alimente
// prév et ex-post, prév et ex-post ne s'alimentent qu'eux-mêmes, par prudence prév → ex-post aussi)
const IMPACTED = { init: ['init', 'ref', 'prev', 'expost'], ref: ['ref', 'prev', 'expost'], prev: ['prev', 'expost'], expost: ['expost'] };
const impactedSituations = (writtenSituations) => new Set(writtenSituations.flatMap((s) => IMPACTED[s] || []));

// dryRun : journalise sans écrire (ni base ni Excel) ; une seule passe, les F n'étant pas réécrits
// writtenSituations : situations dont des cellules viennent d'être écrites → seules les situations impactées sont relues
// (omis : toutes, cas de la création d'action et du script de resynchro)
async function refreshDefaultsAfterSync(fileId, { dryRun = false, writtenSituations = null } = {}) {
  const action = await Action.findOne({ $or: [{ 'exel_files_prev.excel_file_id': fileId }, { 'excel_files_expost.excel_file_id': fileId }] });
  if (!action) return null;
  const allSituationYears = fileSituationYears(action, fileId);
  let situationYears = writtenSituations ? allSituationYears.filter((sy) => impactedSituations(writtenSituations).has(sy.situation)) : allSituationYears;
  if (situationYears.length === 0) return null;

  const report = { action: action.name, passes: 0, defaults: 0, values: 0, protected: 0, errors: 0, changes: [] };
  const fmt = (v) => JSON.stringify(v ?? null);
  let valueChanged = false;

  for (let pass = 1; pass <= MAX_PASSES; pass++) {
    report.passes = pass;
    await recalculate(fileId);
    const ivs = await IndicatorValue.find({ action_id: action._id.toString(), indicator_excel_id: { $exists: true, $ne: null }, $or: situationYears });
    const bulkOps = [];
    const excelRewrites = new Map(); // situation → [{ excel_indicator_id, value, unit }]

    const defaultsBySituation = new Map(await Promise.all(situationYears.map(async ({ situation }) => [situation, await readDefaults(fileId, situation)])));
    for (const { situation } of situationYears) {
      const defaults = defaultsBySituation.get(situation);
      for (const iv of ivs) {
        if (iv.situation !== situation || !defaults.has(iv.indicator_excel_id)) continue;
        const rawDefault = defaults.get(iv.indicator_excel_id);
        if (typeof rawDefault === 'string' && rawDefault.startsWith('#')) {
          report.errors++;
          continue;
        }
        const newDefault = parseExcelDefaultValue(rawDefault, iv.indicator_type, iv.indicator_value_unit);
        const currentDefault = iv.value_default?.[iv.indicator_type] ?? null;
        if (JSON.stringify(newDefault) === JSON.stringify(currentDefault)) continue;

        const updateFields = { [`value_default.${iv.indicator_type}`]: newDefault };
        report.defaults++;
        const change = { pass, excel_indicator_id: iv.indicator_excel_id, situation, year: iv.year, default: `${fmt(currentDefault)} → ${fmt(newDefault)}` };

        if (iv.is_primordial === false) {
          const currentValue = iv.value?.[iv.indicator_type];
          const untouched = isEmptyValue(currentValue) || JSON.stringify(currentValue) === JSON.stringify(currentDefault);
          if (!untouched) {
            report.protected++;
            change.value = `${fmt(currentValue)} conservée`;
          }
          if (untouched) {
            report.values++;
            change.value = `${fmt(currentValue)} → ${fmt(newDefault)}`;
            updateFields[`value.${iv.indicator_type}`] = newDefault;
            if (newDefault !== null) {
              if (!excelRewrites.has(situation)) excelRewrites.set(situation, []);
              excelRewrites.get(situation).push({ excel_indicator_id: iv.indicator_excel_id, value: newDefault, unit: iv.indicator_value_unit });
            }
          }
        }
        report.changes.push(change);
        bulkOps.push({ updateOne: { filter: { _id: iv._id }, update: { $set: updateFields } } });
      }
    }

    if (bulkOps.length === 0 || dryRun) break;
    await IndicatorValue.bulkWrite(bulkOps);
    if (excelRewrites.size === 0) break;
    valueChanged = true;
    for (const [situation, cells] of excelRewrites) await updateExcelCellsBatch(fileId, cells, situation);
    // Passe suivante : les F réécrits peuvent avoir fait bouger d'autres défauts, dans les situations qu'ils alimentent
    const impacted = impactedSituations([...excelRewrites.keys()]);
    situationYears = allSituationYears.filter((sy) => impacted.has(sy.situation));
  }

  if (valueChanged) await computeActionCompletion(action._id.toString());
  return report;
}

module.exports = { refreshDefaultsAfterSync };
