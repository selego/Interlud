const IndicatorValue = require('../models/indicator_value');
const Action = require('../models/action');

const isIndicatorValueFilled = (iv) => {
  const val = iv.value?.[iv.indicator_type];
  if (iv.indicator_type === 'checkbox') return Array.isArray(val) && val.length > 0;
  return val !== null && val !== undefined && val !== '';
};

const computeActionCompletion = async (actionId) => {
  const indicatorValues = await IndicatorValue.find({ action_id: actionId });
  if (indicatorValues.length === 0) return;

  const situations = ['init', 'ref', 'prev', 'expost'];
  const completion = {};

  for (const situation of situations) {
    const values = indicatorValues.filter((iv) => iv.situation === situation);
    if (values.length === 0) {
      completion[`completion_${situation}`] = 0;
      continue;
    }
    const filled = values.filter(isIndicatorValueFilled).length;
    completion[`completion_${situation}`] = Math.round((filled / values.length) * 100);
  }

  await Action.updateOne({ _id: actionId }, { $set: completion });
};

module.exports = { isIndicatorValueFilled, computeActionCompletion };
