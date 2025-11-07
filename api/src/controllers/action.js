const express = require("express");
const router = express.Router();
const passport = require("passport");
const Action = require("../models/action");
const IndicatorValue = require("../models/indicator_value");
const ERROR_CODES = require("../utils/errorCodes");
const { capture } = require("../services/sentry");
const patches = require("./patch");

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
    await action.save({ fromUser: req.user });
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

    return res.status(200).send({ ok: true, data: action });
  } catch (error) {
    capture(error);
    return res.status(500).send({ ok: false, data: { code: ERROR_CODES.SERVER_ERROR } });
  }
});

router.get("/:id/patches", passport.authenticate(["admin"], { session: false, failWithError: true }), async (req, res) => {
  try {
    const action = await Action.findById(req.params.id);
    if (!action) return res.status(404).send({ ok: false, code: ERROR_CODES.NOT_FOUND });

    const actionPatches = await patches.get(req, Action);
    return res.status(200).send({ ok: true, data: actionPatches });
  } catch (error) {
    capture(error);
    if (error.message === ERROR_CODES.NOT_FOUND || error.message === ERROR_CODES.INVALID_BODY) {
      return res.status(error.message === ERROR_CODES.NOT_FOUND ? 404 : 400).send({ ok: false, code: error.message });
    }
    return res.status(500).send({ ok: false, code: ERROR_CODES.SERVER_ERROR });
  }
});

router.get("/:id/last-patch", passport.authenticate(["admin", "user"], { session: false, failWithError: true }), async (req, res) => {
  try {
    const action = await Action.findById(req.params.id);
    if (!action) return res.status(404).send({ ok: false, code: ERROR_CODES.NOT_FOUND });

    const allPatches = await patches.get(req, Action);
    
    const completenessPatch = allPatches.find(patch => 
      patch.ops && patch.ops.some(op => op.path === "/completeness")
    );
    if (!completenessPatch) return res.status(200).send({ ok: true, data: { completeness: action.completeness, updatedAt: action.updatedAt } });
    const completeness = completenessPatch.ops.find(op => op.path === "/completeness").value;
    return res.status(200).send({  ok: true, data: { completeness: completeness, updatedAt: completenessPatch.date, updatedByUser: completenessPatch.user } });
  } catch (error) {
    capture(error);
    return res.status(500).send({ ok: false, code: ERROR_CODES.SERVER_ERROR });
  }
});

router.get("/:id/indicator-patches", passport.authenticate(["admin"], { session: false, failWithError: true }), async (req, res) => {
  try {
    const action = await Action.findById(req.params.id);
    if (!action) return res.status(404).send({ ok: false, code: ERROR_CODES.NOT_FOUND });

    const indicatorPatches = await patches.getIndicatorPatchesForAction(req.params.id, IndicatorValue);
    return res.status(200).send({ ok: true, data: indicatorPatches });
  } catch (error) {
    capture(error);
    if (error.message === ERROR_CODES.NOT_FOUND || error.message === ERROR_CODES.INVALID_BODY) {
      return res.status(error.message === ERROR_CODES.NOT_FOUND ? 404 : 400).send({ ok: false, code: error.message });
    }
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
