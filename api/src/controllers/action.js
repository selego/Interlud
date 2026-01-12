const express = require('express');
const router = express.Router();
const passport = require('passport');
const Action = require('../models/action');
const IndicatorValue = require('../models/indicator_value');
const ERROR_CODES = require('../utils/errorCodes');
const { capture } = require('../services/sentry');
const Log = require('../models/log');
const Indicator = require('../models/indicator');

router.get('/:id', passport.authenticate(['admin', 'user'], { session: false, failWithError: true }), async (req, res) => {
  try {
    const action = await Action.findById(req.params.id);
    if (!action) return res.status(404).send({ ok: false, code: ERROR_CODES.NOT_FOUND });

    return res.status(200).send({ ok: true, data: action });
  } catch (error) {
    capture(error);
    return res.status(500).send({ ok: false, code: ERROR_CODES.SERVER_ERROR });
  }
});

router.put('/:id', passport.authenticate(['admin', 'user'], { session: false, failWithError: true }), async (req, res) => {
  try {
    const action = await Action.findById(req.params.id);
    if (!action) return res.status(404).send({ ok: false, code: ERROR_CODES.NOT_FOUND });

    action.last_modif_by_id = req.user._id;
    action.last_modif_by_name = req.user.name;
    action.last_modif_by_email = req.user.email;
    action.last_modif_date = new Date();
    await action.save();

    const logs = [];
    for (const field of Object.keys(req.body)) {
      if (['updatedAt', '__v', 'createdAt', '_id', 'last_modif_by_name', 'last_modif_date', 'last_modif_by_id'].includes(field)) continue;
      let newValue = req.body[field];
      const originalValue = action[field];

      if (originalValue instanceof Date && typeof newValue === 'string') newValue = new Date(newValue);

      if (JSON.stringify(newValue) === JSON.stringify(originalValue)) continue;

      let logType = typeof newValue;
      if (newValue instanceof Date) logType = 'date';
      if (Array.isArray(newValue)) logType = 'array';
      const log = new Log({
        model_name: 'action',
        name: action.name,
        field: field,
        operation: 'update',
        new_value: { [logType]: newValue },
        previous_value: { [logType]: originalValue },
        type_value: logType,
        date: new Date(),
        user_id: req.user._id,
        user_name: req.user.name,
        user_email: req.user.email,
        action_id: action._id,
        action_name: action.name,
        collectivity_id: action.collectivity_id,
        collectivity_name: action.collectivity_name,
      });

      logs.push(log);
    }

    action.set(req.body);
    await action.save();
    if (logs.length > 0) await Log.insertMany(logs);
    return res.status(200).send({ ok: true, data: action });
  } catch (error) {
    capture(error);
    return res.status(500).send({ ok: false, code: ERROR_CODES.SERVER_ERROR });
  }
});

router.post('/search', passport.authenticate(['admin', 'user'], { session: false, failWithError: true }), async (req, res) => {
  try {
    let query = { owner: 'collectivity' };

    if (req.body.collectivity_id) query.collectivity_id = req.body.collectivity_id;
    if (req.body.status) query.status = req.body.status;
    if (req.body.search) query.name = { $regex: req.body.search, $options: 'i' };
    if (req.body.createdAt) query.createdAt = { $gte: new Date(req.body.createdAt) };

    if (req.user.role === 'economic_actor') {
      query.economic_actor_id = req.user.economic_actor_id;
      query.owner = 'economic_actor';
    }

    if (req.body.type) {
      query.type = req.body.type;
      if (req.body.type === 'global') {
        delete query.owner;
        delete query.economic_actor_id;
      }
    }

    const limit = req.body.limit || 50;
    const skip = req.body.offset || 0;
    const total = await Action.countDocuments(query);
    const data = await Action.find(query).sort({ name: 1 }).skip(skip).limit(limit);
    return res.status(200).send({ ok: true, data, total });
  } catch (error) {
    capture(error);
    return res.status(500).send({ ok: false, code: ERROR_CODES.SERVER_ERROR });
  }
});

