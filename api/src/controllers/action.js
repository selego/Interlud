const express = require("express");
const router = express.Router();
const passport = require("passport");
const Action = require("../models/action");
const IndicatorValue = require("../models/indicator_value");
const ERROR_CODES = require("../utils/errorCodes");
const { capture } = require("../services/sentry");
const Log = require("../models/log");
const Indicator = require("../models/indicator");

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
    
    action.last_modif_by_id = req.user._id;
    action.last_modif_by_name = req.user.name;
    action.last_modif_date = new Date();
    await action.save();
    
    const logs = [];        
    for (const field of Object.keys(req.body)) {
      if (["updatedAt", "__v", "createdAt", "_id"].includes(field)) continue;
      let newValue = req.body[field];
      const originalValue = action[field];
      
      if (originalValue instanceof Date && typeof newValue === 'string')  newValue = new Date(newValue);
      
      if (JSON.stringify(newValue) === JSON.stringify(originalValue)) continue;
      
      let logType = typeof newValue;
      if (newValue instanceof Date) logType = 'date';
      if (Array.isArray(newValue)) logType = 'array';
      
      logs.push(new Log({
        model_name: "action",
        name: action.name,
        field: field,
        operation: 'update',
        new_value: { [logType]: newValue },
        previous_value: { [logType]: originalValue },
        type_value: logType,
        date: new Date(),
        user_id: req.user._id,
        user_name: req.user.name,
        user_email: req.user.email,
        action_id: action._id,
        action_name: action.name,
        collectivity_id: action.collectivity_id,
        collectivity_name: action.collectivity_name,
      }));
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
    if (req.body.status) { query.status = req.body.status; }
    if (req.body.search) { query.name = { $regex: req.body.search, $options: "i" }; }
    if (req.body.createdAt) { query.createdAt = { $gte: new Date(req.body.createdAt) }; }
    const limit = req.body.limit || 50;
    const skip = req.body.offset || 0;
    const total = await Action.countDocuments(query);
    const data = await Action.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit);
    return res.status(200).send({ ok: true, data, total });
  } catch (error) {
    capture(error);
    return res.status(500).send({ ok: false, code: ERROR_CODES.SERVER_ERROR });
  }
});

router.post("/", passport.authenticate(["admin", "user"], { session: false, failWithError: true }), async (req, res) => {
  try {
    if (!req.body.name) return res.status(400).send({ ok: false, code: ERROR_CODES.INVALID_BODY });
    const action = await Action.create(req.body);
    if (!action) return res.status(400).send({ ok: false, code: ERROR_CODES.INVALID_BODY });

    await Log.create({
      model_name: "action",
      name: action.name,
      operation: 'add',
      date: new Date(),
      user_id: req.user._id,
      user_name: req.user.name,
      user_email: req.user.email,
      action_id: action._id,
      action_name: action.name,
      collectivity_id: action.collectivity_id,
      collectivity_name: action.collectivity_name,
    });
    
    return res.status(200).send({ ok: true, data: action });
  } catch (error) {
    capture(error);
    return res.status(500).send({ ok: false, code: ERROR_CODES.SERVER_ERROR });
  }
});


router.post("/create_action_with_default_indicators", passport.authenticate(["admin", "user"], { session: false, failWithError: true }), async (req, res) => {
  try {
    if (!req.body.name) return res.status(400).send({ ok: false, code: ERROR_CODES.INVALID_BODY });
    if (!req.body.action_parent_id) return res.status(400).send({ ok: false, code: ERROR_CODES.INVALID_BODY });

    const parentAction = await Action.findById(req.body.action_parent_id);
    if (!parentAction) return res.status(404).send({ ok: false, code: ERROR_CODES.NOT_FOUND });

    const action = await Action.create({...req.body, excel_sheet_id: parentAction.excel_sheet_id, excel_sheet_name: parentAction.excel_sheet_name, });
    if (!action) return res.status(400).send({ ok: false, code: ERROR_CODES.INVALID_BODY });

    const indicators = await Indicator.find({ linked_action_id: parentAction._id });

    const situations = ["init", "ref", "prev", "expost"];
    const createdIndicatorValues = [];

    for (const indicator of indicators) {
      for (const situation of situations) {
        const defaultValue = indicator.value_default?.[situation]?.[indicator.value_type] ?? null;
        const indicatorValue = { 
          action_id: action._id,
          action_name: action.name,
          collectivity_id: action.collectivity_id,
          collectivity_name: action.collectivity_name,
          indicator_id: indicator._id,
          indicator_name: indicator.name,
          indicator_type: indicator.value_type,
          situation,
          value_default: { [indicator.value_type]: defaultValue },
          indicator_value_possibilities: indicator.value_possibilities || []
        };
        createdIndicatorValues.push(indicatorValue);
      }
    }
    await IndicatorValue.insertMany(createdIndicatorValues);

    await Log.create({
      model_name: "action",
      name: action.name,
      operation: 'add',
      date: new Date(),
      user_id: req.user._id,
      user_name: req.user.name,
      user_email: req.user.email,
      action_id: action._id,
      action_name: action.name,
      collectivity_id: action.collectivity_id,
      collectivity_name: action.collectivity_name,
    });
    
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
      name: action.name,
      operation: 'delete',
      date: new Date(),
      user_id: req.user._id,
      user_name: req.user.name,
      user_email: req.user.email,
      action_id: action._id,
      action_name: action.name,
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

    const indicator = await Indicator.findById(req.body.indicator_id);
    if (!indicator) return res.status(404).send({ ok: false, code: ERROR_CODES.NOT_FOUND });
    
    const situations = ["init", "ref", "prev", "expost"];
    const createdIndicatorValues = [];

    for (const situation of situations) {
      const defaultValue = indicator.value_default?.[situation]?.[indicator.value_type] ?? null;
      const indicatorValue = {  ...req.body,  situation,  value_default: { [indicator.value_type]: defaultValue }, indicator_value_possibilities: indicator.value_possibilities || [] };
      createdIndicatorValues.push(indicatorValue);
    }
    await IndicatorValue.insertMany(createdIndicatorValues);

    const totalIndicators = await IndicatorValue.countDocuments({ action_id: req.body.action_id });
    const allIndicators = await IndicatorValue.find({ action_id: req.body.action_id });
    const filledIndicators = allIndicators.filter(indicatorValue => {
      const val = indicatorValue.value?.[indicatorValue.indicator_type];
      if (indicatorValue.indicator_type === 'checkbox') return Array.isArray(val) && val.length > 0;
      return val !== null && val !== undefined && val !== '';
    }).length;
    await Action.updateOne({ _id: req.body.action_id }, { $set: { completeness: Math.round((filledIndicators / totalIndicators) * 100) } });
    
    return res.status(200).send({ ok: true });
  } catch (error) {
    capture(error);
    return res.status(500).send({ ok: false, code: ERROR_CODES.SERVER_ERROR });
  }
});


module.exports = router;