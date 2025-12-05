const express = require('express');
const router = express.Router();
const passport = require('passport');
const ExcelJS = require('exceljs');
const IndicatorValue = require('../models/indicator_value');
const ERROR_CODES = require('../utils/errorCodes');
const { capture } = require('../services/sentry');
const Log = require('../models/log');
const Action = require('../models/action');
const Indicator = require('../models/indicator');
const { updateExcelCellByIndicatorId } = require('../services/microsoftGraph');
const Collectivity = require('../models/collectivity');
const EconomicActor = require('../models/economic_actor');

router.get('/:id', passport.authenticate(['admin', 'user'], { session: false, failWithError: true }), async (req, res) => {
  try {
    const indicatorValue = await IndicatorValue.findById(req.params.id);
    if (!indicatorValue) return res.status(404).send({ ok: false, code: ERROR_CODES.NOT_FOUND });

    return res.status(200).send({ ok: true, data: indicatorValue });
  } catch (error) {
    capture(error);
    return res.status(500).send({ ok: false, code: ERROR_CODES.SERVER_ERROR });
  }
});

router.put('/:id', passport.authenticate(['admin', 'user'], { session: false, failWithError: true }), async (req, res) => {
  try {
    const indicatorValue = await IndicatorValue.findById(req.params.id);
    if (!indicatorValue) return res.status(404).send({ ok: false, code: ERROR_CODES.NOT_FOUND });

    const action = await Action.findById(indicatorValue.action_id);
    if (!action) return res.status(404).send({ ok: false, code: ERROR_CODES.NOT_FOUND });

    const collectivity = await Collectivity.findById(action.collectivity_id);
    if (!collectivity) return res.status(404).send({ ok: false, code: ERROR_CODES.NOT_FOUND });

    action.last_modif_by_id = req.user._id;
    action.last_modif_by_name = req.user.name;
    action.last_modif_date = new Date();
    await action.save();
    const indicator = await Indicator.findById(indicatorValue.indicator_id);
    if (!indicator) return res.status(404).send({ ok: false, code: ERROR_CODES.NOT_FOUND });

    const logs = [];

    for (const field of Object.keys(req.body)) {
      if (['updatedAt', '__v', 'createdAt', '_id'].includes(field)) continue;
      let newValue = req.body[field];
      const originalValue = indicatorValue[field];

      if (originalValue instanceof Date && typeof newValue === 'string') newValue = new Date(newValue);
      if (JSON.stringify(newValue) === JSON.stringify(originalValue)) continue;

      let actualNewValue = newValue;
      let actualOldValue = originalValue;
      if (field === 'value' && indicatorValue.indicator_type) {
        actualNewValue = newValue?.[indicatorValue.indicator_type];
        actualOldValue = originalValue?.[indicatorValue.indicator_type];
      }

      let logType = typeof actualNewValue;
      if (actualNewValue instanceof Date) logType = 'date';
      if (Array.isArray(actualNewValue)) logType = 'array';

      const log = {
        model_name: 'indicator_value',
        name: indicator.name,
        field: field,
        operation: 'update',
        new_value: { [logType]: actualNewValue },
        previous_value: { [logType]: actualOldValue },
        type_value: logType,
        date: new Date(),
        user_id: req.user._id,
        user_name: req.user.name,
        user_email: req.user.email,
        collectivity_id: indicatorValue.collectivity_id,
        collectivity_name: indicatorValue.collectivity_name,
        action_id: indicatorValue.action_id,
        action_name: indicatorValue.action_name,
        indicator_id: indicatorValue.indicator_id,
        indicator_name: indicatorValue.indicator_name,
        indicator_value_id: indicatorValue._id,
        indicator_value_name: indicatorValue.name,
      };
      logs.push(log);
    }

    indicatorValue.set(req.body);
    await indicatorValue.save();

    res.status(200).send({ ok: true, data: indicatorValue });
    await updateExcelCellByIndicatorId(collectivity.excelFileId, indicator.excel_indicator_id, req.body.value[indicatorValue.indicator_type], indicatorValue.situation);

    if (logs.length > 0) await Log.insertMany(logs);

    if (!(indicatorValue.indicator_id && indicatorValue.situation && indicatorValue.year && indicatorValue.collectivity_id)) return;
    const payload = {
      indicator_id: indicatorValue.indicator_id,
      situation: indicatorValue.situation,
      year: indicatorValue.year,
      collectivity_id: indicatorValue.collectivity_id,
      source_type: indicatorValue.source_type,
      _id: { $ne: indicatorValue._id },
    };

    if (indicatorValue.economic_actor_id) payload.economic_actor_id = indicatorValue.economic_actor_id;
    const otherIndicatorValues = await IndicatorValue.find(payload);

    const syncLogs = [];
    for (const otherIndicatorValue of otherIndicatorValues) {
      if (JSON.stringify(otherIndicatorValue.value) !== JSON.stringify(indicatorValue.value)) {
        const actualNewValue = indicatorValue.value?.[indicatorValue.indicator_type];
        const actualOldValue = otherIndicatorValue.value?.[indicatorValue.indicator_type];

        let logType = typeof actualNewValue;
        if (actualNewValue instanceof Date) logType = 'date';
        if (Array.isArray(actualNewValue)) logType = 'array';

        const syncLog = {
          model_name: 'indicator_value',
          name: otherIndicatorValue.name,
          field: 'value',
          operation: 'update',
          new_value: { [logType]: actualNewValue },
          previous_value: { [logType]: actualOldValue },
          type_value: logType,
          date: new Date(),
          user_id: req.user._id,
          user_name: req.user.name,
          user_email: req.user.email,
          collectivity_id: otherIndicatorValue.collectivity_id,
          collectivity_name: otherIndicatorValue.collectivity_name,
          action_id: otherIndicatorValue.action_id,
          action_name: otherIndicatorValue.action_name,
          indicator_id: otherIndicatorValue.indicator_id,
          indicator_name: otherIndicatorValue.indicator_name,
          indicator_value_id: otherIndicatorValue._id,
          indicator_value_name: otherIndicatorValue.name,
        };
        syncLogs.push(syncLog);
      }
    }

    await IndicatorValue.updateMany(
      { indicator_id: indicatorValue.indicator_id, situation: indicatorValue.situation, year: indicatorValue.year, collectivity_id: indicatorValue.collectivity_id },
      { $set: { value: indicatorValue.value } }
    );

    if (syncLogs.length > 0) await Log.insertMany(syncLogs);
  } catch (error) {
    capture(error);
    return res.status(500).send({ ok: false, code: ERROR_CODES.SERVER_ERROR });
  }
});

