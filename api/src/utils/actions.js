const Action = require("../models/action");
const { capture } = require("../services/sentry");

//IndicatorValue model is imported dynamically to avoid circular dependency

async function updateActionCompleteness(actionId, IndicatorValue) {
  if (!actionId || !IndicatorValue) return;
  try {
  const indicatorValues = await IndicatorValue.find({ action_id: actionId });
  if (!indicatorValues || indicatorValues.length === 0) return;
  const totalIndicators = indicatorValues.length;
  
  const filledIndicators = indicatorValues.filter(indicatorValue => indicatorValue.value !== null && indicatorValue.value !== "").length;
  const completeness = Math.round((filledIndicators / totalIndicators) * 100);
  
    await Action.findByIdAndUpdate(actionId, { completeness });
  } catch (error) {
    capture(error);
  }
}

module.exports = { updateActionCompleteness };