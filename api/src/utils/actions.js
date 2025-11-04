const Action = require("../models/action");
const IndicatorValue = require("../models/indicator_value");

function shouldUpdateActionCompleteness(oldValue, newValue) {
  const wasEmpty = oldValue === null || oldValue === undefined || oldValue === "";
  const isFilled = newValue !== null && newValue !== undefined && newValue !== "";
  return wasEmpty && isFilled;
}

async function updateMultipleActionsCompleteness(actionsIds) {
  if (!actionsIds) return;
  for (const actionId of actionsIds) {
      await updateActionCompleteness(actionId);
  }
}

async function updateActionCompleteness(actionId) {
  if (!actionId) return;
  const indicatorValues = await IndicatorValue.find({ action_id: actionId });
  if (!indicatorValues || indicatorValues.length === 0) return;
  const totalIndicators = indicatorValues.length;
  
  const filledIndicators = indicatorValues.filter(indicatorValue => indicatorValue.value !== null && indicatorValue.value !== "").length;
  const completeness = Math.round((filledIndicators / totalIndicators) * 100);
  
  await Action.findByIdAndUpdate(actionId, { completeness });
}

module.exports = { updateMultipleActionsCompleteness, updateActionCompleteness, shouldUpdateActionCompleteness };