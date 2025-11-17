const express = require("express");
const router = express.Router();
const passport = require("passport");
const Action = require("../models/action");
const IndicatorValue = require("../models/indicator_value");
const ERROR_CODES = require("../utils/errorCodes");
const { capture } = require("../services/sentry");
const ActionLog = require("../models/action_log");
const IndicatorValueLog = require("../models/indicator_value_log");

router.get("/:id", passport.authenticate(["admin", "user"], { session: false, failWithError: true }), async (req, res) => {
  try {
    const action = await Action.findById(req.params.id);
    if (!action) return res.status(404).send({ ok: false, code: ERROR_CODES.NOT_FOUND });

    return res.status(200).send({ ok: true, data: action });
  } catch (error) {
    capture(error);
    return res.status(500).send({ ok: false, code: ERROR_CODES.SERVER_ERROR });
  }
});

router.put("/:id", passport.authenticate(["admin", "user"], { session: false, failWithError: true }), async (req, res) => {
  try {
    const action = await Action.findById(req.params.id);
    if (!action) return res.status(404).send({ ok: false, code: ERROR_CODES.NOT_FOUND });
    
    const originalAction = action.toObject();
    action.set(req.body);
    
    const modifiedPaths = action.modifiedPaths().filter((path) => path !== "updatedAt" && path !== "__v" && path !== "_user");
    
    const logs = [];
    if (modifiedPaths.length > 0) {
      for (const field of modifiedPaths) {
        const newValue = action.get(field);
        const originalValue = originalAction[field];

        if (JSON.stringify(newValue) === JSON.stringify(originalValue)) continue;

        let operation = "update";
        if (originalValue === undefined && newValue !== undefined) operation = "add";

        const log = new ActionLog({
          action_id: action._id,
          action_name: action.name,
          collectivity_id: action.collectivity_id,
          collectivity_name: action.collectivity_name,
          field: field,
          operation: operation,
          new_value: newValue,
          previous_value: originalValue,
          date: new Date(),
          user_id: req.user._id,
          user_name: req.user.name,
          user_email: req.user.email,
          user_role: req.user.role,
          user_collectivities: req.user.collectivities,
          sync_auto: false,
        });
        logs.push(log);
      }
    }
    
    await action.save();
    
    if (logs.length > 0) {
      await ActionLog.insertMany(logs);
    }
    
    return res.status(200).send({ ok: true, data: action });
  } catch (error) {
    capture(error);
    return res.status(500).send({ ok: false, code: ERROR_CODES.SERVER_ERROR });
  }
});

router.post("/search", passport.authenticate(["admin", "user"], { session: false, failWithError: true }), async (req, res) => {
  try {
    let query = {};

    if (req.body.type) { query.type = req.body.type; }
    if (req.body.collectivity_id) { query.collectivity_id = req.body.collectivity_id; }
    const limit = req.body.limit || 50;
    const skip = req.body.offset || 0;
    const total = await Action.countDocuments(query);
    const data = await Action.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit);
    return res.status(200).send({ ok: true, data, total });
  } catch (error) {
    console.log(error);
    return res.status(500).send({ ok: false, code: ERROR_CODES.SERVER_ERROR });
  }
});

router.post("/", passport.authenticate(["admin", "user"], { session: false, failWithError: true }), async (req, res) => {
  try {
    if (!req.body.name) return res.status(400).send({ ok: false, code: ERROR_CODES.INVALID_BODY });
    const action = await Action.create( req.body );
    if (!action) return res.status(400).send({ ok: false, code: ERROR_CODES.INVALID_BODY });
    res.status(200).send({ ok: true, data: action });
    
    const docObject = action.toObject();
    const fields = Object.keys(docObject).filter((field) => !["_id", "__v", "createdAt", "updatedAt"].includes(field));
    const logs = [];
    for (const field of fields) {
      const value = docObject[field];
      if (value === undefined || value === null) continue;
      if (Array.isArray(value) && value.length === 0) continue;
      const log = new ActionLog({
        action_id: action._id,
        action_name: action.name,
        collectivity_id: action.collectivity_id,
        collectivity_name: action.collectivity_name,
        field: field,
        operation: "add",
        new_value: value,
        previous_value: null,
        date: new Date(),
        user_id: req.user._id,
        user_name: req.user.name,
        user_email: req.user.email,
        user_role: req.user.role,
        user_collectivities: req.user.collectivities,
        sync_auto: false,
      });
      logs.push(log);
    }
    if (logs.length > 0) {
      await ActionLog.insertMany(logs);
    }
  } catch (error) {
    capture(error);
    return res.status(500).send({ ok: false, data: { code: ERROR_CODES.SERVER_ERROR } });
  }
});

