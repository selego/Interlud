const IndicatorValue = require('../models/indicator_value');
const Action = require('../models/action');
const Collectivity = require('../models/collectivity');

const isIndicatorValueFilled = (iv) => {
  const val = iv.value?.[iv.indicator_type];
  if (iv.indicator_type === 'checkbox') return Array.isArray(val) && val.length > 0;
  return val !== null && val !== undefined && val !== '';
};

const computeActionCompletion = async (actionId) => {
  const [indicatorValues, action] = await Promise.all([IndicatorValue.find({ action_id: actionId }).select('value indicator_type situation').lean(), Action.findById(actionId).select('status').lean()]);
  if (!action || indicatorValues.length === 0) return;

  const situations = ['init', 'ref', 'prev', 'expost'];
  const update = {};

  for (const situation of situations) {
    const values = indicatorValues.filter((iv) => iv.situation === situation);
    if (values.length === 0) {
      update[`completion_${situation}`] = 0;
      continue;
    }
    const filled = values.filter(isIndicatorValueFilled).length;
    update[`completion_${situation}`] = Math.round((filled / values.length) * 100);
  }

  const allFilled = indicatorValues.every(isIndicatorValueFilled);
  if (allFilled) update.status = 'completed';
  else if (action.status === 'no_status') update.status = 'in_progress';

  await Action.updateOne({ _id: actionId }, { $set: update });
};

