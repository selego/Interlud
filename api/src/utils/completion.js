const IndicatorValue = require('../models/indicator_value');
const Action = require('../models/action');

const isIndicatorValueFilled = (iv) => {
  const val = iv.value?.[iv.indicator_type];
  if (iv.indicator_type === 'checkbox') return Array.isArray(val) && val.length > 0;
  return val !== null && val !== undefined && val !== '';
};

const computeActionCompletion = async (actionId) => {
  const [indicatorValues, action] = await Promise.all([IndicatorValue.find({ action_id: actionId }), Action.findById(actionId)]);
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

module.exports = { isIndicatorValueFilled, computeActionCompletion };
