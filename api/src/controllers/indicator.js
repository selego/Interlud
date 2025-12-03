const express = require("express");
const router = express.Router();
const passport = require("passport");
const Indicator = require("../models/indicator");
const ERROR_CODES = require("../utils/errorCodes");
const { capture } = require("../services/sentry");
const IndicatorValue = require("../models/indicator_value");
const Log = require("../models/log");

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

    const logs = [];
    
    for (const field of Object.keys(req.body)) {
      if (["updatedAt", "__v", "createdAt", "_id"].includes(field)) continue;
      let newValue = req.body[field];
      const originalValue = oldIndicator[field];
      if (originalValue instanceof Date && typeof newValue === 'string')  newValue = new Date(newValue);
      
      if (JSON.stringify(newValue) === JSON.stringify(originalValue)) continue;

      let logType = typeof newValue;
      if (newValue instanceof Date) logType = 'date';
      if (Array.isArray(newValue)) logType = 'array';
      
      logs.push(new Log({
        model_name: "indicator",
        name: oldIndicator.name,
        field: field,
        operation: 'update',
        new_value: { [logType]: newValue },
        previous_value: { [logType]: originalValue },
        type_value: logType,
        indicator_id: oldIndicator._id,
        indicator_name: oldIndicator.name,
      }));
    }

    if (logs.length > 0) await Log.insertMany(logs);

    const indicator = await Indicator.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.status(200).send({ ok: true, data: indicator });
    
    if (oldIndicator.value_type !== req.body.value_type || JSON.stringify(oldIndicator.value_possibilities) !== JSON.stringify(req.body.value_possibilities)) {
      IndicatorValue.updateMany(
        { indicator_id: req.params.id }, 
        { 
          $set: { indicator_type: req.body.value_type, indicator_value_possibilities: req.body.value_possibilities, value: null } 
        }
      ).catch(error => { capture(error)});
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
    if (req.body.name) query.name = { $regex: req.body.name, $options: "i" };
    const limit = req.body.limit || 10;
    const skip = req.body.page * limit;
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

    await Log.create({
      model_name: "indicator",
      name: indicator.name,
      operation: 'add',
      new_value: req.body.name,
      previous_value: null,
      date: new Date(),
      user_id: req.user._id,
      user_name: req.user.name,
      user_email: req.user.email,
      indicator_id: indicator._id,
      indicator_name: indicator.name,
    });
    

    return res.status(200).send({ ok: true, data: indicator });
  } catch (error) {
    capture(error);
    return res.status(500).send({ ok: false, data: { code: ERROR_CODES.SERVER_ERROR } });
  }
});

router.delete("/:id", passport.authenticate(["admin", "user"], { session: false, failWithError: true }), async (req, res) => {
  try {
    const indicator = await Indicator.findOne({ _id: req.params.id });
    if (!indicator) return res.status(404).send({ ok: false, code: ERROR_CODES.NOT_FOUND });

    await Log.create({
      model_name: "indicator",
      name: indicator.name,
      operation: 'delete',
      date: new Date(),
      user_id: req.user._id,
      user_name: req.user.name,
      user_email: req.user.email,  
      indicator_id: indicator._id,
      indicator_name: indicator.name,
    });

    await Indicator.deleteOne({ _id: req.params.id });

    return res.status(200).send({ ok: true });
  } catch (error) {
    capture(error);
    return res.status(500).send({ ok: false, code: ERROR_CODES.SERVER_ERROR });
  }
});

module.exports = router;
