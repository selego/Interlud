const express = require("express");
const router = express.Router();
const passport = require("passport");
const IndicatorValue = require("../models/indicator_value");
const ERROR_CODES = require("../utils/errorCodes");
const { capture } = require("../services/sentry");
const Log = require("../models/log");
const Action = require("../models/action");
const Indicator = require("../models/indicator");
const { updateExcelCellByIndicatorId } = require("../services/microsoftGraph");

router.get("/:id", passport.authenticate(["admin", "user"], { session: false, failWithError: true }), async (req, res) => {
  try {
    const indicatorValue = await IndicatorValue.findById(req.params.id);
    if (!indicatorValue) return res.status(404).send({ ok: false, code: ERROR_CODES.NOT_FOUND });

    return res.status(200).send({ ok: true, data: indicatorValue });
  } catch (error) {
    capture(error);
    return res.status(500).send({ ok: false, code: ERROR_CODES.SERVER_ERROR });
  }
});

router.put("/:id", passport.authenticate(["admin", "user"], { session: false, failWithError: true }), async (req, res) => {
  try {
    const indicatorValue = await IndicatorValue.findById(req.params.id);
    if (!indicatorValue) return res.status(404).send({ ok: false, code: ERROR_CODES.NOT_FOUND });

    const action = await Action.findById(indicatorValue.action_id);
    if (!action) return res.status(404).send({ ok: false, code: ERROR_CODES.NOT_FOUND });

    action.last_modif_by_id = req.user._id;
    action.last_modif_by_name = req.user.name;
    action.last_modif_date = new Date();
    await action.save();
    const indicator = await Indicator.findById(indicatorValue.indicator_id);
    if (!indicator) return res.status(404).send({ ok: false, code: ERROR_CODES.NOT_FOUND });
    
    
    const logs = [];
        
    for (const field of Object.keys(req.body)) {
      if (["updatedAt", "__v", "createdAt", "_id"].includes(field)) continue;
      let newValue = req.body[field];
      const originalValue = indicatorValue[field];
      
      if (originalValue instanceof Date && typeof newValue === 'string') newValue = new Date(newValue);
      if (JSON.stringify(newValue) === JSON.stringify(originalValue)) continue;
      
      let actualNewValue = newValue;
      let actualOldValue = originalValue;
      if (field === 'value' && indicatorValue.indicator_type) {
        actualNewValue = newValue?.[indicatorValue.indicator_type];
        actualOldValue = originalValue?.[indicatorValue.indicator_type];
      }
      
      let logType = typeof actualNewValue;
      if (actualNewValue instanceof Date) logType = 'date';
      if (Array.isArray(actualNewValue)) logType = 'array';
      
      const log = {
        model_name: "indicator_value",
        name: indicator.name,
        field: field,
        operation: 'update',
        new_value: { [logType]: actualNewValue },
        previous_value: { [logType]: actualOldValue },
        type_value: logType,
        date: new Date(),
        user_id: req.user._id,
        user_name: req.user.name,
        user_email: req.user.email,
        collectivity_id: indicatorValue.collectivity_id,
        collectivity_name: indicatorValue.collectivity_name,
        action_id: indicatorValue.action_id,
        action_name: indicatorValue.action_name,
        indicator_id: indicatorValue.indicator_id,
        indicator_name: indicatorValue.indicator_name,
        indicator_value_id: indicatorValue._id,
        indicator_value_name: indicatorValue.name,

      };
      logs.push(log);
    }
    
    indicatorValue.set(req.body);
    await indicatorValue.save();

    res.status(200).send({ ok: true, data: indicatorValue });
    await updateExcelCellByIndicatorId('01IBL4ADI6GFGNFTVX7JEKTEEVD4COHF77', 'Remplissage - Sit. Init.', indicator.excel_indicator_id, req.body.value[indicatorValue.indicator_type]);


    if (logs.length > 0) await Log.insertMany(logs);
    
    const totalIndicators = await IndicatorValue.countDocuments({ action_id: indicatorValue.action_id });
    const allIndicators = await IndicatorValue.find({ action_id: indicatorValue.action_id });
    const filledIndicators = allIndicators.filter(indicatorValue => {
      const val = indicatorValue.value?.[indicatorValue.indicator_type];
      if (indicatorValue.indicator_type === 'checkbox') return Array.isArray(val) && val.length > 0;
      return val !== null && val !== undefined && val !== '';
    }).length;


    if (!(indicatorValue.indicator_id && indicatorValue.situation && indicatorValue.year && indicatorValue.collectivity_id)) return;
    const otherIndicatorValues = await IndicatorValue.find({ indicator_id: indicatorValue.indicator_id, situation: indicatorValue.situation, year: indicatorValue.year, collectivity_id: indicatorValue.collectivity_id, _id: { $ne: indicatorValue._id } });
    
    const syncLogs = [];
    for (const otherIndicatorValue of otherIndicatorValues) {
      if (JSON.stringify(otherIndicatorValue.value) !== JSON.stringify(indicatorValue.value)) { 
        const actualNewValue = indicatorValue.value?.[indicatorValue.indicator_type];
        const actualOldValue = otherIndicatorValue.value?.[indicatorValue.indicator_type];
        
        let logType = typeof actualNewValue;
        if (actualNewValue instanceof Date) logType = 'date';
        if (Array.isArray(actualNewValue)) logType = 'array';
        
          const syncLog = {
            model_name: "indicator_value",
            name: otherIndicatorValue.name,
            field: "value",
            operation: 'update',
            new_value: { [logType]: actualNewValue },
            previous_value: { [logType]: actualOldValue },
            type_value: logType,
            date: new Date(),
            user_id: req.user._id,
            user_name: req.user.name,
            user_email: req.user.email,
            collectivity_id: otherIndicatorValue.collectivity_id,
            collectivity_name: otherIndicatorValue.collectivity_name,
            action_id: otherIndicatorValue.action_id,
            action_name: otherIndicatorValue.action_name,
            indicator_id: otherIndicatorValue.indicator_id,
            indicator_name: otherIndicatorValue.indicator_name,
            indicator_value_id: otherIndicatorValue._id,
            indicator_value_name: otherIndicatorValue.name,
          };
          syncLogs.push(syncLog);
        }

        const totalIndicatorsOther = await IndicatorValue.countDocuments({ action_id: otherIndicatorValue.action_id });
        const allIndicatorsOther = await IndicatorValue.find({ action_id: otherIndicatorValue.action_id });
        const filledIndicatorsOther = allIndicatorsOther.filter(indicatorValue => {
          const val = indicatorValue.value?.[indicatorValue.indicator_type];
          if (indicatorValue.indicator_type === 'checkbox') return Array.isArray(val) && val.length > 0;
          return val !== null && val !== undefined && val !== '';
        }).length;
      }
      
      await IndicatorValue.updateMany( 
        { indicator_id: indicatorValue.indicator_id, situation: indicatorValue.situation, year: indicatorValue.year, collectivity_id: indicatorValue.collectivity_id },
        { $set: {value: indicatorValue.value} } 
      );
      
      if (syncLogs.length > 0)  await Log.insertMany(syncLogs);
    
  } catch (error) {
    capture(error);
    return res.status(500).send({ ok: false, code: ERROR_CODES.SERVER_ERROR });
  }
});

