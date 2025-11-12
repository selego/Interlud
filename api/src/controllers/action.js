const express = require("express");
const router = express.Router();
const passport = require("passport");
const Action = require("../models/action");
const IndicatorValue = require("../models/indicator_value");
const ERROR_CODES = require("../utils/errorCodes");
const { capture } = require("../services/sentry");
const patches = require("./patch");
const { updateActionCompleteness } = require("../utils/actions");
const { saveAndCreatePatches } = require("../utils/patch");

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
    
    action.set(req.body);
    await saveAndCreatePatches(action, req.user);
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
    const action = new Action(req.body);
    await saveAndCreatePatches(action, req.user);

    return res.status(200).send({ ok: true, data: action });
  } catch (error) {
    capture(error);
    return res.status(500).send({ ok: false, data: { code: ERROR_CODES.SERVER_ERROR } });
  }
});

router.post("/patches/search", passport.authenticate(["admin", "user"], { session: false, failWithError: true }), async (req, res) => {
  try {
    const actionIds = req.body.action_ids || [];
    
    if (actionIds.length === 0) {
      return res.status(400).send({ ok: false, code: ERROR_CODES.INVALID_BODY });
    }

    const { field_path, limit, offset } = req.body;
    
    const result = await patches.search({
      documentIds: actionIds,
      model: Action,
      field_path,
      limit,
      offset,
    });

    return res.status(200).send({ ok: true, data: result.data, total: result.total });
  } catch (error) {
    capture(error);
    if (error.message === ERROR_CODES.NOT_FOUND || error.message === ERROR_CODES.INVALID_BODY) {
      return res.status(error.message === ERROR_CODES.NOT_FOUND ? 404 : 400).send({ ok: false, code: error.message });
    }
    return res.status(500).send({ ok: false, code: ERROR_CODES.SERVER_ERROR });
  }
});

router.post("/indicator-patches/search", passport.authenticate(["admin", "user"], { session: false, failWithError: true }), async (req, res) => {
  try {
    let indicatorValueIds = [];

    if (req.body.action_id) {
      const indicatorValues = await IndicatorValue.find({ action_id: req.body.action_id });
      if (!indicatorValues || indicatorValues.length === 0) {
        return res.status(200).send({ ok: true, data: [], total: 0 });
      }
      indicatorValueIds = indicatorValues.map(iv => iv._id.toString());
    } else if (req.body.indicator_value_ids) {
      indicatorValueIds = Array.isArray(req.body.indicator_value_ids) 
        ? req.body.indicator_value_ids 
        : [req.body.indicator_value_ids];
    } else {
      return res.status(400).send({ ok: false, code: ERROR_CODES.INVALID_BODY });
    }

    if (indicatorValueIds.length === 0) {
      return res.status(200).send({ ok: true, data: [], total: 0 });
    }

    const { field_path, limit, offset } = req.body;
    
    const result = await patches.search({
      documentIds: indicatorValueIds,
      model: IndicatorValue,
      field_path,
      limit,
      offset,
    });

    return res.status(200).send({ ok: true, data: result.data, total: result.total });
  } catch (error) {
    capture(error);
    if (error.message === ERROR_CODES.NOT_FOUND || error.message === ERROR_CODES.INVALID_BODY) {
      return res.status(error.message === ERROR_CODES.NOT_FOUND ? 404 : 400).send({ ok: false, code: error.message });
    }
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
      const indicatorValue = new IndicatorValue({ ...req.body, situation });
      await saveAndCreatePatches(indicatorValue, req.user);
      createdValues.push(indicatorValue);
    }

    await updateActionCompleteness(req.body.action_id, IndicatorValue, req.user);

    return res.status(200).send({ ok: true, data: createdValues });
  } catch (error) {
    capture(error);
    return res.status(500).send({ ok: false, code: ERROR_CODES.SERVER_ERROR });
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


module.exports = router;