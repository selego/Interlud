const express = require("express");
const router = express.Router();
const passport = require("passport");
const UserActionRight = require("../models/user_action_right");
const ERROR_CODES = require("../utils/errorCodes");
const { capture } = require("../services/sentry");

router.put("/:id", passport.authenticate(["admin", "user"], { session: false, failWithError: true }), async (req, res) => {
  try {
    const userActionRight = await UserActionRight.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!userActionRight) return res.status(404).send({ ok: false, code: ERROR_CODES.NOT_FOUND });
    return res.status(200).send({ ok: true, data: userActionRight });
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
    const total = await UserActionRight.countDocuments(query);
    const data = await UserActionRight.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit);
    return res.status(200).send({ ok: true, data, total });
  } catch (error) {
    console.log(error);
    return res.status(500).send({ ok: false, code: ERROR_CODES.SERVER_ERROR });
  }
});

router.post("/", passport.authenticate(["admin", "user"], { session: false, failWithError: true }), async (req, res) => {
  try {
    
    const userActionRight = await UserActionRight.create( req.body );

    return res.status(200).send({ ok: true, data: userActionRight });
  } catch (error) {
    capture(error);
    return res.status(500).send({ ok: false, data: { code: ERROR_CODES.SERVER_ERROR } });
  }
});

router.delete("/:id", passport.authenticate(["admin", "user"], { session: false, failWithError: true }), async (req, res) => {
  try {
    const userActionRight = await UserActionRight.findByIdAndDelete(req.params.id);
    if (!userActionRight) return res.status(404).send({ ok: false, code: ERROR_CODES.NOT_FOUND });

    return res.status(200).send({ ok: true });
  } catch (error) {
    capture(error);
    return res.status(500).send({ ok: false, code: ERROR_CODES.SERVER_ERROR });
  }
});

module.exports = router;