router.post('/search', passport.authenticate(['admin', 'user'], { session: false, failWithError: true }), async (req, res) => {
  try {
    let query = {
      owner: 'collectivity',
    };

    if (req.body.indicator_id) query.indicator_id = req.body.indicator_id;
    if (req.body.action_id) query.action_id = req.body.action_id;
    if (req.body.situation) query.situation = req.body.situation;
    if (req.body.indicator_category_name) query.indicator_category_name = req.body.indicator_category_name;
    if (req.body.indicator_sub_category_name !== undefined) {
      if (req.body.indicator_sub_category_name === null) {
        query.$and = [{ $or: [{ indicator_sub_category_name: null }, { indicator_sub_category_name: '' }, { indicator_sub_category_name: { $exists: false } }] }];
      } else {
        query.indicator_sub_category_name = req.body.indicator_sub_category_name;
      }
    }

    if (req.user.role === 'economic_actor') {
      query.economic_actor_id = req.user.economic_actor_id;
      query.owner = 'economic_actor';
    }

    const limit = req.body.limit || 50;
    const skip = req.body.offset || 0;
    const total = await IndicatorValue.countDocuments(query);
    const data = await IndicatorValue.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit);
    return res.status(200).send({ ok: true, data, total });
  } catch (error) {
    capture(error);
    return res.status(500).send({ ok: false, code: ERROR_CODES.SERVER_ERROR });
  }
});

