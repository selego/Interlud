const express = require('express');
const ExcelJS = require('exceljs');
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

// ---------- Export Excel des réponses (admin plateforme) ----------

const TYPE_LABELS = { number: 'Nombre', text: 'Texte libre', radio: 'Choix unique', checkbox: 'Choix multiples' };
const yesNo = (value) => (value ? 'oui' : 'non');

// Un texte commençant par =, +, -, @ (ou tabulation / retour chariot) ne doit jamais être lu comme une formule par un tableur.
const neutralize = (value) => (typeof value === 'string' && /^[=+\-@\t\r]/.test(value) ? `'${value}` : value);
// Texte exporté : cellule vide plutôt qu'une chaîne vide
const cellText = (value) => (value ? neutralize(String(value)) : null);

// Valeur exportée : un nombre reste un nombre, les choix multiples sont séparés par « ; ». null si aucune réponse.
const exportValue = (value, type) => {
  const raw = value?.[type];
  if (type === 'number') return typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
  if (Array.isArray(raw)) return raw.length ? neutralize(raw.join('; ')) : null;
  return raw === null || raw === undefined || raw === '' ? null : neutralize(String(raw));
};

const addSheet = (workbook, name, columns, rows) => {
  const sheet = workbook.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
  sheet.columns = columns;
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };
  sheet.addRows(rows);
  return sheet;
};

// Trois onglets : « Réponses » (une ligne par organisation et par question), « Par organisation » (une colonne par question)
// et « Questions ». Les questions désactivées et les organisations sans réponse sont incluses.
router.post('/admin/export', passport.authenticate('admin', { session: false, failWithError: true }), async (req, res) => {
  try {
    const [answers, questionDocs, actorDocs] = await Promise.all([EconomicActorAnswer.find({}), EconomicActorQuestion.find({}), EconomicActor.find({})]);

    const questions = [...questionDocs].sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
    const questionById = new Map(questions.map((q) => [String(q._id), q]));

    // Organisations : toutes celles de la plateforme, plus celles qui n'existent plus mais ont laissé des réponses
    const actors = new Map(actorDocs.map((a) => [String(a._id), { name: a.name || '', territories: (a.collectivities || []).map((c) => c.name).filter(Boolean).join('; ') }]));
    for (const answer of answers) {
      if (!actors.has(answer.economic_actor_id)) actors.set(answer.economic_actor_id, { name: answer.economic_actor_name || '', territories: '' });
    }
    const actorIds = [...actors.keys()].sort((a, b) => actors.get(a).name.localeCompare(actors.get(b).name, 'fr'));

    const answerByKey = new Map();
    for (const answer of answers) {
      const question = questionById.get(answer.question_id);
      if (!question) continue;
      const value = exportValue(answer.value, question.type);
      if (value === null) continue;
      answerByKey.set(`${answer.economic_actor_id}_${answer.question_id}`, { answer, value });
    }

    const workbook = new ExcelJS.Workbook();

    const longRows = [];
    for (const actorId of actorIds) {
      const actor = actors.get(actorId);
      for (const question of questions) {
        const entry = answerByKey.get(`${actorId}_${String(question._id)}`);
        if (!entry) continue;
        longRows.push({
          organisation: cellText(actor.name),
          territories: cellText(actor.territories),
          question: cellText(question.label),
          type: TYPE_LABELS[question.type] || question.type,
          unit: cellText(question.value_unit),
          required: yesNo(question.required),
          active: yesNo(question.active),
          value: entry.value,
          date: entry.answer.updatedAt ? new Date(entry.answer.updatedAt) : null,
          author: cellText(entry.answer.last_modif_by_name),
        });
      }
    }
    const longSheet = addSheet(
      workbook,
      'Réponses',
      [
        { header: 'Organisation', key: 'organisation', width: 30 },
        { header: 'Territoires', key: 'territories', width: 30 },
        { header: 'Question', key: 'question', width: 45 },
        { header: 'Type de question', key: 'type', width: 18 },
        { header: 'Unité', key: 'unit', width: 14 },
        { header: 'Obligatoire', key: 'required', width: 12 },
        { header: 'Question active', key: 'active', width: 15 },
        { header: 'Réponse', key: 'value', width: 40 },
        { header: 'Date de la réponse', key: 'date', width: 20, style: { numFmt: 'dd/mm/yyyy hh:mm' } },
        { header: 'Auteur', key: 'author', width: 25 },
      ],
      longRows,
    );
    longSheet.autoFilter = { from: 'A1', to: 'J1' };

    const questionKey = (question) => `q_${question._id}`;
    const questionHeader = (question) => `${question.label}${question.value_unit ? ` (${question.value_unit})` : ''}${question.active ? '' : ' [désactivée]'}`;
    addSheet(
      workbook,
      'Par organisation',
      [
        { header: 'Organisation', key: 'organisation', width: 30 },
        { header: 'Territoires', key: 'territories', width: 30 },
        ...questions.map((question) => ({ header: neutralize(questionHeader(question)), key: questionKey(question), width: Math.min(Math.max(questionHeader(question).length, 14), 40) })),
      ],
      actorIds.map((actorId) => {
        const actor = actors.get(actorId);
        const row = { organisation: cellText(actor.name), territories: cellText(actor.territories) };
        for (const question of questions) row[questionKey(question)] = answerByKey.get(`${actorId}_${String(question._id)}`)?.value ?? null;
        return row;
      }),
    );

    addSheet(
      workbook,
      'Questions',
      [
        { header: 'Ordre', key: 'order', width: 8 },
        { header: 'Question', key: 'label', width: 45 },
        { header: 'Type de question', key: 'type', width: 18 },
        { header: 'Options', key: 'options', width: 40 },
        { header: 'Unité', key: 'unit', width: 14 },
        { header: 'Obligatoire', key: 'required', width: 12 },
        { header: 'Active', key: 'active', width: 10 },
      ],
      questions.map((question) => ({
        order: question.order ?? 0,
        label: cellText(question.label),
        type: TYPE_LABELS[question.type] || question.type,
        options: cellText((question.value_possibilities || []).join('; ')),
        unit: cellText(question.value_unit),
        required: yesNo(question.required),
        active: yesNo(question.active),
      })),
    );

    const buffer = await workbook.xlsx.writeBuffer();
    const fileName = `reponses_questionnaire_${new Date().toISOString().slice(0, 10)}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Length', buffer.length);
    return res.end(buffer);
  } catch (error) {
    capture(error);
    return res.status(500).send({ ok: false, code: ERROR_CODES.SERVER_ERROR });
  }
});

module.exports = router;
