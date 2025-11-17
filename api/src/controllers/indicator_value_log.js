const express = require("express");
const router = express.Router();
const passport = require("passport");
const IndicatorValueLog = require("../models/indicator_value_log");
const ERROR_CODES = require("../utils/errorCodes");
const { capture } = require("../services/sentry");
const { getTimeframeDates } = require("../utils");

router.post("/search",passport.authenticate(["admin"], { session: false, failWithError: true }), async (req, res) => {
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

      if (req.body.indicator_value_id && Array.isArray(req.body.indicator_value_id) && req.body.indicator_value_id.length > 0) {
        query.indicator_value_id = { $in: req.body.indicator_value_id };
      } else if (req.body.indicator_value_id) {
        query.indicator_value_id = req.body.indicator_value_id;
      }

      if (req.body.action_id && Array.isArray(req.body.action_id) && req.body.action_id.length > 0) {
        query.action_id = { $in: req.body.action_id };
      } else if (req.body.action_id) {
        query.action_id = req.body.action_id;
      }

      if (req.body.indicator_id && Array.isArray(req.body.indicator_id) && req.body.indicator_id.length > 0) {
        query.indicator_id = { $in: req.body.indicator_id };
      } else if (req.body.indicator_id) {
        query.indicator_id = req.body.indicator_id;
      }

      if (req.body.trigger_action_id && Array.isArray(req.body.trigger_action_id) && req.body.trigger_action_id.length > 0) {
        query.trigger_action_id = { $in: req.body.trigger_action_id };
      } else if (req.body.trigger_action_id) {
        query.trigger_action_id = req.body.trigger_action_id;
      }

      const limit = req.body.limit || 50;
      const skip = req.body.offset || 0;

      const total = await IndicatorValueLog.countDocuments(query);

      const data = await IndicatorValueLog.find(query).sort({ date: -1 }).skip(skip).limit(limit).lean();

      return res.status(200).send({ ok: true, data, total });
    } catch (error) {
      capture(error);
      return res.status(500).send({ ok: false, code: ERROR_CODES.SERVER_ERROR });
    }
  },
);

module.exports = router;
