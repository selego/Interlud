const express = require("express");
const router = express.Router();
const passport = require("passport");
const IndicatorValue = require("../models/indicator_value");
const ERROR_CODES = require("../utils/errorCodes");
const { capture } = require("../services/sentry");
const IndicatorValueLog = require("../models/indicator_value_log");
const Action = require("../models/action");
const ActionLog = require("../models/action_log");

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
    
    const originalIndicatorValue = indicatorValue.toObject();
    indicatorValue.set(req.body);
    
    const modifiedPaths = indicatorValue.modifiedPaths().filter((path) => path !== "updatedAt" && path !== "__v" && path !== "_user");
    
    const logs = [];
    if (modifiedPaths.length > 0) {
      for (const field of modifiedPaths) {
        const newValue = indicatorValue.get(field);
        const originalValue = originalIndicatorValue[field];
        
        if (JSON.stringify(newValue) === JSON.stringify(originalValue)) continue;

        let operation = "update";
        if (originalValue === undefined && newValue !== undefined) operation = "add";

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
          trigger_action_id: null,
          trigger_action_name: null,
        });
        logs.push(log);
      }
    }
    
    await indicatorValue.save();
    
    if (logs.length > 0) {
      await IndicatorValueLog.insertMany(logs);
    }
    
    // Update action completeness
    if (indicatorValue.action_id) {
      try {
        const indicatorValues = await IndicatorValue.find({ action_id: indicatorValue.action_id });
        if (indicatorValues && indicatorValues.length > 0) {
          const totalIndicators = indicatorValues.length;
          const filledIndicators = indicatorValues.filter(
            (iv) => iv.value !== null && iv.value !== "",
          ).length;
          const completeness = Math.round((filledIndicators / totalIndicators) * 100);
          
          const action = await Action.findById(indicatorValue.action_id);
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
    
    res.status(200).send({ ok: true, data: indicatorValue });

    if (indicatorValue.indicator_id && indicatorValue.situation && indicatorValue.collectivity_id) {
      const filters = {
        indicator_id: indicatorValue.indicator_id,
        situation: indicatorValue.situation,
        year: indicatorValue.year,
        collectivity_id: indicatorValue.collectivity_id,
        _id: { $ne: indicatorValue._id },
      };
            
      const affectedValues = await IndicatorValue.find(filters);

      await Promise.all(
        affectedValues.map(async (value) => {
          try {
            const originalValue = value.toObject();
            value.set({ value: indicatorValue.value });
            
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
                  trigger_action_id: originalIndicatorValue.action_id,
                  trigger_action_name: originalIndicatorValue.action_name,
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
    const indicatorValue = await IndicatorValue.create( req.body );
    
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
    
    // Update action completeness
    if (indicatorValue.action_id) {
      try {
        const indicatorValues = await IndicatorValue.find({ action_id: indicatorValue.action_id });
        if (indicatorValues && indicatorValues.length > 0) {
          const totalIndicators = indicatorValues.length;
          const filledIndicators = indicatorValues.filter(
            (iv) => iv.value !== null && iv.value !== "",
          ).length;
          const completeness = Math.round((filledIndicators / totalIndicators) * 100);
          
          const action = await Action.findById(indicatorValue.action_id);
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
    
    // Update action completeness
    if (actionId) {
      try {
        const indicatorValues = await IndicatorValue.find({ action_id: actionId });
        if (indicatorValues && indicatorValues.length > 0) {
          const totalIndicators = indicatorValues.length;
          const filledIndicators = indicatorValues.filter(
            (iv) => iv.value !== null && iv.value !== "",
          ).length;
          const completeness = Math.round((filledIndicators / totalIndicators) * 100);
          
          const action = await Action.findById(actionId);
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
    
    return res.status(200).send({ ok: true });
  } catch (error) {
    capture(error);
    return res.status(500).send({ ok: false, code: ERROR_CODES.SERVER_ERROR });
  }
});

module.exports = router;
