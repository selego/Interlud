const Action = require("../models/action");
const { capture } = require("../services/sentry");
const { saveAndCreatePatches } = require("./patch");
//IndicatorValue model is imported dynamically to avoid circular dependency

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
  action.set({ completeness });
  await saveAndCreatePatches(action, user, "actionPatch");
  } catch (error) {
    capture(error);
  }
}

module.exports = { updateActionCompleteness };