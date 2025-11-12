const express = require("express");
const router = express.Router();
const passport = require("passport");
const IndicatorValue = require("../models/indicator_value");
const ERROR_CODES = require("../utils/errorCodes");
const { capture } = require("../services/sentry");
const { updateActionCompleteness, updateMultipleActionsCompleteness } = require("../utils/actions");
const patches = require("./patch");
const { createPatches } = require("../utils/patch");

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
    const indicatorValue = await IndicatorValue.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!indicatorValue) return res.status(404).send({ ok: false, code: ERROR_CODES.NOT_FOUND });
    await createPatches(indicatorValue, req.user);
    await updateActionCompleteness(indicatorValue.action_id, IndicatorValue, req.user);

    if (indicatorValue.indicator_id && indicatorValue.situation && indicatorValue.collectivity_id) {
      const filters = {
        indicator_id: indicatorValue.indicator_id,
        situation: indicatorValue.situation,
        year: indicatorValue.year,
        collectivity_id: indicatorValue.collectivity_id,
        _id: { $ne: indicatorValue._id },
      };
            
      const affectedValues = await IndicatorValue.find(filters);
      
      await IndicatorValue.updateMany(filters, { $set: { value: indicatorValue.value } }).catch((error) => {
        capture(error);
      });

      await updateMultipleActionsCompleteness(affectedValues.map(v => v.action_id), IndicatorValue);
    }
    
    return res.status(200).send({ ok: true, data: indicatorValue });
  } catch (error) {
    capture(error);
    return res.status(500).send({ ok: false, code: ERROR_CODES.SERVER_ERROR });
  }
});

router.get("/:id/patches", passport.authenticate(["admin"], { session: false, failWithError: true }), async (req, res) => {
  try {
    const indicatorValue = await IndicatorValue.findById(req.params.id);
    if (!indicatorValue) return res.status(404).send({ ok: false, code: ERROR_CODES.NOT_FOUND });

    const indicatorValuePatches = await patches.get(req, IndicatorValue);
    return res.status(200).send({ ok: true, data: indicatorValuePatches });
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
    const indicatorValue = new IndicatorValue(req.body);
    await createPatches(indicatorValue, req.user);
    await updateActionCompleteness(indicatorValue.action_id, IndicatorValue);
    return res.status(200).send({ ok: true, data: indicatorValue });
  } catch (error) {
    capture(error);
    return res.status(500).send({ ok: false, data: { code: ERROR_CODES.SERVER_ERROR } });
  }
});

router.delete("/:id", passport.authenticate(["admin", "user"], { session: false, failWithError: true }), async (req, res) => {
  try {
    const indicatorValue = await IndicatorValue.findById(req.params.id);
    if (!indicatorValue) return res.status(404).send({ ok: false, code: ERROR_CODES.NOT_FOUND });
    const actionId = indicatorValue.action_id;
    await IndicatorValue.deleteOne({ _id: req.params.id });
    await updateActionCompleteness(actionId, IndicatorValue);
    return res.status(200).send({ ok: true });
  } catch (error) {
    capture(error);
    return res.status(500).send({ ok: false, code: ERROR_CODES.SERVER_ERROR });
  }
});

module.exports = router;
