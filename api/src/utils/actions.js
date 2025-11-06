const Action = require("../models/action");
//IndicatorValue model is imported dynamically to avoid circular dependency

function shouldUpdateActionCompleteness(oldValue, newValue) {
  const wasEmpty = oldValue === null || oldValue === undefined || oldValue === "";
  const isFilled = newValue !== null && newValue !== undefined && newValue !== "";
  return wasEmpty && isFilled;
}

async function updateMultipleActionsCompleteness(actionsIds, IndicatorValue) {
  if (!actionsIds) return;
  for (const actionId of actionsIds) {
      await updateActionCompleteness(actionId, IndicatorValue);
  }
}

async function updateActionCompleteness(actionId, IndicatorValue) {
  if (!actionId || !IndicatorValue) return;
  const indicatorValues = await IndicatorValue.find({ action_id: actionId });
  if (!indicatorValues || indicatorValues.length === 0) return;
  const totalIndicators = indicatorValues.length;
  
  const filledIndicators = indicatorValues.filter(indicatorValue => indicatorValue.value !== null && indicatorValue.value !== "").length;
  const completeness = Math.round((filledIndicators / totalIndicators) * 100);
  
  await Action.findByIdAndUpdate(actionId, { completeness });
}

module.exports = { updateMultipleActionsCompleteness, updateActionCompleteness, shouldUpdateActionCompleteness };