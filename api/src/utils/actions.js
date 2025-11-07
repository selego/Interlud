const Action = require("../models/action");

//IndicatorValue model is imported dynamically to avoid circular dependency

function shouldUpdateActionCompleteness(oldValue, newValue) {
  const isEmpty = (v) => v === null || v === undefined || v === "";
  const wasEmpty = isEmpty(oldValue);
  const isNowEmpty = isEmpty(newValue);

  // Return true if the value has changed from empty to filled or from filled to empty
  return wasEmpty !== isNowEmpty;
}

async function updateMultipleActionsCompleteness(actionsIds, IndicatorValue, user) {
  if (!actionsIds) return;
  for (const actionId of actionsIds) {
      await updateActionCompleteness(actionId, IndicatorValue, user);
  }
}

async function updateActionCompleteness(actionId, IndicatorValue, user) {
  if (!actionId || !IndicatorValue) return;
  const indicatorValues = await IndicatorValue.find({ action_id: actionId });
  if (!indicatorValues || indicatorValues.length === 0) return;
  const totalIndicators = indicatorValues.length;
  
  const filledIndicators = indicatorValues.filter(indicatorValue => indicatorValue.value !== null && indicatorValue.value !== "").length;
  const completeness = Math.round((filledIndicators / totalIndicators) * 100);
  
  const action = await Action.findById(actionId);
  action.set({ completeness });
  await action.save({ fromUser: user });
}

module.exports = { updateMultipleActionsCompleteness, updateActionCompleteness, shouldUpdateActionCompleteness };