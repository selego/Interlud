const express = require('express');
const router = express.Router();
const passport = require('passport');
const EconomicActor = require('../models/economic_actor');
const Action = require('../models/action');
const IndicatorValue = require('../models/indicator_value');
const ERROR_CODES = require('../utils/errorCodes');
const { capture } = require('../services/sentry');
const { duplicateExcelFile } = require('../services/microsoftGraph');
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
    if (req.body.collectivity_id) query.collectivity_id = req.body.collectivity_id;
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

    const newCollectivity = { id: req.body.collectivity_id, name: req.body.collectivity_name, joined_at: new Date() };
    actor.collectivities = [...(actor.collectivities || []), newCollectivity];
    await actor.save();

    // Récupérer TOUTES les actions de la collectivité (y compris les actions config)
    const sourceActions = await Action.find({ collectivity_id: req.body.collectivity_id, owner: 'collectivity' });
    if (!sourceActions.length) return res.status(200).send({ ok: true, data: actor });

    // Créer les actions pour l'acteur économique avec leurs propres fichiers Excel
    const createdActions = [];
    for (const action of sourceActions) {
      const { _id, __v, createdAt, updatedAt, ...actionData } = action.toObject();

      const excelFiles = [];
      if (action.type !== 'config') {
        for (const excelFile of action.excel_files || []) {
          try {
            const newExcelFileId = await duplicateExcelFile(`${actor.name}_${action.name}_Prev${excelFile.year_prev}.xlsx`,collectivity.sharepoint_folder_id,excelFile.excel_file_id);
            excelFiles.push({ year_prev: excelFile.year_prev, year_ref: excelFile.year_ref || excelFile.year_prev, excel_file_id: newExcelFileId });
          } catch (excelError) {
            capture(excelError);
          }
        }
      }

      const newAction = await Action.create({
        ...actionData,
        owner: 'economic_actor',
        status: 'no_status',
        economic_actor_id: actor._id,
        economic_actor_name: actor.name,
        action_collectivity_id: _id,
        excel_files: excelFiles,
      });
      createdActions.push(newAction);
    }

    // Récupérer les indicator values de la collectivité (y compris ceux des actions config)
    const sourceActionIds = sourceActions.map((a) => a._id.toString());
    const sourceIndicatorValues = await IndicatorValue.find({ action_id: { $in: sourceActionIds }, owner: 'collectivity' });
    if (!sourceIndicatorValues.length) return res.status(200).send({ ok: true, data: actor });

    // Créer un mapping des actions source par ID pour vérifier le type
    const sourceActionMap = new Map(sourceActions.map((a) => [a._id.toString(), a]));

    const indicatorValuePayloads = [];
    for (const createdAction of createdActions) {
      const sourceAction = sourceActionMap.get(createdAction.action_collectivity_id.toString());
      const isConfigAction = sourceAction?.type === 'config';

      for (const sourceIV of sourceIndicatorValues) {
        if (sourceIV.action_id.toString() !== createdAction.action_collectivity_id.toString()) continue;

        const { _id, __v, createdAt, updatedAt, ...ivData } = sourceIV.toObject();

        // Pour les actions config (Données de base, Parc types), conserver les valeurs par défaut/existantes
        let valueToSet;
        if (isConfigAction) valueToSet = sourceIV.value;
        else valueToSet = { text: null, number: null, radio: null, checkbox: [] };

        indicatorValuePayloads.push({
          ...ivData,
          owner: 'economic_actor',
          economic_actor_id: actor._id,
          economic_actor_name: actor.name,
          action_id: createdAction._id,
          action_name: createdAction.name,
          indicator_value_collectivity_id: _id,
          value: valueToSet,
        });
      }
    }
    await IndicatorValue.insertMany(indicatorValuePayloads);

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
    return res.status(200).send({ ok: true });
  } catch (error) {
    capture(error);
    return res.status(500).send({ ok: false, code: ERROR_CODES.SERVER_ERROR });
  }
});

module.exports = router;
