const express = require('express');
const router = express.Router();
const passport = require('passport');
const Action = require('../models/action');
const Collectivity = require('../models/collectivity');
const ERROR_CODES = require('../utils/errorCodes');
const { capture } = require('../services/sentry');

router.post('/synthese', passport.authenticate(['admin', 'user'], { session: false, failWithError: true }), async (req, res) => {
  try {
    const { collectivity_id } = req.body;

    let query = { collectivity_id, owner: 'collectivity', type: { $ne: 'config' } };

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

// Vue admin "Suivi des collectivités" : toutes les collectivités avec leurs actions (hors config), en une seule requête
router.get('/collectivities', passport.authenticate('admin', { session: false, failWithError: true }), async (req, res) => {
  try {
    const collectivities = await Collectivity.find({}).sort({ name: 1 });
    const actions = await Action.find({ type: { $ne: 'config' } }).sort({ name: 1 });

    const actionsByCollectivity = {};
    for (const action of actions) {
      const key = action.collectivity_id;
      if (!key) continue;
      if (!actionsByCollectivity[key]) actionsByCollectivity[key] = [];
      actionsByCollectivity[key].push({
        _id: action._id,
        name: action.name,
        action_parent_name: action.action_parent_name,
        excel_worksheetname: action.excel_worksheetname,
        owner: action.owner,
        economic_actor_name: action.economic_actor_name,
        status: action.status,
        completion_init: action.completion_init || 0,
        completion_ref: action.completion_ref || 0,
        completion_prev: action.completion_prev || 0,
        completion_expost: action.completion_expost || 0,
        last_modif_date: action.last_modif_date,
      });
    }

    const data = collectivities.map((c) => ({
      _id: c._id,
      name: c.name,
      department: c.department,
      population: c.population,
      actions: actionsByCollectivity[c._id.toString()] || [],
    }));

    return res.status(200).send({ ok: true, data });
  } catch (error) {
    capture(error);
    return res.status(500).send({ ok: false, code: ERROR_CODES.SERVER_ERROR });
  }
});

module.exports = router;
