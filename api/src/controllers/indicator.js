const express = require("express");
const router = express.Router();
const passport = require("passport");
const Indicator = require("../models/indicator");
const ERROR_CODES = require("../utils/errorCodes");
const { capture } = require("../services/sentry");
const IndicatorValue = require("../models/indicator_value");
const IndicatorValueLog = require("../models/indicator_value_log");
const Action = require("../models/action");
const ActionLog = require("../models/action_log");

router.get("/:id", passport.authenticate(["admin", "user"], { session: false, failWithError: true }), async (req, res) => {
  try {
    const indicator = await Indicator.findById(req.params.id);
    if (!indicator) return res.status(404).send({ ok: false, code: ERROR_CODES.NOT_FOUND });

    return res.status(200).send({ ok: true, data: indicator });
  } catch (error) {
    capture(error);
    return res.status(500).send({ ok: false, code: ERROR_CODES.SERVER_ERROR });
  }
});

router.put("/:id", passport.authenticate(["admin", "user"], { session: false, failWithError: true }), async (req, res) => {
  try {
    const oldIndicator = await Indicator.findById(req.params.id);
    if (!oldIndicator) return res.status(404).send({ ok: false, code: ERROR_CODES.NOT_FOUND });

    const indicator = await Indicator.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.status(200).send({ ok: true, data: indicator });
    
    if (oldIndicator.value_type !== req.body.value_type || JSON.stringify(oldIndicator.value_possibilities) !== JSON.stringify(req.body.value_possibilities)) {
      const affectedValues = await IndicatorValue.find({ indicator_id: req.params.id });
      
      await Promise.all(
        affectedValues.map(async (value) => {
          try {
            const originalValue = value.toObject();
            value.set({
              indicator_type: req.body.value_type,
              indicator_value_possibilities: req.body.value_possibilities,
              value: null,
            });
            
            const modifiedPaths = value.modifiedPaths().filter((path) => path !== "updatedAt" && path !== "__v" && path !== "_user");
            
            const logs = [];
            if (modifiedPaths.length > 0) {
              for (const field of modifiedPaths) {
                const newValue = value.get(field);
                const originalFieldValue = originalValue[field];
                
                if (JSON.stringify(newValue) === JSON.stringify(originalFieldValue)) continue;

                let operation = "update";
                if (originalFieldValue === undefined && newValue !== undefined) operation = "add";

                const log = new IndicatorValueLog({
                  indicator_value_id: value._id,
                  indicator_value_name: value.name,
                  indicator_id: value.indicator_id,
                  indicator_name: value.indicator_name,
                  action_id: value.action_id,
                  action_name: value.action_name,
                  collectivity_id: value.collectivity_id,
                  collectivity_name: value.collectivity_name,
                  indicator_situation: value.situation,
                  indicator_year: value.year,
                  field: field,
                  operation: operation,
                  new_value: newValue,
                  previous_value: originalFieldValue,
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
            
            await value.save();
            
            if (logs.length > 0) {
              await IndicatorValueLog.insertMany(logs);
            }
            
            // Update action completeness
            if (value.action_id) {
              try {
                const indicatorValues = await IndicatorValue.find({ action_id: value.action_id });
                if (indicatorValues && indicatorValues.length > 0) {
                  const totalIndicators = indicatorValues.length;
                  const filledIndicators = indicatorValues.filter(
                    (iv) => iv.value !== null && iv.value !== "",
                  ).length;
                  const completeness = Math.round((filledIndicators / totalIndicators) * 100);
                  
                  const action = await Action.findById(value.action_id);
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
              } catch (error) {
                capture(error);
              }
            }
          } catch (error) {
            capture(error);
          }
        })
      );
    }
  } catch (error) {
    capture(error);
    return res.status(500).send({ ok: false, code: ERROR_CODES.SERVER_ERROR });
  }
});

router.post("/search", passport.authenticate(["admin", "user"], { session: false, failWithError: true }), async (req, res) => {
  try {
    let query = {};
    
    if (req.body._id) query._id = req.body._id;
    const limit = req.body.limit || 50;
    const skip = req.body.offset || 0;
    const total = await Indicator.countDocuments(query);
    const data = await Indicator.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit);
    return res.status(200).send({ ok: true, data, total });
  } catch (error) {
    console.log(error);
    return res.status(500).send({ ok: false, code: ERROR_CODES.SERVER_ERROR });
  }
});

router.post("/", passport.authenticate(["admin", "user"], { session: false, failWithError: true }), async (req, res) => {
  try {
    if (!req.body.name) return res.status(400).send({ ok: false, code: ERROR_CODES.INVALID_BODY });
    const indicator = await Indicator.create( req.body );

    return res.status(200).send({ ok: true, data: indicator });
  } catch (error) {
    capture(error);
    return res.status(500).send({ ok: false, data: { code: ERROR_CODES.SERVER_ERROR } });
  }
});

router.delete("/:id", passport.authenticate(["admin", "user"], { session: false, failWithError: true }), async (req, res) => {
  try {
    const indicator = await Indicator.findByIdAndDelete(req.params.id);
    if (!indicator) return res.status(404).send({ ok: false, code: ERROR_CODES.NOT_FOUND });

    return res.status(200).send({ ok: true });
  } catch (error) {
    capture(error);
    return res.status(500).send({ ok: false, code: ERROR_CODES.SERVER_ERROR });
  }
});

module.exports = router;
