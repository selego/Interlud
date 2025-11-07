const express = require("express");
const router = express.Router();
const passport = require("passport");
const IndicatorValue = require("../models/indicator_value");
const ERROR_CODES = require("../utils/errorCodes");
const { capture } = require("../services/sentry");
const { updateActionCompleteness } = require("../utils/actions");
const patches = require("./patch");

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
    indicatorValue.set(req.body);
    await indicatorValue.save({ fromUser: req.user });

    if (indicatorValue.indicator_id && indicatorValue.situation && indicatorValue.collectivity_id) {
      const filters = {
        indicator_id: indicatorValue.indicator_id,
        situation: indicatorValue.situation,
        year: indicatorValue.year,
        collectivity_id: indicatorValue.collectivity_id,
        _id: { $ne: indicatorValue._id }
      };
            
      const affectedValues = await IndicatorValue.find(filters);
      
      await Promise.all(
        affectedValues.map(async (value) => {
          value.value = indicatorValue.value;
          return value.save({ fromUser: req.user });
        })
      );
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

router.post("/apply-defaults", passport.authenticate(["admin", "user"], { session: false, failWithError: true }), async (req, res) => {
  try {
    const { ids } = req.body;
    
    if (!ids || !Array.isArray(ids) || ids.length === 0)  return res.status(400).send({ ok: false, code: ERROR_CODES.SERVER_ERROR });
    
    const valuesToUpdate = await IndicatorValue.find({ 
      _id: { $in: ids },
      indicator_default_value: { $exists: true, $ne: null, $nin: [null, ""] },
      $expr: {
        $cond: [
          { $isArray: "$indicator_value_possibilities" },
          { $in: [ "$indicator_default_value", "$indicator_value_possibilities" ] },
          true // if not array, skip the check 
        ]
      }
    });

    if (valuesToUpdate.length === 0) return res.status(200).send({ ok: true, data: [] });

    const updatedValues = [];

    for (const value of valuesToUpdate) {
      value.set({ value: value.indicator_default_value });
      await value.save({ fromUser: req.user });

      if (value.indicator_id && value.situation && value.collectivity_id) {
        const filters = {
          indicator_id: value.indicator_id,
          situation: value.situation,
          year: value.year,
          collectivity_id: value.collectivity_id,
          _id: { $ne: value._id }
        };

        const affectedValues = await IndicatorValue.find(filters);

        await Promise.all(
          affectedValues.map(async (affectedValue) => {
            affectedValue.value = value.value;
            return affectedValue.save({ fromUser: req.user });
          })
        );
      }

      updatedValues.push(value);
    }

    return res.status(200).send({ ok: true, data: updatedValues });
  } catch (error) {
    capture(error);
    return res.status(500).send({ ok: false, code: ERROR_CODES.SERVER_ERROR });
  }
});

router.post("/", passport.authenticate(["admin", "user"], { session: false, failWithError: true }), async (req, res) => {
  try {
    const indicatorValue = await IndicatorValue.create( req.body );
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
    if (actionId) {
      await updateActionCompleteness(actionId, IndicatorValue, req.user);
    }
    await indicatorValue.deleteOne();

    return res.status(200).send({ ok: true });
  } catch (error) {
    capture(error);
    return res.status(500).send({ ok: false, code: ERROR_CODES.SERVER_ERROR });
  }
});

module.exports = router;
