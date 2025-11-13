const express = require("express");
const router = express.Router();
const passport = require("passport");
const ActionPatch = require("../models/action_patch");
const ERROR_CODES = require("../utils/errorCodes");
const { capture } = require("../services/sentry");
const { getTimeframeDates } = require("../utils/patch");

router.post("/search", passport.authenticate(["admin", "user"], { session: false, failWithError: true }), async (req, res) => {
  try {
    let query = {};

    if (req.body.path) query.path = req.body.path;
    if (req.body.op) query.op = req.body.op;

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

    if (req.body.ref && Array.isArray(req.body.ref) && req.body.ref.length > 0) query.ref = { $in: req.body.ref };

    const limit = req.body.limit || 50;
    const skip = req.body.offset || 0;

    const total = await ActionPatch.countDocuments(query);

    const data = await ActionPatch.find(query)
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

