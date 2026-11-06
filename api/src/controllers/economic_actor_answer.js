const express = require('express');
const router = express.Router();
const passport = require('passport');
const EconomicActorAnswer = require('../models/economic_actor_answer');
const EconomicActorQuestion = require('../models/economic_actor_question');
const ERROR_CODES = require('../utils/errorCodes');
const { capture } = require('../services/sentry');

// Réponses au questionnaire acteurs économiques. L'acteur est toujours celui du token, jamais celui du corps de la requête.
// Aucune synchronisation Microsoft Graph ni écriture Excel ici.

const isValidValue = (question, value) => {
  if (question.type === 'number') return value === null || (typeof value === 'number' && Number.isFinite(value));
  if (question.type === 'text') return typeof value === 'string';
  if (question.type === 'radio') return value === null || value === '' || question.value_possibilities.includes(value);
  if (question.type === 'checkbox') return Array.isArray(value) && value.every((v) => question.value_possibilities.includes(v));
  return false;
};

router.get('/mine', passport.authenticate('user', { session: false, failWithError: true }), async (req, res) => {
  try {
    if (req.user.role !== 'economic_actor' || !req.user.economic_actor_id) return res.status(403).send({ ok: false, code: ERROR_CODES.FORBIDDEN });
    const data = await EconomicActorAnswer.find({ economic_actor_id: req.user.economic_actor_id });
    return res.status(200).send({ ok: true, data });
  } catch (error) {
    capture(error);
    return res.status(500).send({ ok: false, code: ERROR_CODES.SERVER_ERROR });
  }
});

router.put('/mine/:question_id', passport.authenticate('user', { session: false, failWithError: true }), async (req, res) => {
  try {
    if (req.user.role !== 'economic_actor' || !req.user.economic_actor_id) return res.status(403).send({ ok: false, code: ERROR_CODES.FORBIDDEN });

    const question = await EconomicActorQuestion.findById(req.params.question_id);
    if (!question || !question.active) return res.status(404).send({ ok: false, code: ERROR_CODES.NOT_FOUND });
    if (!req.body.value || !isValidValue(question, req.body.value[question.type])) return res.status(400).send({ ok: false, code: ERROR_CODES.INVALID_BODY });

    const answer = await EconomicActorAnswer.findOneAndUpdate(
      { economic_actor_id: req.user.economic_actor_id, question_id: String(question._id) },
      {
        economic_actor_name: req.user.economic_actor_name,
        question_label: question.label,
        value: { [question.type]: req.body.value[question.type] },
        last_modif_by_id: req.user._id,
        last_modif_by_name: req.user.name,
      },
      { new: true, upsert: true },
    );
    return res.status(200).send({ ok: true, data: answer });
  } catch (error) {
    capture(error);
    return res.status(500).send({ ok: false, code: ERROR_CODES.SERVER_ERROR });
  }
});

module.exports = router;
