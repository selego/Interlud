const express = require("express");
const router = express.Router();
const passport = require("passport");
const UserIndicatorRight = require("../models/user_indicator_right");
const ERROR_CODES = require("../utils/errorCodes");
const { capture } = require("../services/sentry");

router.put("/:id", passport.authenticate(["admin", "user"], { session: false, failWithError: true }), async (req, res) => {
  try {
    const userIndicatorRight = await UserIndicatorRight.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!userIndicatorRight) return res.status(404).send({ ok: false, code: ERROR_CODES.NOT_FOUND });
    return res.status(200).send({ ok: true, data: userIndicatorRight });
  } catch (error) {
    capture(error);
    return res.status(500).send({ ok: false, code: ERROR_CODES.SERVER_ERROR });
  }
});

router.post("/search", passport.authenticate(["admin", "user"], { session: false, failWithError: true }), async (req, res) => {
  try {
    let query = {};

    const limit = req.body.limit || 50;
    const skip = req.body.offset || 0;
    if (req.body.user_id) query.user_id = req.body.user_id;
    const total = await UserIndicatorRight.countDocuments(query);
    const data = await UserIndicatorRight.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit);
    return res.status(200).send({ ok: true, data, total });
  } catch (error) {
    console.log(error);
    return res.status(500).send({ ok: false, code: ERROR_CODES.SERVER_ERROR });
  }
});

router.post("/", passport.authenticate(["admin", "user"], { session: false, failWithError: true }), async (req, res) => {
  try {
    const userIndicatorRight = await UserIndicatorRight.create(req.body);
    return res.status(200).send({ ok: true, data: userIndicatorRight });
  } catch (error) {
    capture(error);
    return res.status(500).send({ ok: false, data: { code: ERROR_CODES.SERVER_ERROR } });
  }
});

router.delete("/:id", passport.authenticate(["admin", "user"], { session: false, failWithError: true }), async (req, res) => {
  try {
    const userIndicatorRight = await UserIndicatorRight.findByIdAndDelete(req.params.id);
    if (!userIndicatorRight) return res.status(404).send({ ok: false, code: ERROR_CODES.NOT_FOUND });

    return res.status(200).send({ ok: true });
  } catch (error) {
    capture(error);
    return res.status(500).send({ ok: false, code: ERROR_CODES.SERVER_ERROR });
  }
});

module.exports = router;

