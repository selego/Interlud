const express = require('express');
const router = express.Router();
const passport = require('passport');
const UserActionRight = require('../models/user_action_right');
const Action = require('../models/action');
const ERROR_CODES = require('../utils/errorCodes');
const { capture } = require('../services/sentry');

// Seuls un admin plateforme ou un administrateur approuvé de la collectivité peuvent gérer ses droits
const canManageCollectivity = (user, collectivityId) =>
  user.role === 'admin' || (!!collectivityId && (user.collectivities || []).some((c) => c.id === collectivityId && c.role === 'admin' && c.status === 'approved'));

router.put('/:id', passport.authenticate(['admin', 'user'], { session: false, failWithError: true }), async (req, res) => {
  try {
    const right = await UserActionRight.findById(req.params.id);
    if (!right) return res.status(404).send({ ok: false, code: ERROR_CODES.NOT_FOUND });
    if (!canManageCollectivity(req.user, right.collectivity_id)) return res.status(403).send({ ok: false, code: ERROR_CODES.FORBIDDEN });
    // Un admin de collectivité ne peut pas rattacher le droit à une autre collectivité ou à un autre utilisateur
    if (req.user.role !== 'admin' && ['collectivity_id', 'user_id'].some((field) => req.body[field] !== undefined && req.body[field] !== right[field])) {
      return res.status(403).send({ ok: false, code: ERROR_CODES.FORBIDDEN });
    }

    // Un admin de collectivité ne modifie que la description et les droits de lecture et d'écriture (pas d'opérateur comme $set)
    const update = req.user.role === 'admin' ? req.body : {};
    if (req.user.role !== 'admin') ['description', 'can_read', 'can_write'].filter((field) => req.body[field] !== undefined).forEach((field) => (update[field] = req.body[field]));

    const userActionRight = await UserActionRight.findByIdAndUpdate(req.params.id, update, { new: true });
    return res.status(200).send({ ok: true, data: userActionRight });
  } catch (error) {
    capture(error);
    return res.status(500).send({ ok: false, code: ERROR_CODES.SERVER_ERROR });
  }
});

router.post('/search', passport.authenticate(['admin', 'user'], { session: false, failWithError: true }), async (req, res) => {
  try {
    let query = {};

    const limit = req.body.limit || 50;
    const skip = req.body.offset || 0;
    if (req.body.user_id) query.user_id = req.body.user_id;
    const total = await UserActionRight.countDocuments(query);
    const data = await UserActionRight.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit);
    return res.status(200).send({ ok: true, data, total });
  } catch (error) {
    capture(error);
    return res.status(500).send({ ok: false, code: ERROR_CODES.SERVER_ERROR });
  }
});

router.post('/', passport.authenticate(['admin', 'user'], { session: false, failWithError: true }), async (req, res) => {
  try {
    if (req.user.role !== 'admin' && !req.body.collectivity_id) return res.status(400).send({ ok: false, code: ERROR_CODES.INVALID_BODY });
    if (!canManageCollectivity(req.user, req.body.collectivity_id)) return res.status(403).send({ ok: false, code: ERROR_CODES.FORBIDDEN });
    // L'action doit appartenir à la collectivité de l'admin
    if (req.user.role !== 'admin') {
      const action = req.body.action_id ? await Action.findById(req.body.action_id) : null;
      if (!action || action.collectivity_id !== req.body.collectivity_id) return res.status(403).send({ ok: false, code: ERROR_CODES.FORBIDDEN });
    }

    const userActionRight = await UserActionRight.create(req.body);

    return res.status(200).send({ ok: true, data: userActionRight });
  } catch (error) {
    capture(error);
    return res.status(500).send({ ok: false, code: ERROR_CODES.SERVER_ERROR });
  }
});

router.delete('/:id', passport.authenticate(['admin', 'user'], { session: false, failWithError: true }), async (req, res) => {
  try {
    const right = await UserActionRight.findById(req.params.id);
    if (!right) return res.status(404).send({ ok: false, code: ERROR_CODES.NOT_FOUND });
    if (!canManageCollectivity(req.user, right.collectivity_id)) return res.status(403).send({ ok: false, code: ERROR_CODES.FORBIDDEN });

    await UserActionRight.findByIdAndDelete(req.params.id);

    return res.status(200).send({ ok: true });
  } catch (error) {
    capture(error);
    return res.status(500).send({ ok: false, code: ERROR_CODES.SERVER_ERROR });
  }
});

module.exports = router;