router.post('/', passport.authenticate(['admin', 'user'], { session: false, failWithError: true }), async (req, res) => {
  try {
    if (!req.body.name) return res.status(400).send({ ok: false, code: ERROR_CODES.INVALID_BODY });
    const action = await Action.create(req.body);
    if (!action) return res.status(400).send({ ok: false, code: ERROR_CODES.INVALID_BODY });

    await Log.create({
      model_name: 'action',
      name: action.name,
      operation: 'add',
      date: new Date(),
      user_id: req.user._id,
      user_name: req.user.name,
      user_email: req.user.email,
      action_id: action._id,
      action_name: action.name,
      collectivity_id: action.collectivity_id,
      collectivity_name: action.collectivity_name,
    });

    return res.status(200).send({ ok: true, data: action });
  } catch (error) {
    capture(error);
    return res.status(500).send({ ok: false, code: ERROR_CODES.SERVER_ERROR });
  }
});

router.post('/create_action_with_default_indicators', passport.authenticate(['admin', 'user'], { session: false, failWithError: true }), async (req, res) => {
  try {
    if (!req.body.name) return res.status(400).send({ ok: false, code: ERROR_CODES.INVALID_BODY });
    if (!req.body.action_parent_id) return res.status(400).send({ ok: false, code: ERROR_CODES.INVALID_BODY });

    const parentAction = await Action.findById(req.body.action_parent_id);
    if (!parentAction) return res.status(404).send({ ok: false, code: ERROR_CODES.NOT_FOUND });

    const action = await Action.create({
      ...req.body,
      excel_worksheetname: parentAction.excel_worksheetname,
      last_modif_by_id: req.user._id,
      last_modif_by_name: req.user.name,
      last_modif_by_email: req.user.email,
      last_modif_date: new Date(),
    });
    if (!action) return res.status(400).send({ ok: false, code: ERROR_CODES.INVALID_BODY });

    const indicators = await Indicator.find({ $or: [{ linked_action_id: parentAction._id }, { linked_action_id: { $in: [null, undefined, ''] } }] });

    const allSituations = ['init', 'ref', 'prev', 'expost'];
    const createdIndicatorValues = [];

    for (const indicator of indicators) {
      const situationsForIndicator = allSituations.filter((situation) => indicator.presence_in_excel?.[situation] === true);
      for (const situation of situationsForIndicator) {
        const defaultValue = indicator.value_default?.[situation]?.[indicator.value_type] ?? null;
        const indicatorValue = {
          action_id: action._id,
          action_name: action.name,
          collectivity_id: action.collectivity_id,
          collectivity_name: action.collectivity_name,
          indicator_id: indicator._id,
          indicator_name: indicator.name,
          indicator_type: indicator.value_type,
          situation,
          indicator_value_unit: indicator.value_unit,
          value_default: { [indicator.value_type]: defaultValue },
          indicator_value_possibilities: indicator.value_possibilities || [],
          indicator_category_id: indicator.indicator_category_id,
          indicator_category_name: indicator.indicator_category_name,
          indicator_sub_category_id: indicator.indicator_sub_category_id,
          indicator_sub_category_name: indicator.indicator_sub_category_name,
          indicator_excel_id: indicator.excel_indicator_id,
        };
        const displayCondition = indicator.display_condition?.[situation];
        if (displayCondition?.operator || displayCondition?.conditions?.length) indicatorValue.display_condition = displayCondition;
        createdIndicatorValues.push(indicatorValue);
      }
    }
    if (createdIndicatorValues.length > 0) await IndicatorValue.insertMany(createdIndicatorValues);

    await Log.create({
      model_name: 'action',
      name: action.name,
      operation: 'add',
      date: new Date(),
      user_id: req.user._id,
      user_name: req.user.name,
      user_email: req.user.email,
      action_id: action._id,
      action_name: action.name,
      collectivity_id: action.collectivity_id,
      collectivity_name: action.collectivity_name,
    });

    return res.status(200).send({ ok: true, data: action });
  } catch (error) {
    capture(error);
    return res.status(500).send({ ok: false, code: ERROR_CODES.SERVER_ERROR });
  }
});