router.post("/search", passport.authenticate(["admin", "user"], { session: false, failWithError: true }), async (req, res) => {
  try {
    let query = {};

    if (req.body.indicator_id) { query.indicator_id = req.body.indicator_id; }
    if (req.body.action_id) { query.action_id = req.body.action_id; }
    if (req.body.situation) { query.situation = req.body.situation; }
    if (req.body.indicator_category_name) { query.indicator_category_name = req.body.indicator_category_name; }
    if (req.body.indicator_sub_category_name !== undefined) { 
      if (req.body.indicator_sub_category_name === null) {
        query.$and = [
          { $or: [
            { indicator_sub_category_name: null },
            { indicator_sub_category_name: "" },
            { indicator_sub_category_name: { $exists: false } }
          ]}
        ];
      } else {
        query.indicator_sub_category_name = req.body.indicator_sub_category_name;
      }
    }
    const limit = req.body.limit || 50;
    const skip = req.body.offset || 0;
    const total = await IndicatorValue.countDocuments(query);
    const data = await IndicatorValue.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit);
    return res.status(200).send({ ok: true, data, total });
  } catch (error) {
    capture(error);
    return res.status(500).send({ ok: false, code: ERROR_CODES.SERVER_ERROR });
  }
});

router.post("/", passport.authenticate(["admin", "user"], { session: false, failWithError: true }), async (req, res) => {
  try {
    const indicatorValue = await IndicatorValue.create(req.body);
    return res.status(200).send({ ok: true, data: indicatorValue });
  } catch (error) {
    capture(error);
    return res.status(500).send({ ok: false, data: { code: ERROR_CODES.SERVER_ERROR } });
  }
});
module.exports = router;
