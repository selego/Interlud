const express = require("express");
const router = express.Router();
const passport = require("passport");
const IndicatorValue = require("../models/indicator_value");
const ERROR_CODES = require("../utils/errorCodes");
const { capture } = require("../services/sentry");
const Log = require("../models/log");
const Action = require("../models/action");

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
    
    const logs = [];
    const fieldsToCheck = Object.keys(req.body).filter((field) => !["updatedAt", "__v", "createdAt", "_id"].includes(field));
        
    for (const field of fieldsToCheck) {
      const newValue = req.body[field];
      const originalValue = indicatorValue[field];
      if (JSON.stringify(newValue) === JSON.stringify(originalValue)) continue;
      
      const log = {
        model_name: "indicator_value",
        name: indicatorValue.name,
        field: field,
        operation: 'update',
        new_value: newValue,
        previous_value: originalValue,
        type_value: typeof newValue,
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
    if (logs.length > 0) await Log.insertMany(logs);
    
    if (indicatorValue.indicator_id && indicatorValue.situation && indicatorValue.year && indicatorValue.collectivity_id) {
      const otherIndicatorValues = await IndicatorValue.find({
        indicator_id: indicatorValue.indicator_id, 
        situation: indicatorValue.situation, 
        year: indicatorValue.year, 
        collectivity_id: indicatorValue.collectivity_id,
        _id: { $ne: indicatorValue._id }
      });
      
      const syncLogs = [];
      for (const otherIV of otherIndicatorValues) {
        if (otherIV.value !== indicatorValue.value) { 
          const syncLog = {
            model_name: "indicator_value",
            name: otherIV.name,
            field: "value",
            operation: 'update',
            new_value: indicatorValue.value,
            previous_value: otherIV.value,
            type_value: typeof indicatorValue.value,
            date: new Date(),
            user_id: req.user._id,
            user_name: req.user.name,
            user_email: req.user.email,
            collectivity_id: otherIV.collectivity_id,
            collectivity_name: otherIV.collectivity_name,
            action_id: otherIV.action_id,
            action_name: otherIV.action_name,
            indicator_id: otherIV.indicator_id,
            indicator_name: otherIV.indicator_name,
            indicator_value_id: otherIV._id,
            indicator_value_name: otherIV.name,
          };
          syncLogs.push(syncLog);
        }
      }
      
      await IndicatorValue.updateMany( 
        { indicator_id: indicatorValue.indicator_id, situation: indicatorValue.situation, year: indicatorValue.year, collectivity_id: indicatorValue.collectivity_id },
        { $set: {value: indicatorValue.value} } 
      );
      
      if (syncLogs.length > 0)  await Log.insertMany(syncLogs);
    }
    
    return res.status(200).send({ ok: true, data: indicatorValue });
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
