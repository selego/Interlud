const express = require('express');
const router = express.Router();
const passport = require('passport');
const EconomicActorQuestion = require('../models/economic_actor_question');
const ERROR_CODES = require('../utils/errorCodes');
const { capture } = require('../services/sentry');

// Questionnaire acteurs économiques : aucune synchronisation Microsoft Graph ni écriture Excel ici.

router.post('/search', passport.authenticate(['admin', 'user'], { session: false, failWithError: true }), async (req, res) => {
  try {
    const query = {};
    if (req.body.active === true || req.body.active === false) query.active = req.body.active;
    if (req.body.search) query.label = { $regex: String(req.body.search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
    // Les utilisateurs non admin ne voient que les questions actives
    if (req.user.role !== 'admin') query.active = true;

    const limit = req.body.limit || 100;
    const skip = req.body.page ? req.body.page * limit : req.body.offset || 0;
    const total = await EconomicActorQuestion.countDocuments(query);
    const data = await EconomicActorQuestion.find(query).sort({ order: 1, createdAt: 1 }).skip(skip).limit(limit);
    return res.status(200).send({ ok: true, data, total });
  } catch (error) {
    capture(error);
    return res.status(500).send({ ok: false, code: ERROR_CODES.SERVER_ERROR });
  }
});

router.get('/:id', passport.authenticate('admin', { session: false, failWithError: true }), async (req, res) => {
  try {
    const question = await EconomicActorQuestion.findById(req.params.id);
    if (!question) return res.status(404).send({ ok: false, code: ERROR_CODES.NOT_FOUND });
    return res.status(200).send({ ok: true, data: question });
  } catch (error) {
    capture(error);
    return res.status(500).send({ ok: false, code: ERROR_CODES.SERVER_ERROR });
  }
});

router.post('/', passport.authenticate('admin', { session: false, failWithError: true }), async (req, res) => {
  try {
    if (!req.body.label) return res.status(400).send({ ok: false, code: ERROR_CODES.INVALID_BODY });
    const question = await EconomicActorQuestion.create(req.body);
    return res.status(200).send({ ok: true, data: question });
  } catch (error) {
    capture(error);
    return res.status(500).send({ ok: false, code: ERROR_CODES.SERVER_ERROR });
  }
});

router.put('/:id', passport.authenticate('admin', { session: false, failWithError: true }), async (req, res) => {
  try {
    const question = await EconomicActorQuestion.findById(req.params.id);
    if (!question) return res.status(404).send({ ok: false, code: ERROR_CODES.NOT_FOUND });
    if (req.body.label !== undefined && !req.body.label) return res.status(400).send({ ok: false, code: ERROR_CODES.INVALID_BODY });
    question.set(req.body);
    await question.save();
    return res.status(200).send({ ok: true, data: question });
  } catch (error) {
    capture(error);
    return res.status(500).send({ ok: false, code: ERROR_CODES.SERVER_ERROR });
  }
});

module.exports = router;
