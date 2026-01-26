const express = require('express');
const router = express.Router();
const passport = require('passport');
const Action = require('../models/action');
const ERROR_CODES = require('../utils/errorCodes');
const { capture } = require('../services/sentry');

router.post('/synthese', passport.authenticate(['admin', 'user'], { session: false, failWithError: true }), async (req, res) => {
  try {
    const { collectivity_id } = req.body;

    let query = { collectivity_id, owner: 'collectivity' };

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

module.exports = router;