router.post('/duplicate_for_economic_actor', passport.authenticate(['admin', 'user'], { session: false, failWithError: true }), async (req, res) => {
  try {
    const { collectivity, economic_actor } = req.body;
    if (!collectivity || !economic_actor) return res.status(400).send({ ok: false, code: ERROR_CODES.INVALID_BODY });
    const sourceIndicatorValues = await IndicatorValue.find({ collectivity_id: collectivity._id, owner: 'collectivity' });
    if (!sourceIndicatorValues.length) return res.status(200).send({ ok: true, data: [] });
    const economicActorActions = await Action.find({ collectivity_id: collectivity._id, owner: 'economic_actor', economic_actor_id: economic_actor._id });
    if (!economicActorActions.length) return res.status(200).send({ ok: true, data: [] });

    const payloads = [];
    for (const economicActorAction of economicActorActions) {
      for (const sourceIndicatorValue of sourceIndicatorValues) {
        if (sourceIndicatorValue.action_id !== economicActorAction.action_collectivity_id) continue;

        payloads.push({
          ...sourceIndicatorValue.toObject(),
          owner: 'economic_actor',
          economic_actor_id: economic_actor._id,
          economic_actor_name: economic_actor.name,
          action_id: economicActorAction._id,
          action_name: economicActorAction.name,
          indicator_value_collectivity_id: sourceIndicatorValue._id,
          value: { text: null, number: null, radio: null, checkbox: [] },
          _id: undefined,
          __v: undefined,
          createdAt: undefined,
          updatedAt: undefined,
        });
      }
    }

    if (!payloads.length) return res.status(200).send({ ok: true, data: [] });
    const duplicatedIndicatorValues = await IndicatorValue.insertMany(payloads);

    const logs = duplicatedIndicatorValues.map((duplicatedIndicatorValue) => ({
      model_name: 'indicator_value',
      name: duplicatedIndicatorValue.name,
      operation: 'duplicate',
      date: new Date(),
      user_id: req.user._id,
      user_name: req.user.name,
      user_email: req.user.email,
      indicator_value_id: duplicatedIndicatorValue._id,
      indicator_value_name: duplicatedIndicatorValue.name,
      collectivity_id: duplicatedIndicatorValue.collectivity_id,
      collectivity_name: duplicatedIndicatorValue.collectivity_name,
      economic_actor_id: economic_actor._id,
      economic_actor_name: economic_actor.name,
    }));

    if (logs.length) await Log.insertMany(logs);
    return res.status(200).send({ ok: true, data: duplicatedIndicatorValues });
  } catch (error) {
    capture(error);
    return res.status(500).send({ ok: false, code: ERROR_CODES.SERVER_ERROR });
  }
});

router.post('/', passport.authenticate(['admin', 'user'], { session: false, failWithError: true }), async (req, res) => {
  try {
    const indicatorValue = await IndicatorValue.create(req.body);
    return res.status(200).send({ ok: true, data: indicatorValue });
  } catch (error) {
    capture(error);
    return res.status(500).send({ ok: false, data: { code: ERROR_CODES.SERVER_ERROR } });
  }
});

router.post('/export_indicator_values_excel', passport.authenticate(['admin', 'user'], { session: false, failWithError: true }), async (req, res) => {
  try {
    if (!req.body.action_id) return res.status(400).send({ ok: false, code: ERROR_CODES.INVALID_BODY });
    const action = await Action.findById(req.body.action_id);
    if (!action) return res.status(404).send({ ok: false, code: ERROR_CODES.NOT_FOUND });

    const indicatorValues = await IndicatorValue.find({ action_id: action._id });

    const indicators = await Indicator.find({ _id: { $in: [...new Set(indicatorValues.map((iv) => iv.indicator_id))] } });
    const indicatorMap = new Map(indicators.map((ind) => [ind._id.toString(), ind]));

    const workbook = new ExcelJS.Workbook();

    const situations = [
      { key: 'init', label: 'Remplissage - Sit. Init.' },
      { key: 'ref', label: 'Remplissage - Sit. Ref.' },
      { key: 'prev', label: 'Remplissage - Sit. Prev.' },
      { key: 'expost', label: 'Remplissage - Sit. Expost' },
    ];

    const columns = [
      { header: 'Catégorie', key: 'category', width: 20 },
      { header: 'Sous-catégorie', key: 'sub_category', width: 20 },
      { header: 'Titre', key: 'title', width: 30 },
      { header: 'Description', key: 'description', width: 40 },
      { header: 'Nom de la variable', key: 'excel_id', width: 20 },
      { header: 'Valeur', key: 'value', width: 15 },
      { header: 'Valeurs possibles', key: 'possibilities', width: 25 },
      { header: 'Valeur par défaut', key: 'default_value', width: 15 },
      { header: 'Unité', key: 'unit', width: 10 },
      { header: 'Type', key: 'type', width: 10 },
    ];

    for (const situation of situations) {
      const sheet = workbook.addWorksheet(situation.label);
      sheet.columns = columns;

      sheet.getRow(1).font = { bold: true };
      sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };

      const situationValues = indicatorValues.filter((iv) => iv.situation === situation.key);

      for (const indicatorValue of situationValues) {
        const indicator = indicatorMap.get(indicatorValue.indicator_id);
        if (!indicator) continue;

        let value = indicatorValue.value?.[indicator.value_type];
        if (Array.isArray(value)) value = value.join(', ');

        let defaultValue = indicatorValue.value_default?.[indicator.value_type];
        if (Array.isArray(defaultValue)) defaultValue = defaultValue.join(', ');

        sheet.addRow({
          category: indicator.indicator_category_name || '',
          sub_category: indicator.indicator_sub_category_name || '',
          title: indicator.name || '',
          description: indicator.description || '',
          excel_id: indicator.excel_indicator_id || '',
          value: value ?? '',
          possibilities: indicatorValue.indicator_value_possibilities?.join(', ') || '',
          default_value: defaultValue ?? '',
          unit: indicator.value_unit || '',
          type: indicator.value_type || '',
        });
      }
    }

    const buffer = await workbook.xlsx.writeBuffer();

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(`indicateurs_${action.name}.xlsx`)}"`);
    res.setHeader('Content-Length', buffer.length);
    res.end(buffer);
  } catch (error) {
    capture(error);
    return res.status(500).send({ ok: false, code: ERROR_CODES.SERVER_ERROR });
  }
});

