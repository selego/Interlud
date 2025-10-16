const express = require("express");
const router = express.Router();
const passport = require("passport");
const IndicatorCategory = require("../models/indicator_category");
const ERROR_CODES = require("../utils/errorCodes");
const { capture } = require("../services/sentry");

router.get("/", passport.authenticate(["admin", "user"], { session: false, failWithError: true }), async (req, res) => {
  try {
    const indicatorCategories = await IndicatorCategory.find({});
    return res.status(200).send({ ok: true, data: indicatorCategories });
  } catch (error) {
    capture(error);
    return res.status(500).send({ ok: false, code: ERROR_CODES.SERVER_ERROR });
  }
});

router.get("/:id", passport.authenticate(["admin", "user"], { session: false, failWithError: true }), async (req, res) => {
  try {
    const indicatorCategory = await IndicatorCategory.findById(req.params.id);
    if (!indicatorCategory) return res.status(404).send({ ok: false, code: ERROR_CODES.NOT_FOUND });

    return res.status(200).send({ ok: true, data: indicatorCategory });
  } catch (error) {
    capture(error);
    return res.status(500).send({ ok: false, code: ERROR_CODES.SERVER_ERROR });
  }
});

router.put("/:id", passport.authenticate(["admin", "user"], { session: false, failWithError: true }), async (req, res) => {
  try {
    const indicatorCategory = await IndicatorCategory.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!indicatorCategory) return res.status(404).send({ ok: false, code: ERROR_CODES.NOT_FOUND });
    return res.status(200).send({ ok: true, data: indicatorCategory });
  } catch (error) {
    capture(error);
    return res.status(500).send({ ok: false, code: ERROR_CODES.SERVER_ERROR });
  }
});

router.post("/search", passport.authenticate(["admin", "user"], { session: false, failWithError: true }), async (req, res) => {
  try {
    let query = {};

    if (req.body.type) { query.type = req.body.type; }
    const limit = req.body.limit || 50;
    const skip = req.body.offset || 0;
    const total = await IndicatorCategory.countDocuments(query);
    const data = await IndicatorCategory.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit);
    return res.status(200).send({ ok: true, data, total });
  } catch (error) {
    console.log(error);
    return res.status(500).send({ ok: false, code: ERROR_CODES.SERVER_ERROR });
  }
});

router.post("/", passport.authenticate(["admin", "user"], { session: false, failWithError: true }), async (req, res) => {
  try {
    if (!req.body.name) return res.status(400).send({ ok: false, code: ERROR_CODES.INVALID_BODY });
    const indicatorCategory = await IndicatorCategory.create( req.body );

    return res.status(200).send({ ok: true, data: indicatorCategory });
  } catch (error) {
    capture(error);
    return res.status(500).send({ ok: false, data: { code: ERROR_CODES.SERVER_ERROR } });
  }
});

router.delete("/:id", passport.authenticate(["admin", "user"], { session: false, failWithError: true }), async (req, res) => {
  try {
    const indicatorCategory = await IndicatorCategory.findByIdAndDelete(req.params.id);
    if (!indicatorCategory) return res.status(404).send({ ok: false, code: ERROR_CODES.NOT_FOUND });

    return res.status(200).send({ ok: true });
  } catch (error) {
    capture(error);
    return res.status(500).send({ ok: false, code: ERROR_CODES.SERVER_ERROR });
  }
});

module.exports = router;
