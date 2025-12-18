const express = require('express');
const router = express.Router();
const passport = require('passport');
const EconomicActor = require('../models/economic_actor');
const Action = require('../models/action');
const IndicatorValue = require('../models/indicator_value');
const ERROR_CODES = require('../utils/errorCodes');
const { capture } = require('../services/sentry');
const { duplicateExcelFile } = require('../services/microsoftGraph');

router.post('/', passport.authenticate(['admin', 'user'], { session: false, failWithError: true }), async (req, res) => {
  try {
    const { name, collectivity } = req.body;
    if (!name || !collectivity) return res.status(400).send({ ok: false, code: ERROR_CODES.INVALID_BODY });

    const actor = await EconomicActor.create({ name, collectivity_id: collectivity.id, collectivity_name: collectivity.name });
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

    const newCollectivity = { id: req.body.collectivity_id, name: req.body.collectivity_name, joined_at: new Date() };
    try {
      newCollectivity.excelFileId = await duplicateExcelFile(`${actor.name} - ${newCollectivity.name}.xlsx`);
    } catch (excelError) {
      capture(excelError);
    }
    actor.collectivities = [...(actor.collectivities || []), newCollectivity];
    await actor.save();

    const sourceActions = await Action.find({ collectivity_id: req.body.collectivity_id, owner: 'collectivity' });
    if (!sourceActions.length) return res.status(200).send({ ok: true, data: actor });

    const actionPayloads = sourceActions.map((action) => {
      const { _id, __v, createdAt, updatedAt, ...actionData } = action.toObject();
      return {
        ...actionData,
        owner: 'economic_actor',
        status: 'no_status',
        economic_actor_id: actor._id,
        economic_actor_name: actor.name,
        action_collectivity_id: _id,
      };
    });
    const createdActions = await Action.insertMany(actionPayloads);

    const sourceIndicatorValues = await IndicatorValue.find({ collectivity_id: req.body.collectivity_id, owner: 'collectivity' });
    if (!sourceIndicatorValues.length) return res.status(200).send({ ok: true, data: actor });
    const indicatorValuePayloads = [];
    for (const createdAction of createdActions) {
      for (const sourceIV of sourceIndicatorValues) {
        if (sourceIV.action_id.toString() !== createdAction.action_collectivity_id.toString()) continue;

        const { _id, __v, createdAt, updatedAt, ...ivData } = sourceIV.toObject();
        indicatorValuePayloads.push({
          ...ivData,
          owner: 'economic_actor',
          economic_actor_id: actor._id,
          economic_actor_name: actor.name,
          action_id: createdAction._id,
          action_name: createdAction.name,
          indicator_value_collectivity_id: _id,
          value: { text: null, number: null, radio: null, checkbox: [] },
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
