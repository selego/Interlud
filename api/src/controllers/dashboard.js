const express = require('express');
const router = express.Router();
const passport = require('passport');
const Action = require('../models/action');
const ERROR_CODES = require('../utils/errorCodes');
const { capture } = require('../services/sentry');

router.post('/synthese', passport.authenticate(['admin', 'user'], { session: false, failWithError: true }), async (req, res) => {
  try {
    const { collectivity_id, period = 'month' } = req.body;

    //default month
    const now = new Date();
    let startDate = new Date(now.getFullYear(), now.getMonth(), 1);

    if (period === 'today') startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (period === 'week') startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    if (period === 'year') startDate = new Date(now.getFullYear(), 0, 1);

    let query = { collectivity_id, createdAt: { $gte: startDate }, owner: 'collectivity' };

    if (req.user.role === 'economic_actor') {
      query.economic_actor_id = req.user.economic_actor_id;
      query.owner = 'economic_actor';
    }

    const actions = await Action.find(query);
    const actionsCreated = actions.length;
    const actionsInProgress = actions.filter((action) => action.status === 'in_progress').length;
    const actionsCompleted = actions.filter((action) => action.status === 'completed').length;
    const actionsBlocked = actions.filter((action) => action.status === 'blocked').length;
    const actionsUpcoming = actions.filter((action) => action.status === 'upcoming').length;
    const actionsWithoutStatus = actions.filter((action) => action.status === 'no_status' || !action.status).length;
    return res.status(200).send({ ok: true, data: { actionsCreated, actionsInProgress, actionsCompleted, actionsBlocked, actionsUpcoming, actionsWithoutStatus } });
  } catch (error) {
    capture(error);
    return res.status(500).send({ ok: false, code: ERROR_CODES.SERVER_ERROR });
  }
});

router.post('/evolution-statuts', passport.authenticate(['admin', 'user'], { session: false, failWithError: true }), async (req, res) => {
  try {
    const { collectivity_id, period = 'month' } = req.body;

    const now = new Date();
    let startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    let intervals = 30;
    let labelFormat = 'day';

    if (period === 'today') {
      startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      intervals = 24;
      labelFormat = 'hour';
    }
    if (period === 'week') {
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      intervals = 7;
      labelFormat = 'day';
    }
    if (period === 'year') {
      startDate = new Date(now.getFullYear(), 0, 1);
      intervals = 12;
      labelFormat = 'month';
    }

    let query = { collectivity_id, createdAt: { $gte: startDate }, owner: 'collectivity' };

    if (req.user.role === 'economic_actor') {
      query.economic_actor_id = req.user.economic_actor_id;
      query.owner = 'economic_actor';
    }

    const actions = await Action.find(query).sort({ createdAt: 1 });

    const evolutionData = [];
    const months = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];
    const days = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];

    for (let i = 0; i < intervals; i++) {
      let periodStart, periodEnd, label;

      if (labelFormat === 'month') {
        periodStart = new Date(now.getFullYear(), i, 1);
        periodEnd = new Date(now.getFullYear(), i + 1, 0);
        label = `${months[i]}`;
      }
      if (labelFormat === 'day') {
        periodStart = new Date(now.getTime() - (intervals - 1 - i) * 24 * 60 * 60 * 1000);
        periodEnd = new Date(periodStart.getTime() + 24 * 60 * 60 * 1000);
        label = `${days[periodStart.getDay()]} ${periodStart.getDate()}`;
      }
      if (labelFormat === 'hour') {
        periodStart = new Date(now.getTime() - (intervals - 1 - i) * 60 * 60 * 1000);
        periodEnd = new Date(periodStart.getTime() + 60 * 60 * 1000);
        label = `${periodStart.getHours()}h`;
      }

      const actionsInPeriod = actions.filter((action) => {
        const actionDate = new Date(action.createdAt);
        return actionDate >= periodStart && actionDate < periodEnd;
      });

      const actionsCompleted = actionsInPeriod.filter((a) => a.status === 'completed').length;
      const actionsUpcoming = actionsInPeriod.filter((a) => a.status === 'upcoming').length;
      const actionsInProgress = actionsInPeriod.filter((a) => a.status === 'in_progress').length;
      const actionsBlocked = actionsInPeriod.filter((a) => a.status === 'blocked').length;

      evolutionData.push({ mois: label, actionsCompleted, actionsUpcoming, actionsInProgress, actionsBlocked });
    }

    return res.status(200).send({ ok: true, data: evolutionData });
  } catch (error) {
    capture(error);
    return res.status(500).send({ ok: false, code: ERROR_CODES.SERVER_ERROR });
  }
});

module.exports = router;