router.delete("/:id", passport.authenticate(["admin", "user"], { session: false, failWithError: true }), async (req, res) => {
  try {
    const action = await Action.findByIdAndDelete(req.params.id);
    if (!action) return res.status(404).send({ ok: false, code: ERROR_CODES.NOT_FOUND });

    return res.status(200).send({ ok: true });
  } catch (error) {
    capture(error);
    return res.status(500).send({ ok: false, code: ERROR_CODES.SERVER_ERROR });
  }
});

router.post("/initialize_indicator_values", passport.authenticate(["admin", "user"], { session: false, failWithError: true }), async (req, res) => {
  try {
    if (!req.body.action_id) return res.status(400).send({ ok: false, code: ERROR_CODES.INVALID_BODY });
    if (!req.body.indicator_id) return res.status(400).send({ ok: false, code: ERROR_CODES.INVALID_BODY });
    
    const existing = await IndicatorValue.findOne({  action_id: req.body.action_id,  indicator_id: req.body.indicator_id  });
    if (existing) return res.status(400).send({ ok: false, code: ERROR_CODES.INDICATOR_ALREADY_EXISTS });
    
    const situations = ["init", "ref", "prev", "expost"];
    const createdValues = [];
    
    for (const situation of situations) {
      const indicatorValue = await IndicatorValue.create({ ...req.body, situation });
      if(!indicatorValue) continue;
      createdValues.push(indicatorValue);

      const docObject = indicatorValue.toObject();
      const fields = Object.keys(docObject).filter((field) => !["_id", "__v", "createdAt", "updatedAt"].includes(field));
      const logs = [];
      for (const field of fields) {
        const value = docObject[field];
        if (value === undefined || value === null) continue;
        if (Array.isArray(value) && value.length === 0) continue;
        const log = new IndicatorValueLog({
          indicator_value_id: indicatorValue._id,
          indicator_value_name: indicatorValue.name,
          indicator_id: indicatorValue.indicator_id,
          indicator_name: indicatorValue.indicator_name,
          action_id: indicatorValue.action_id,
          action_name: indicatorValue.action_name,
          collectivity_id: indicatorValue.collectivity_id,
          collectivity_name: indicatorValue.collectivity_name,
          indicator_situation: indicatorValue.situation,
          indicator_year: indicatorValue.year,
          field: field,
          operation: "add",
          new_value: value,
          previous_value: null,
          date: new Date(),
          user_id: req.user._id,
          user_name: req.user.name,
          user_email: req.user.email,
          user_role: req.user.role,
          user_collectivities: req.user.collectivities,
          sync_auto: false,
        });
        logs.push(log);
      }
      if (logs.length > 0) {
        await IndicatorValueLog.insertMany(logs);
      }
    }

    if (createdValues.length > 0) {
      const indicatorValues = await IndicatorValue.find({ action_id: req.body.action_id });
      if (!indicatorValues || indicatorValues.length === 0) return;
      const totalIndicators = indicatorValues.length;

      const filledIndicators = indicatorValues.filter(
        (indicatorValue) => indicatorValue.value !== null && indicatorValue.value !== "",
      ).length;
      const completeness = Math.round((filledIndicators / totalIndicators) * 100);

      const action = await Action.findById(req.body.action_id);
      if(!action) return;
      if(action.completeness === completeness) return;
      const log = new ActionLog({
        action_id: action._id,
        action_name: action.name,
        collectivity_id: action.collectivity_id,
        collectivity_name: action.collectivity_name,
        field: "completeness",
        operation: "update",
        new_value: completeness,
        previous_value: action.completeness,
        date: new Date(),
        user_id: req.user._id,
        user_name: req.user.name,
        user_email: req.user.email,
        user_role: req.user.role,
        user_collectivities: req.user.collectivities,
        sync_auto: false,
      });
      await ActionLog.create(log);
      action.set({ completeness });
      await action.save();
    }

    return res.status(200).send({ ok: true, data: createdValues });
  } catch (error) {
    capture(error);
    return res.status(500).send({ ok: false, code: ERROR_CODES.SERVER_ERROR });
  }
});


module.exports = router;