const express = require('express');
const router = express.Router();
const passport = require('passport');
const EconomicActorAnswer = require('../models/economic_actor_answer');
const EconomicActorQuestion = require('../models/economic_actor_question');
const EconomicActor = require('../models/economic_actor');
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

// Valeur lisible d'une réponse, au format de l'onglet « Réponses acteurs éco » de script/export_calculated_values.js.
const formatValue = (value, type) => {
  const raw = value?.[type];
  if (Array.isArray(raw)) return raw.join(', ');
  return raw === null || raw === undefined ? '' : String(raw);
};

// Lecture de toutes les réponses par l'admin plateforme : nom de l'acteur, libellé de la question et valeur lisible.
// Seuls des champs de la réponse, de la question et du nom de l'acteur sont renvoyés (aucune donnée de compte utilisateur).
// Filtre optionnel : question_id.
router.post('/admin/search', passport.authenticate('admin', { session: false, failWithError: true }), async (req, res) => {
  try {
    const questionId = req.body?.question_id;
    const answers = await EconomicActorAnswer.find(questionId ? { question_id: String(questionId) } : {});
    const questions = await EconomicActorQuestion.find({});
    const actors = await EconomicActor.find({ _id: { $in: [...new Set(answers.map((a) => a.economic_actor_id))] } });

    const questionById = new Map(questions.map((q) => [String(q._id), q]));
    const actorNameById = new Map(actors.map((a) => [String(a._id), a.name]));

    const data = answers
      .map((answer) => {
        const question = questionById.get(answer.question_id);
        const type = question?.type || '';
        return {
          _id: answer._id,
          economic_actor_id: answer.economic_actor_id,
          economic_actor_name: actorNameById.get(answer.economic_actor_id) || answer.economic_actor_name || '',
          question_id: answer.question_id,
          question_label: question?.label || answer.question_label || '',
          question_type: type,
          question_active: question ? !!question.active : false,
          question_order: question?.order ?? Number.MAX_SAFE_INTEGER,
          value_unit: question?.value_unit || '',
          value: formatValue(answer.value, type),
          updatedAt: answer.updatedAt,
        };
      })
      .sort((a, b) => a.economic_actor_name.localeCompare(b.economic_actor_name, 'fr') || a.question_order - b.question_order || a.question_label.localeCompare(b.question_label, 'fr'));
    return res.status(200).send({ ok: true, data });
  } catch (error) {
    capture(error);
    return res.status(500).send({ ok: false, code: ERROR_CODES.SERVER_ERROR });
  }
});

module.exports = router;
