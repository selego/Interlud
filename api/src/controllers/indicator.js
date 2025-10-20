const express = require("express");
const router = express.Router();
const passport = require("passport");
const Indicator = require("../models/indicator");
const ERROR_CODES = require("../utils/errorCodes");
const { capture } = require("../services/sentry");

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
    const indicator = await Indicator.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!indicator) return res.status(404).send({ ok: false, code: ERROR_CODES.NOT_FOUND });
    return res.status(200).send({ ok: true, data: indicator });
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
