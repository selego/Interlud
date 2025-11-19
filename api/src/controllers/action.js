const express = require("express");
const router = express.Router();
const passport = require("passport");
const Action = require("../models/action");
const IndicatorValue = require("../models/indicator_value");
const ERROR_CODES = require("../utils/errorCodes");
const { capture } = require("../services/sentry");
const Log = require("../models/log");

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
    
    const logs = [];
    const fieldsToCheck = Object.keys(req.body).filter((field) => !["updatedAt", "__v", "createdAt", "_id"].includes(field));
        
    for (const field of fieldsToCheck) {
      const newValue = req.body[field];
      const originalValue = action[field];
      if (JSON.stringify(newValue) === JSON.stringify(originalValue)) continue;
      const log = new Log({
        model_name: "action",
        entity_id: action._id,
        entity_name: action.name,
        field: field,
        operation: 'update',
        new_value: newValue,
        previous_value: originalValue,
        date: new Date(),
        user_id: req.user._id,
        user_name: req.user.name,
        user_email: req.user.email,
        collectivity_id: action.collectivity_id,
        collectivity_name: action.collectivity_name,
      });
      logs.push(log);
    }
    
    action.set(req.body);
    await action.save();
    if (logs.length > 0) { await Log.insertMany(logs) }
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
    const action = await Action.create(req.body);
    if (!action) return res.status(400).send({ ok: false, code: ERROR_CODES.INVALID_BODY });

    const logs = [];
    const fieldsToCheck = Object.keys(req.body).filter((field) => !["updatedAt", "__v", "createdAt", "_id"].includes(field));
    
    for (const field of fieldsToCheck) {
      const log = {
        model_name: "action",
        entity_id: action._id,
        entity_name: action.name,
        field: field,
        operation: 'add',
        new_value: req.body[field],
        previous_value: null,
        date: new Date(),
        user_id: req.user._id,
        user_name: req.user.name,
        user_email: req.user.email,
        collectivity_id: action.collectivity_id,
        collectivity_name: action.collectivity_name,
      };
      logs.push(log);
    }
    
    if (logs.length > 0) await Log.insertMany(logs);
    return res.status(200).send({ ok: true, data: action });
  } catch (error) {
    capture(error);
    return res.status(500).send({ ok: false, code: ERROR_CODES.SERVER_ERROR });
  }
});

router.delete("/:id", passport.authenticate(["admin", "user"], { session: false, failWithError: true }), async (req, res) => {
  try {
    const action = await Action.findOne({ _id: req.params.id });
    if (!action) return res.status(404).send({ ok: false, code: ERROR_CODES.NOT_FOUND });

    await Log.create({
      model_name: "action",
      entity_id: action._id,
      entity_name: action.name,
      operation: 'delete',
      date: new Date(),
      user_id: req.user._id,
      user_name: req.user.name,
      user_email: req.user.email,
      collectivity_id: action.collectivity_id,
      collectivity_name: action.collectivity_name,
    });

    await Action.deleteOne({ _id: req.params.id });

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
      createdValues.push(indicatorValue);
    }
    
    return res.status(200).send({ ok: true, data: createdValues });
  } catch (error) {
    capture(error);
    return res.status(500).send({ ok: false, code: ERROR_CODES.SERVER_ERROR });
  }
});


module.exports = router;