const IndicatorValue = require('../models/indicator_value');
const Action = require('../models/action');
const { HIDDEN_IDS, buildYearMappings, shouldDisplayIndicator, collectConditionExcelIds } = require('./indicators');

const isIndicatorValueFilled = (iv) => {
  const val = iv.value?.[iv.indicator_type];
  if (iv.indicator_type === 'checkbox') return Array.isArray(val) && val.length > 0;
  return val !== null && val !== undefined && val !== '';
};

// options.dryRun : calcule et retourne l'update sans écrire en base (utilisé par script/recompute_completion.js)
const computeActionCompletion = async (actionId, { dryRun = false } = {}) => {
  const [indicatorValues, action] = await Promise.all([IndicatorValue.find({ action_id: actionId }), Action.findById(actionId)]);
  if (!action || indicatorValues.length === 0) return;

  const ownerFilter = { owner: action.owner };
  if (action.owner === 'economic_actor' && action.economic_actor_id) ownerFilter.economic_actor_id = action.economic_actor_id;

  // Build display condition context
  const condExcelIds = new Set();
  for (const iv of indicatorValues) collectConditionExcelIds(iv.display_condition, condExcelIds);

  const [regularActions, condValues] = await Promise.all([
    Action.find({ collectivity_id: action.collectivity_id, type: { $ne: 'config' }, ...ownerFilter }),
    condExcelIds.size > 0 ? IndicatorValue.find({ collectivity_id: action.collectivity_id, indicator_excel_id: { $in: [...condExcelIds] }, ...ownerFilter }) : Promise.resolve([]),
  ]);

  const conditionValuesMap = new Map();
  for (const cv of condValues) conditionValuesMap.set(`${cv.indicator_excel_id}_${cv.situation}_${cv.year}`, cv);
  const yearMappingsBySituationYear = buildYearMappings(regularActions);

  const situations = ['init', 'ref', 'prev', 'expost'];
  const update = {};

  for (const situation of situations) {
    const values = indicatorValues.filter((iv) => iv.situation === situation);
    const displayed = values.filter((iv) => {
      if (HIDDEN_IDS.includes(iv.indicator_excel_id)) return false;
      const yearMappings = yearMappingsBySituationYear[`${iv.situation}_${iv.year}`];
      return shouldDisplayIndicator(iv, yearMappings, conditionValuesMap);
    });
    // Situation sans aucun indicateur (ex : ex-post sans fichier) → 0 comme avant.
    // Indicateurs présents mais tous masqués par les conditions d'affichage (ex : C1 en remplissage automatique
    // n'a aucune question en référence) → rien à remplir, situation complète.
    if (displayed.length === 0) {
      update[`completion_${situation}`] = values.length === 0 ? 0 : 100;
      continue;
    }
    const filled = displayed.filter(isIndicatorValueFilled).length;
    update[`completion_${situation}`] = Math.round((filled / displayed.length) * 100);
  }

  if (!dryRun) await Action.updateOne({ _id: actionId }, { $set: update });
  return update;
};

module.exports = { isIndicatorValueFilled, computeActionCompletion };
