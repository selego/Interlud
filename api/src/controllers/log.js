const express = require("express");
const router = express.Router();
const passport = require("passport");
const Log = require("../models/log");
const ERROR_CODES = require("../utils/errorCodes");
const { capture } = require("../services/sentry");

router.get("/:id", passport.authenticate(["admin", "user"], { session: false, failWithError: true }), async (req, res) => {
  try {
    const log = await Log.findById(req.params.id);
    if (!log) return res.status(404).send({ ok: false, code: ERROR_CODES.NOT_FOUND });

    return res.status(200).send({ ok: true, data: log });
  } catch (error) {
    capture(error);
    return res.status(500).send({ ok: false, code: ERROR_CODES.SERVER_ERROR });
  }
});

router.put("/:id", passport.authenticate(["admin", "user"], { session: false, failWithError: true }), async (req, res) => {
  try {
    const { model_name, name, field, operation, new_value, previous_value, type_value, date, source, user_id, user_name, user_email, indicator_value_id, indicator_value_name, indicator_category_id, indicator_category_name, user_action_right_id, user_action_right_name, collectivity_id, collectivity_name, action_id, action_name, economic_actor_id, economic_actor_name, indicator_id, indicator_name } = req.body;
    const log = await Log.findByIdAndUpdate(req.params.id, { model_name, name, field, operation, new_value, previous_value, type_value, date, source, user_id, user_name, user_email, indicator_value_id, indicator_value_name, indicator_category_id, indicator_category_name, user_action_right_id, user_action_right_name, collectivity_id, collectivity_name, action_id, action_name, economic_actor_id, economic_actor_name, indicator_id, indicator_name }, { new: true });
    if (!log) return res.status(404).send({ ok: false, code: ERROR_CODES.NOT_FOUND });
    return res.status(200).send({ ok: true, data: log });
  } catch (error) {
    capture(error);
    return res.status(500).send({ ok: false, code: ERROR_CODES.SERVER_ERROR });
  }
});

router.post("/search", passport.authenticate(["admin", "user"], { session: false, failWithError: true }), async (req, res) => {
  try {
    let query = {};

    if (req.body.model_name) { query.model_name = req.body.model_name; }
    if (req.body.action_id) { query.action_id = req.body.action_id; }
    if (req.body.name) { query.name = req.body.name; }
    if (req.body.field) { query.field = req.body.field; }
    if (req.body.operation) { query.operation = req.body.operation; }
    if (req.body.new_value) { query.new_value = req.body.new_value; }
    if (req.body.previous_value) { query.previous_value = req.body.previous_value; }
    if (req.body.date) { query.date = req.body.date; }
    const limit = req.body.limit || 50;
    const skip = req.body.offset || 0;
    const total = await Log.countDocuments(query);
    const data = await Log.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit);
    return res.status(200).send({ ok: true, data, total });
  } catch (error) {
    capture(error);
    return res.status(500).send({ ok: false, code: ERROR_CODES.SERVER_ERROR });
  }
});

router.post("/", passport.authenticate(["admin", "user"], { session: false, failWithError: true }), async (req, res) => {
  try {
    const { model_name, name, field, operation, new_value, previous_value, type_value, date, source, user_id, user_name, user_email, indicator_value_id, indicator_value_name, indicator_category_id, indicator_category_name, user_action_right_id, user_action_right_name, collectivity_id, collectivity_name, action_id, action_name, economic_actor_id, economic_actor_name, indicator_id, indicator_name } = req.body;
    if (!name) return res.status(400).send({ ok: false, code: ERROR_CODES.INVALID_BODY });
    const log = await Log.create({ model_name, name, field, operation, new_value, previous_value, type_value, date, source, user_id, user_name, user_email, indicator_value_id, indicator_value_name, indicator_category_id, indicator_category_name, user_action_right_id, user_action_right_name, collectivity_id, collectivity_name, action_id, action_name, economic_actor_id, economic_actor_name, indicator_id, indicator_name });

    return res.status(200).send({ ok: true, data: log });
  } catch (error) {
    capture(error);
    return res.status(500).send({ ok: false, code: ERROR_CODES.SERVER_ERROR });
  }
});

router.delete("/:id", passport.authenticate(["admin", "user"], { session: false, failWithError: true }), async (req, res) => {
  try {
    const log = await Log.findByIdAndDelete(req.params.id);
    if (!log) return res.status(404).send({ ok: false, code: ERROR_CODES.NOT_FOUND });

    return res.status(200).send({ ok: true });
  } catch (error) {
    capture(error);
    return res.status(500).send({ ok: false, code: ERROR_CODES.SERVER_ERROR });
  }
});

module.exports = router;
