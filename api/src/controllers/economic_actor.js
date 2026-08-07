const express = require('express');
const router = express.Router();
const passport = require('passport');
const EconomicActor = require('../models/economic_actor');
const Action = require('../models/action');
const IndicatorValue = require('../models/indicator_value');
const ERROR_CODES = require('../utils/errorCodes');
const { capture } = require('../services/sentry');
const { duplicateExcelFile, aggregationTemplateFileId } = require('../services/microsoftGraph');
const Collectivity = require('../models/collectivity');


router.post('/', passport.authenticate(['admin', 'user'], { session: false, failWithError: true }), async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).send({ ok: false, code: ERROR_CODES.INVALID_BODY });

    const actor = await EconomicActor.create({ name });
    return res.status(200).send({ ok: true, data: actor });
  } catch (error) {
    capture(error);
    return res.status(500).send({ ok: false, code: ERROR_CODES.SERVER_ERROR });
  }
});

router.post('/search', passport.authenticate(['admin', 'user'], { session: false, failWithError: true }), async (req, res) => {
  try {
    const query = {};
    if (req.body.collectivity_id) query['collectivities.id'] = req.body.collectivity_id;
    if (req.body.status) query.status = req.body.status;
    if (req.body.search) {
      query.$or = [{ name: { $regex: req.body.search, $options: 'i' } }, { description: { $regex: req.body.search, $options: 'i' } }];
    }

    const limit = req.body.limit || 50;
    const skip = req.body.offset || 0;
    const total = await EconomicActor.countDocuments(query);
    const data = await EconomicActor.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit);
    return res.status(200).send({ ok: true, data, total });
  } catch (error) {
    capture(error);
    return res.status(500).send({ ok: false, code: ERROR_CODES.SERVER_ERROR });
  }
});

router.get('/:id', passport.authenticate(['admin', 'user'], { session: false, failWithError: true }), async (req, res) => {
  try {
    const actor = await EconomicActor.findById(req.params.id);
    if (!actor) return res.status(404).send({ ok: false, code: ERROR_CODES.NOT_FOUND });
    return res.status(200).send({ ok: true, data: actor });
  } catch (error) {
    capture(error);
    return res.status(500).send({ ok: false, code: ERROR_CODES.SERVER_ERROR });
  }
});

router.put('/:id', passport.authenticate(['admin', 'user'], { session: false, failWithError: true }), async (req, res) => {
  try {
    const actor = await EconomicActor.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!actor) return res.status(404).send({ ok: false, code: ERROR_CODES.NOT_FOUND });
    return res.status(200).send({ ok: true, data: actor });
  } catch (error) {
    capture(error);
    return res.status(500).send({ ok: false, code: ERROR_CODES.SERVER_ERROR });
  }
});

router.put('/:id/add_collectivity', passport.authenticate(['admin', 'user'], { session: false, failWithError: true }), async (req, res) => {
  try {
    const actor = await EconomicActor.findById(req.params.id);
    if (!actor) return res.status(404).send({ ok: false, code: ERROR_CODES.NOT_FOUND });

    const collectivity = await Collectivity.findById(req.body.collectivity_id);
    if (!collectivity) return res.status(404).send({ ok: false, code: ERROR_CODES.NOT_FOUND });

    const aggregation_excel_file_id = await duplicateExcelFile(`${actor.name} - ${collectivity.name} - Aggregation.xlsx`, collectivity.sharepoint_folder_id, aggregationTemplateFileId);

    const newCollectivity = { id: req.body.collectivity_id, name: req.body.collectivity_name, joined_at: new Date(), aggregation_excel_file_id };
    actor.collectivities = [...(actor.collectivities || []), newCollectivity];
    await actor.save();

    return res.status(200).send({ ok: true, data: actor });
  } catch (error) {
    capture(error);
    return res.status(500).send({ ok: false, code: ERROR_CODES.SERVER_ERROR });
  }
});

router.delete('/:id', passport.authenticate(['admin', 'user'], { session: false, failWithError: true }), async (req, res) => {
  try {
    const actor = await EconomicActor.findByIdAndDelete(req.params.id);
    if (!actor) return res.status(404).send({ ok: false, code: ERROR_CODES.NOT_FOUND });

    // Supprimer les actions et indicator values de l'acteur
    await IndicatorValue.deleteMany({ economic_actor_id: req.params.id });
    await Action.deleteMany({ economic_actor_id: req.params.id });

    return res.status(200).send({ ok: true });
  } catch (error) {
    capture(error);
    return res.status(500).send({ ok: false, code: ERROR_CODES.SERVER_ERROR });
  }
});

module.exports = router;