router.post('/duplicate_for_economic_actor', passport.authenticate(['admin', 'user'], { session: false, failWithError: true }), async (req, res) => {
  try {
    const { collectivity, economic_actor } = req.body;
    if (!collectivity || !economic_actor) return res.status(400).send({ ok: false, code: ERROR_CODES.INVALID_BODY });

    const sourceActions = await Action.find({ collectivity_id: collectivity._id, owner: 'collectivity' });
    if (!sourceActions.length) return res.status(200).send({ ok: true, data: [] });

    const payloads = [];
    for (const action of sourceActions) {
      payloads.push({
        ...action.toObject(),
        owner: 'economic_actor',
        status: 'no_status',
        economic_actor_id: economic_actor._id,
        economic_actor_name: economic_actor.name,
        action_collectivity_id: action._id,
        last_modif_by_id: null,
        last_modif_by_name: null,
        last_modif_date: null,
        _id: undefined,
        __v: undefined,
        createdAt: undefined,
        updatedAt: undefined,
      });
    }

    if (!payloads.length) return res.status(200).send({ ok: true, data: [] });

    const duplicatedActions = await Action.insertMany(payloads);
    const logs = duplicatedActions.map((duplicatedAction) => ({
      model_name: 'action',
      name: duplicatedAction.name,
      operation: 'duplicate',
      date: new Date(),
      user_id: req.user._id,
      user_name: req.user.name,
      user_email: req.user.email,
      action_id: duplicatedAction._id,
      action_name: duplicatedAction.name,
      collectivity_id: duplicatedAction.collectivity_id,
      collectivity_name: duplicatedAction.collectivity_name,
      economic_actor_id: economic_actor._id,
      economic_actor_name: economic_actor.name,
    }));

    if (logs.length) await Log.insertMany(logs);

    return res.status(200).send({
      ok: true,
      data: duplicatedActions,
    });
  } catch (error) {
    capture(error);
    return res.status(500).send({ ok: false, code: ERROR_CODES.SERVER_ERROR });
  }
});

router.delete('/:id', passport.authenticate(['admin', 'user'], { session: false, failWithError: true }), async (req, res) => {
  try {
    const action = await Action.findOne({ _id: req.params.id });
    if (!action) return res.status(404).send({ ok: false, code: ERROR_CODES.NOT_FOUND });

    await Log.create({
      model_name: 'action',
      name: action.name,
      operation: 'delete',
      date: new Date(),
      user_id: req.user._id,
      user_name: req.user.name,
      user_email: req.user.email,
      action_id: action._id,
      action_name: action.name,
      collectivity_id: action.collectivity_id,
      collectivity_name: action.collectivity_name,
    });

    await Action.deleteOne({ _id: req.params.id });

    return res.status(200).send({ ok: true });
  } catch (error) {
    capture(error);
    return res.status(500).send({ ok: false, code: ERROR_CODES.SERVER_ERROR });
  }
});

router.post('/initialize_indicator_values', passport.authenticate(['admin', 'user'], { session: false, failWithError: true }), async (req, res) => {
  try {
    if (!req.body.action_id) return res.status(400).send({ ok: false, code: ERROR_CODES.INVALID_BODY });
    if (!req.body.indicator_id) return res.status(400).send({ ok: false, code: ERROR_CODES.INVALID_BODY });

    const existing = await IndicatorValue.findOne({ action_id: req.body.action_id, indicator_id: req.body.indicator_id });
    if (existing) return res.status(400).send({ ok: false, code: ERROR_CODES.INDICATOR_ALREADY_EXISTS });

    const indicator = await Indicator.findById(req.body.indicator_id);
    if (!indicator) return res.status(404).send({ ok: false, code: ERROR_CODES.NOT_FOUND });

    const situations = ['init', 'ref', 'prev', 'expost'];
    const createdIndicatorValues = [];

    for (const situation of situations) {
      const defaultValue = indicator.value_default?.[situation]?.[indicator.value_type] ?? null;
      const indicatorValue = {
        ...req.body,
        situation,
        value_default: { [indicator.value_type]: defaultValue },
        indicator_value_possibilities: indicator.value_possibilities || [],
        indicator_category_id: indicator.indicator_category_id,
        indicator_category_name: indicator.indicator_category_name,
        indicator_sub_category_id: indicator.indicator_sub_category_id,
        indicator_sub_category_name: indicator.indicator_sub_category_name,
        indicator_value_unit: indicator.value_unit,
        indicator_excel_id: indicator.excel_indicator_id,
      };
      const displayCondition = indicator.display_condition?.[situation];
      if (displayCondition?.operator || displayCondition?.conditions?.length) indicatorValue.display_condition = displayCondition;
      createdIndicatorValues.push(indicatorValue);
    }
    await IndicatorValue.insertMany(createdIndicatorValues);
    return res.status(200).send({ ok: true });
  } catch (error) {
    capture(error);
    return res.status(500).send({ ok: false, code: ERROR_CODES.SERVER_ERROR });
  }
});

module.exports = router;
