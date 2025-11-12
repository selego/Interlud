const Action = require("../models/action");
const { capture } = require("../services/sentry");
const { saveAndCreatePatches } = require("./patch");

//IndicatorValue model is imported dynamically to avoid circular dependency

async function updateMultipleActionsCompleteness(actionsIds, IndicatorValue, user) {
  if (!actionsIds) return;
  for (const actionId of actionsIds) {
      await updateActionCompleteness(actionId, IndicatorValue, user);
  }
}

async function updateActionCompleteness(actionId, IndicatorValue, user) {
  if (!actionId || !IndicatorValue) return;
  try {
  const indicatorValues = await IndicatorValue.find({ action_id: actionId });
  if (!indicatorValues || indicatorValues.length === 0) return;
  const totalIndicators = indicatorValues.length;
  
  const filledIndicators = indicatorValues.filter(indicatorValue => indicatorValue.value !== null && indicatorValue.value !== "").length;
  const completeness = Math.round((filledIndicators / totalIndicators) * 100);
  
  const action = await Action.findById(actionId);
  if (!action) return;
  
  if (action.completeness !== completeness) {
    action.completeness = completeness;
    await saveAndCreatePatches(action, user);
  }
} catch (error) {
  capture(error);
}
}

module.exports = { updateMultipleActionsCompleteness, updateActionCompleteness };