const computeConfigOnboarding = async (action) => {
  if (action.type !== 'config' || action.owner !== 'collectivity') return;
  if (action.name !== 'Données de base' && action.name !== 'Parc types') return;

  const HIDDEN_IDS = ['AnneeRempl', 'AnRef', 'ActionsAutres', 'ActionsCharte'];
  const allIVs = await IndicatorValue.find({ action_id: action._id, indicator_excel_id: { $nin: HIDDEN_IDS }, owner: 'collectivity' });

  const condExcelIds = new Set();
  for (const iv of allIVs) {
    if (iv.display_condition?.conditions) {
      for (const cond of iv.display_condition.conditions) {
        if (cond.excel_indicator_id) condExcelIds.add(cond.excel_indicator_id);
      }
    }
  }

  const [regularActions, condValues] = await Promise.all([
    Action.find({ collectivity_id: action.collectivity_id, type: { $ne: 'config' }, owner: 'collectivity' }),
    condExcelIds.size > 0 ? IndicatorValue.find({ collectivity_id: action.collectivity_id, indicator_excel_id: { $in: [...condExcelIds] }, owner: 'collectivity' }) : Promise.resolve([]),
  ]);

  const conditionValuesMap = new Map();
  for (const cv of condValues) conditionValuesMap.set(`${cv.indicator_excel_id}_${cv.situation}_${cv.year}`, cv);

  // Build year mappings from regular actions (mirrors /stats endpoint logic)
  const yearMappingsBySituationYear = {};
  const ensureMapping = (k) => {
    if (!yearMappingsBySituationYear[k]) yearMappingsBySituationYear[k] = { year_init: new Set(), year_ref: new Set(), year_prev: new Set(), year_expost: new Set() };
  };

  for (const a of regularActions) {
    if (a.year_init != null) {
      ensureMapping(`init_${a.year_init}`);
      yearMappingsBySituationYear[`init_${a.year_init}`].year_init.add(a.year_init);
    }
    for (const f of a.exel_files_prev || []) {
      if (f.year_prev != null) {
        ensureMapping(`prev_${f.year_prev}`);
        if (a.year_init != null) yearMappingsBySituationYear[`prev_${f.year_prev}`].year_init.add(a.year_init);
        if (f.year_ref != null) yearMappingsBySituationYear[`prev_${f.year_prev}`].year_ref.add(f.year_ref);
        yearMappingsBySituationYear[`prev_${f.year_prev}`].year_prev.add(f.year_prev);
      }
      if (f.year_ref != null) {
        ensureMapping(`ref_${f.year_ref}`);
        if (a.year_init != null) yearMappingsBySituationYear[`ref_${f.year_ref}`].year_init.add(a.year_init);
        yearMappingsBySituationYear[`ref_${f.year_ref}`].year_ref.add(f.year_ref);
      }
    }
    for (const f of a.excel_files_expost || []) {
      if (f.year_expost != null) {
        ensureMapping(`expost_${f.year_expost}`);
        if (a.year_init != null) yearMappingsBySituationYear[`expost_${f.year_expost}`].year_init.add(a.year_init);
        if (f.year_ref != null) yearMappingsBySituationYear[`expost_${f.year_expost}`].year_ref.add(f.year_ref);
        yearMappingsBySituationYear[`expost_${f.year_expost}`].year_expost.add(f.year_expost);
      }
      if (f.year_ref != null) {
        ensureMapping(`ref_${f.year_ref}`);
        if (a.year_init != null) yearMappingsBySituationYear[`ref_${f.year_ref}`].year_init.add(a.year_init);
        yearMappingsBySituationYear[`ref_${f.year_ref}`].year_ref.add(f.year_ref);
      }
    }
  }

  for (const k in yearMappingsBySituationYear) {
    const m = yearMappingsBySituationYear[k];
    yearMappingsBySituationYear[k] = { year_init: [...m.year_init], year_ref: [...m.year_ref], year_prev: [...m.year_prev], year_expost: [...m.year_expost] };
  }

  // Mirrors /stats endpoint shouldDisplayIndicator logic
  const shouldDisplayIndicator = (iv, yearMappings) => {
    if (!iv.display_condition?.conditions?.length) return true;
    const results = iv.display_condition.conditions.map((cond) => {
      const targetSituation = cond.excel_indicator_situation || iv.situation;
      const possibleYears = yearMappings?.[`year_${targetSituation}`] || [];
      return possibleYears.some((year) => {
        const source = conditionValuesMap.get(`${cond.excel_indicator_id}_${targetSituation}_${year}`);
        if (!source) return false;
        const val = source.value?.[source.indicator_type];
        let isMatch = false;
        if (cond.type === 'equals') {
          isMatch = val == cond.value;
          if (Array.isArray(val) && Array.isArray(cond.value)) isMatch = JSON.stringify([...val].sort()) === JSON.stringify([...cond.value].sort());
        }
        if (cond.type === 'contains') {
          if (Array.isArray(val)) isMatch = val.includes(cond.value);
          else if (typeof val === 'string') isMatch = val.includes(cond.value);
        }
        if (cond.type === 'greaterThan') isMatch = Number(val) > Number(cond.value);
        if (cond.type === 'lessThan') isMatch = Number(val) < Number(cond.value);
        if (cond.type === 'greaterOrEqual') isMatch = Number(val) >= Number(cond.value);
        if (cond.type === 'lessOrEqual') isMatch = Number(val) <= Number(cond.value);
        if (cond.type === 'notEmpty') isMatch = val !== null && val !== undefined && val !== '' && (!Array.isArray(val) || val.length > 0);
        if (cond.type === 'isEmpty') isMatch = val === null || val === undefined || val === '' || (Array.isArray(val) && val.length === 0);
        if (cond.negate) isMatch = !isMatch;
        return isMatch;
      });
    });
    return iv.display_condition.operator === 'OR' ? results.some((r) => r) : results.every((r) => r);
  };

  let total = 0;
  let filled = 0;
  for (const iv of allIVs) {
    const key = `${iv.situation}_${iv.year}`;
    const yearMappings = yearMappingsBySituationYear[key];
    if (!shouldDisplayIndicator(iv, yearMappings)) continue;
    total++;
    if (isIndicatorValueFilled(iv)) filled++;
  }

  const isComplete = total > 0 && filled === total;
  const field = action.name === 'Données de base' ? 'basedata_onboarded' : 'parc_types_onboarded';
  await Collectivity.updateOne({ _id: action.collectivity_id }, { $set: { [field]: isComplete } });
};

module.exports = { isIndicatorValueFilled, computeActionCompletion, computeConfigOnboarding };