router.post('/importIndicatorValues', passport.authenticate(['admin', 'user'], { session: false, failWithError: true }), async (req, res) => {
  try {
    const { fileBase64, collectivity } = req.body;
    if (!fileBase64) return res.status(400).json({ ok: false, data: { error: 'fileBase64 is required' } });
    if (!collectivity) return res.status(400).json({ ok: false, data: { error: 'collectivity is required' } });

    const fileBuffer = Buffer.from(fileBase64, 'base64');

    const { extractedData } = await importSheetsToExcelFile(collectivity.excelFileId, fileBuffer, SITUATION_SHEETS);
    if (!extractedData || extractedData.length === 0) return res.status(200).json({ ok: true });
    const indicators = await Indicator.find({ excel_indicator_id: { $in: [...new Set(extractedData.map((d) => d.excel_indicator_id))] } });
    const indicatorMap = new Map(indicators.map((ind) => [ind.excel_indicator_id, ind]));

    const indicatorValues = await IndicatorValue.find({
      indicator_id: { $in: indicators.map((ind) => ind._id.toString()) },
      collectivity_id: collectivity._id,
      situation: { $in: [...new Set(extractedData.map((d) => d.situation))] },
    });

    const indicatorValueMap = new Map();
    for (const iv of indicatorValues) {
      const key = `${iv.indicator_id}_${iv.situation}`;
      if (!indicatorValueMap.has(key)) indicatorValueMap.set(key, []);
      indicatorValueMap.get(key).push(iv);
    }

    const bulkOps = [];
    const logs = [];

    for (const data of extractedData) {
      const indicator = indicatorMap.get(data.excel_indicator_id);
      if (!indicator) continue;

      const matchingValues = indicatorValueMap.get(`${indicator._id.toString()}_${data.situation}`) || [];

      for (const indicatorValue of matchingValues) {
        if (indicatorValue.indicator_type === 'number') data.value = isNaN(parseFloat(data.value)) ? null : parseFloat(data.value);
        if (indicatorValue.indicator_type === 'checkbox') {
          const strValue = data.value != null ? String(data.value) : '';
          data.value = strValue
            .split(/[,;.]/)
            .map((v) => v.trim())
            .filter((v) => v);
        }
        if (indicatorValue.indicator_type === 'radio' || indicatorValue.indicator_type === 'text') data.value = data.value != null ? String(data.value).trim() : '';

        const oldValue = indicatorValue.value?.[indicatorValue.indicator_type];
        const isOldEmpty = oldValue == null || oldValue === '' || (Array.isArray(oldValue) && oldValue.length === 0);
        const isNewEmpty = data.value == null || data.value === '' || (Array.isArray(data.value) && data.value.length === 0);
        if (isOldEmpty && isNewEmpty) continue;
        if (JSON.stringify(oldValue) === JSON.stringify(data.value)) continue;
        logs.push(
          new Log({
            model_name: 'indicator_value',
            name: indicator.name,
            field: 'value',
            operation: 'update',
            new_value: { [Array.isArray(data.value) ? 'array' : typeof data.value]: data.value },
            previous_value: { [Array.isArray(oldValue) ? 'array' : typeof oldValue]: oldValue },
            type_value: Array.isArray(data.value) ? 'array' : typeof data.value,
            date: new Date(),
            user_id: req.user.id,
            user_name: req.user.name,
            user_email: req.user.email,
            collectivity_id: indicatorValue.collectivity_id,
            collectivity_name: indicatorValue.collectivity_name,
            action_id: indicatorValue.action_id,
            action_name: indicatorValue.action_name,
            indicator_id: indicatorValue.indicator_id,
            indicator_name: indicatorValue.indicator_name,
            indicator_value_id: indicatorValue._id.toString(),
            indicator_value_name: indicatorValue.name,
          })
        );
        bulkOps.push({ updateOne: { filter: { _id: indicatorValue._id }, update: { $set: { [`value.${indicatorValue.indicator_type}`]: data.value } } } });
      }
    }

    if (bulkOps.length > 0) await IndicatorValue.bulkWrite(bulkOps);
    if (logs.length > 0) await Log.insertMany(logs);

    res.status(200).json({ ok: true });
  } catch (error) {
    capture(error);
    res.status(500).json({ ok: false, data: { error: error.message } });
  }
});

module.exports = router;
