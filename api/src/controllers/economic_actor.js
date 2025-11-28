const express = require("express");
const router = express.Router();
const passport = require("passport");
const EconomicActor = require("../models/economic_actor");
const Collectivity = require("../models/collectivity");
const User = require("../models/user");
const ERROR_CODES = require("../utils/errorCodes");
const { capture } = require("../services/sentry");

router.post("/", passport.authenticate(["admin", "user"], { session: false, failWithError: true }), async (req, res) => {
  try {
    const { name, collectivity } = req.body;
    if (!name || !collectivity) return res.status(400).send({ ok: false, code: ERROR_CODES.INVALID_BODY });

    const actor = await EconomicActor.create({ name, collectivity_id: collectivity.id, collectivity_name: collectivity.name });
    return res.status(200).send({ ok: true, data: actor });
  } catch (error) {
    capture(error);
    return res.status(500).send({ ok: false, code: ERROR_CODES.SERVER_ERROR });
  }
});

router.post("/search", passport.authenticate(["admin", "user"], { session: false, failWithError: true }), async (req, res) => {
  try {
    const query = {};
    if (req.body.collectivity_id) query.collectivity_id = req.body.collectivity_id;
    if (req.body.status) query.status = req.body.status;
    if (req.body.search) {
      query.$or = [{ name: { $regex: req.body.search, $options: "i" } }, { description: { $regex: req.body.search, $options: "i" } }];
    }

    const limit = req.body.limit || 50;
    const skip = req.body.offset || 0;
    const total = await EconomicActor.countDocuments(query);
    const data = await EconomicActor.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit);
    return res.status(200).send({ ok: true, data, total });
  } catch (error) {
    capture(error);
    return res.status(500).send({ ok: false, code: ERROR_CODES.SERVER_ERROR });
  }
});

router.get("/:id", passport.authenticate(["admin", "user"], { session: false, failWithError: true }), async (req, res) => {
  try {
    const actor = await EconomicActor.findById(req.params.id);
    if (!actor) return res.status(404).send({ ok: false, code: ERROR_CODES.NOT_FOUND });
    return res.status(200).send({ ok: true, data: actor });
  } catch (error) {
    capture(error);
    return res.status(500).send({ ok: false, code: ERROR_CODES.SERVER_ERROR });
  }
});

router.put("/:id", passport.authenticate(["admin", "user"], { session: false, failWithError: true }), async (req, res) => {
  try {
    const actor = await EconomicActor.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!actor) return res.status(404).send({ ok: false, code: ERROR_CODES.NOT_FOUND });

    return res.status(200).send({ ok: true, data: actor });
  } catch (error) {
    capture(error);
    return res.status(500).send({ ok: false, code: ERROR_CODES.SERVER_ERROR });
  }
});

router.delete("/:id", passport.authenticate(["admin", "user"], { session: false, failWithError: true }), async (req, res) => {
  try {
    const actor = await EconomicActor.findByIdAndDelete(req.params.id);
    if (!actor) return res.status(404).send({ ok: false, code: ERROR_CODES.NOT_FOUND });
    return res.status(200).send({ ok: true });
  } catch (error) {
    capture(error);
    return res.status(500).send({ ok: false, code: ERROR_CODES.SERVER_ERROR });
  }
});

module.exports = router;
