const express = require("express");
const router = express.Router();
const passport = require("passport");
const ActionLog = require("../models/action_log");
const ERROR_CODES = require("../utils/errorCodes");
const { capture } = require("../services/sentry");
const { getTimeframeDates } = require("../utils");

router.post("/search", passport.authenticate(["admin", "user"], { session: false, failWithError: true }), async (req, res) => {
  try {
    let query = {};

    if (req.body.field) query.field = req.body.field;
    if (req.body.operation) query.operation = req.body.operation;

    if (req.body.timeframe && req.body.timeframe !== "all") {
      const { startDate, endDate } = getTimeframeDates(req.body.timeframe);
      if (startDate && endDate) {
        query.date = { $gte: startDate, $lte: endDate };
      }
    } else if (req.body.date_from || req.body.date_to) {
      query.date = {};
      if (req.body.date_from) query.date.$gte = new Date(req.body.date_from);
      if (req.body.date_to) query.date.$lte = new Date(req.body.date_to);
    }

    if (req.body.action_id && Array.isArray(req.body.action_id) && req.body.action_id.length > 0) {
      query.action_id = { $in: req.body.action_id };
    } else if (req.body.action_id) {
      query.action_id = req.body.action_id;
    }

    const limit = req.body.limit || 50;
    const skip = req.body.offset || 0;

    const total = await ActionLog.countDocuments(query);

    const data = await ActionLog.find(query)
      .sort({ date: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    return res.status(200).send({ ok: true, data, total });
  } catch (error) {
    capture(error);
    return res.status(500).send({ ok: false, code: ERROR_CODES.SERVER_ERROR });
  }
});

module.exports = router;

