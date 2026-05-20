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
const { updateExcelCellByIndicatorId, importSheetsToExcelFile, graphFetch, sharePointSiteName } = require('../services/microsoftGraph');
const Collectivity = require('../models/collectivity');
const EconomicActor = require('../models/economic_actor');
const { isIndicatorValueFilled, computeActionCompletion } = require('../utils/completion');
const { HIDDEN_IDS, buildYearMappings, shouldDisplayIndicator } = require('../utils/indicators');
const SITUATION_SHEETS = [
  { sheetName: 'Remplissage - Sit. Init.', situation: 'init' },
  { sheetName: 'Remplissage - Sit. Ref.', situation: 'ref' },
  { sheetName: 'Remplissage - Sit. Prev.', situation: 'prev' },
  { sheetName: 'Remplissage - Sit. Expost', situation: 'expost' },
];

const ACTION_AGREG_ROW = { B2: 12, B3: 13, B4: 14, C1: 15, C2: 16, C3: 17, C4: 18, C6: 19, C7: 20, C9: 21 };
const EMISSION_READ_COL = { GES: 3, PM: 8, NOx: 13, HC: 18, CO: 23, 'Énergie': 28 };
const EMISSION_WRITE_KEY = { 'Énergie': 'Nrj' };
const SIT_OFFSET = { init: 0, ref: 1, prev: 2, expost: 3 };
const SIT_LABEL = { init: 'Init', ref: 'Réf', prev: 'Prév', expost: 'Expost' };

// Column letter for aggregation: instance 1 → I, instance 2 → J, instance 3 → K, etc.
const getAggregationCol = (instanceNumber) => String.fromCharCode(72 + (instanceNumber || 1)); // 72 = 'H', so +1 = 'I'

const getAggregationFileId = async (action) => {
  if (action.owner === 'economic_actor' && action.economic_actor_id) {
    const actor = await EconomicActor.findById(action.economic_actor_id);
    const coll = actor?.collectivities?.find((c) => c.id === action.collectivity_id);
    return coll?.aggregation_excel_file_id || null;
  }
  const collectivityDoc = await Collectivity.findById(action.collectivity_id);
  return collectivityDoc?.aggregation_excel_file_id || null;
};

const updateOnboardingStatus = async (action) => {
  if (action.type !== 'config' || (action.name !== 'Données de base' && action.name !== 'Parc types')) return;
  try {
    const ownerFilter = { owner: action.owner };
    if (action.owner === 'economic_actor' && action.economic_actor_id) ownerFilter.economic_actor_id = action.economic_actor_id;

    const allIVs = await IndicatorValue.find({ action_id: action._id, indicator_excel_id: { $nin: HIDDEN_IDS }, ...ownerFilter }).lean();

    const condExcelIds = new Set();
    for (const iv of allIVs) {
      if (iv.display_condition?.conditions) {
        for (const cond of iv.display_condition.conditions) {
          if (cond.excel_indicator_id) condExcelIds.add(cond.excel_indicator_id);
        }
      }
    }

    const [regularActions, condValues] = await Promise.all([
      Action.find({ collectivity_id: action.collectivity_id, type: { $ne: 'config' }, ...ownerFilter }),
      condExcelIds.size > 0 ? IndicatorValue.find({ collectivity_id: action.collectivity_id, indicator_excel_id: { $in: [...condExcelIds] }, ...ownerFilter }) : Promise.resolve([]),
    ]);

    const conditionValuesMap = new Map();
    for (const cv of condValues) conditionValuesMap.set(`${cv.indicator_excel_id}_${cv.situation}_${cv.year}`, cv);

    const yearMappingsBySituationYear = buildYearMappings(regularActions);

    let total = 0;
    let filled = 0;
    for (const iv of allIVs) {
      if (!shouldDisplayIndicator(iv, yearMappingsBySituationYear[`${iv.situation}_${iv.year}`], conditionValuesMap)) continue;
      total++;
      if (isIndicatorValueFilled(iv)) filled++;
    }

    const isComplete = total > 0 && filled === total;
    const field = action.name === 'Données de base' ? 'basedata_onboarded' : 'parc_types_onboarded';

    if (action.owner === 'economic_actor' && action.economic_actor_id) {
      await EconomicActor.updateOne({ _id: action.economic_actor_id, 'collectivities.id': action.collectivity_id }, { $set: { [`collectivities.$.${field}`]: isComplete } });
    } else {
      if (isComplete) await Collectivity.updateOne({ _id: action.collectivity_id }, { $set: { [field]: true } });
    }
    await Action.updateOne({ _id: action._id }, { $set: { status: isComplete ? 'completed' : 'in_progress' } });
  } catch (e) {
    capture(e);
  }
};

// Aggregated stats for an action (situation/year mapping + completion) - avoids fetching all documents client-side
router.post('/stats', passport.authenticate(['admin', 'user'], { session: false, failWithError: true }), async (req, res) => {
  try {
    const { action_id } = req.body;
    if (!action_id) return res.status(400).send({ ok: false, code: ERROR_CODES.INVALID_BODY });

    const matchQuery = { action_id, indicator_excel_id: { $nin: HIDDEN_IDS } };
    matchQuery.owner = req.body.owner || 'collectivity';
    if (req.body.economic_actor_id) matchQuery.economic_actor_id = req.body.economic_actor_id;
    if (req.user.role === 'economic_actor') {
      matchQuery.economic_actor_id = req.user.economic_actor_id;
      matchQuery.owner = 'economic_actor';
    }

    // Parallel: fetch indicator values + config action at the same time
    const [indicatorValues, configAction] = await Promise.all([IndicatorValue.find(matchQuery), Action.findById(action_id)]);

    // Build situationYears + collect condExcelIds in a single pass
    const situationYears = {};
    const condExcelIds = new Set();
    for (const iv of indicatorValues) {
      if (!situationYears[iv.situation]) situationYears[iv.situation] = [];
      if (iv.year != null && !situationYears[iv.situation].includes(iv.year)) situationYears[iv.situation].push(iv.year);
      if (iv.display_condition?.conditions) {
        for (const cond of iv.display_condition.conditions) {
          if (cond.excel_indicator_id) condExcelIds.add(cond.excel_indicator_id);
        }
      }
    }
    for (const sit in situationYears) {
      situationYears[sit].sort((a, b) => a - b);
    }

    // Parallel: fetch regular actions + condition values at the same time
    let actionsBySituationYear = {};
    let yearMappingsBySituationYear = {};
    const conditionValuesMap = new Map();

    let regularActionsPromise = Promise.resolve([]);
    if (configAction) {
      const ownerFilter = { owner: configAction.owner };
      if (configAction.owner === 'economic_actor' && configAction.economic_actor_id) ownerFilter.economic_actor_id = configAction.economic_actor_id;
      regularActionsPromise = Action.find({ collectivity_id: configAction.collectivity_id, type: { $ne: 'config' }, ...ownerFilter });
    }

    let condValuesPromise = Promise.resolve([]);
    if (condExcelIds.size > 0 && configAction) {
      const condQuery = { collectivity_id: configAction.collectivity_id, indicator_excel_id: { $in: [...condExcelIds] }, owner: matchQuery.owner };
      if (matchQuery.economic_actor_id) condQuery.economic_actor_id = matchQuery.economic_actor_id;
      condValuesPromise = IndicatorValue.find(condQuery);
    }

    const [regularActions, condValues] = await Promise.all([regularActionsPromise, condValuesPromise]);

    for (const cv of condValues) conditionValuesMap.set(`${cv.indicator_excel_id}_${cv.situation}_${cv.year}`, cv);

    if (configAction) {
      for (const a of regularActions) {
        const actionInfo = { name: a.name, instance_number: a.instance_number };
        if (a.year_init != null) (actionsBySituationYear[`init_${a.year_init}`] ||= []).push(actionInfo);
        const refYears = new Set();
        for (const f of a.exel_files_prev || []) if (f.year_ref != null) refYears.add(f.year_ref);
        for (const f of a.excel_files_expost || []) if (f.year_ref != null) refYears.add(f.year_ref);
        for (const y of refYears) (actionsBySituationYear[`ref_${y}`] ||= []).push(actionInfo);
        for (const f of a.exel_files_prev || []) if (f.year_prev != null) (actionsBySituationYear[`prev_${f.year_prev}`] ||= []).push(actionInfo);
        for (const f of a.excel_files_expost || []) if (f.year_expost != null) (actionsBySituationYear[`expost_${f.year_expost}`] ||= []).push(actionInfo);
      }
      yearMappingsBySituationYear = buildYearMappings(regularActions);
    }

    // Compute completion stats, excluding indicators hidden by display conditions
    const completion = {};
    let totalAll = 0;
    let filledAll = 0;
    let totalPrimordialAll = 0;
    let filledPrimordialAll = 0;

    for (const iv of indicatorValues) {
      const key = `${iv.situation}_${iv.year}`;
      if (!shouldDisplayIndicator(iv, yearMappingsBySituationYear[key], conditionValuesMap)) continue;

      if (!completion[key]) completion[key] = { total: 0, filled: 0, totalPrimordial: 0, filledPrimordial: 0 };
      completion[key].total++;
      totalAll++;
      if (iv.is_primordial) {
        completion[key].totalPrimordial++;
        totalPrimordialAll++;
      }

      if (isIndicatorValueFilled(iv)) {
        completion[key].filled++;
        filledAll++;
        if (iv.is_primordial) {
          completion[key].filledPrimordial++;
          filledPrimordialAll++;
        }
      }
    }

    return res.status(200).send({ ok: true, data: { situationYears, completion, totalAll, filledAll, totalPrimordialAll, filledPrimordialAll, actionsBySituationYear, yearMappingsBySituationYear } });
  } catch (error) {
    capture(error);
    return res.status(500).send({ ok: false, code: ERROR_CODES.SERVER_ERROR });
  }
});

// Check general data completion for all config actions of a collectivity, grouped by related action
router.post('/check-general-data-completion', passport.authenticate(['admin', 'user'], { session: false, failWithError: true }), async (req, res) => {
  try {
    const { collectivity_id, economic_actor_id } = req.body;
    if (!collectivity_id) return res.status(400).send({ ok: false, code: ERROR_CODES.INVALID_BODY });

    const ownerFilter = economic_actor_id ? { owner: 'economic_actor', economic_actor_id } : { owner: 'collectivity' };
    const [configActions, regularActions] = await Promise.all([Action.find({ collectivity_id, type: 'config', ...ownerFilter }), Action.find({ collectivity_id, type: { $ne: 'config' }, ...ownerFilter })]);

    if (configActions.length === 0) return res.status(200).send({ ok: true, data: [] });

    const indicatorValues = await IndicatorValue.find({ action_id: { $in: configActions.map((a) => a._id.toString()) }, indicator_excel_id: { $nin: HIDDEN_IDS } });

    const yearMappingsBySituationYear = buildYearMappings(regularActions);

    // Collect and fetch condition values
    const condExcelIds = new Set();
    for (const iv of indicatorValues) {
      if (iv.display_condition?.conditions) {
        for (const cond of iv.display_condition.conditions) {
          if (cond.excel_indicator_id) condExcelIds.add(cond.excel_indicator_id);
        }
      }
    }
    const conditionValuesMap = new Map();
    if (condExcelIds.size > 0) {
      const condValues = await IndicatorValue.find({ collectivity_id, indicator_excel_id: { $in: [...condExcelIds] }, ...ownerFilter });
      for (const cv of condValues) conditionValuesMap.set(`${cv.indicator_excel_id}_${cv.situation}_${cv.year}`, cv);
    }

    // Group by configAction name + situation + year, compute completion (only for displayed indicators)
    const groups = {};
    for (const iv of indicatorValues) {
      if (!shouldDisplayIndicator(iv, yearMappingsBySituationYear[`${iv.situation}_${iv.year}`], conditionValuesMap)) continue;

      const key = `${iv.action_name}__${iv.situation}__${iv.year}`;
      if (!groups[key]) groups[key] = { configActionName: iv.action_name, situation: iv.situation, year: iv.year, total: 0, filled: 0 };
      groups[key].total++;
      if (isIndicatorValueFilled(iv)) groups[key].filled++;
    }

    // Map situation/year to action names from regular actions
    const situationYearActions = {};
    for (const action of regularActions) {
      if (action.year_init != null) (situationYearActions[`init_${action.year_init}`] ||= []).push(action.name);
      const refYears = new Set();
      for (const f of action.exel_files_prev || []) {
        if (f.year_ref != null) refYears.add(f.year_ref);
        if (f.year_prev != null) (situationYearActions[`prev_${f.year_prev}`] ||= []).push(action.name);
      }
      for (const f of action.excel_files_expost || []) {
        if (f.year_ref != null) refYears.add(f.year_ref);
        if (f.year_expost != null) (situationYearActions[`expost_${f.year_expost}`] ||= []).push(action.name);
      }
      for (const y of refYears) (situationYearActions[`ref_${y}`] ||= []).push(action.name);
    }

    // Build result grouped by action name
    const groupedMap = {};
    for (const group of Object.values(groups)) {
      if (group.filled >= group.total) continue;
      for (const actionName of situationYearActions[`${group.situation}_${group.year}`] || [])
        (groupedMap[actionName] ||= []).push({ configActionName: group.configActionName, situation: group.situation, year: group.year, completion: group.total > 0 ? Math.round((group.filled / group.total) * 100) : 0 });
    }

    return res.status(200).send({ ok: true, data: Object.entries(groupedMap).map(([actionName, items]) => ({ actionName, items })) });
  } catch (error) {
    capture(error);
    return res.status(500).send({ ok: false, code: ERROR_CODES.SERVER_ERROR });
  }
});

// Fetch only the indicator values needed for display condition evaluation (by excel_indicator_id)
router.post('/condition_values', passport.authenticate(['admin', 'user'], { session: false, failWithError: true }), async (req, res) => {
  try {
    const { collectivity_id, excel_indicator_ids, owner, economic_actor_id } = req.body;
    if (!collectivity_id || !excel_indicator_ids?.length) {
      return res.status(400).send({ ok: false, code: ERROR_CODES.INVALID_BODY });
    }

    const query = { collectivity_id, indicator_excel_id: { $in: excel_indicator_ids }, owner: owner || 'collectivity' };
    if (economic_actor_id) query.economic_actor_id = economic_actor_id;
    if (req.user.role === 'economic_actor') {
      query.economic_actor_id = req.user.economic_actor_id;
      query.owner = 'economic_actor';
    }

    return res.status(200).send({ ok: true, data: await IndicatorValue.find(query) });
  } catch (error) {
    capture(error);
    return res.status(500).send({ ok: false, code: ERROR_CODES.SERVER_ERROR });
  }
});

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

    let collectivity = null;
    if (action.owner === 'economic_actor') {
      const economicActor = await EconomicActor.findById(action.economic_actor_id);
      if (!economicActor) return res.status(404).send({ ok: false, code: ERROR_CODES.NOT_FOUND });
      collectivity = economicActor.collectivities.find((c) => c.id === action.collectivity_id);
    }
    if (action.owner === 'collectivity') collectivity = await Collectivity.findById(action.collectivity_id);
    if (!collectivity) return res.status(404).send({ ok: false, code: ERROR_CODES.NOT_FOUND });

    action.last_modif_by_id = req.user._id;
    action.last_modif_by_name = req.user.name;
    action.last_modif_by_email = req.user.email;
    action.last_modif_date = new Date();
    await action.save();
    const indicator = await Indicator.findById(indicatorValue.indicator_id);
    if (!indicator) return res.status(404).send({ ok: false, code: ERROR_CODES.NOT_FOUND });

    const logs = [];

    for (const field of Object.keys(req.body)) {
      if (['updatedAt', '__v', 'createdAt', '_id', 'owner', 'value_source', 'source'].includes(field)) continue;
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
        source: req.body.source || indicatorValue.value_source,
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

    const { source, ...updateData } = req.body;
    if (source) updateData.value_source = source;
    indicatorValue.set(updateData);
    await indicatorValue.save();

    await computeActionCompletion(indicatorValue.action_id);

    await updateOnboardingStatus(action);

    const excelUpdatePromises = [];
    let actionsWithSameYear = [];

    if (action.type === 'config') {
      const ownerFilter = { owner: action.owner, ...(action.owner === 'economic_actor' ? { economic_actor_id: action.economic_actor_id } : {}) };
      const collectivityFilter = action.owner === 'economic_actor' ? {} : { collectivity_id: action.collectivity_id };

      if (indicatorValue.situation === 'ref') actionsWithSameYear = await Action.find({ ...collectivityFilter, $or: [{ 'exel_files_prev.year_ref': indicatorValue.year }, { 'excel_files_expost.year_ref': indicatorValue.year }], type: { $ne: 'config' }, ...ownerFilter });
      if (indicatorValue.situation === 'prev') actionsWithSameYear = await Action.find({ ...collectivityFilter, 'exel_files_prev.year_prev': indicatorValue.year, type: { $ne: 'config' }, ...ownerFilter });
      if (indicatorValue.situation === 'expost') actionsWithSameYear = await Action.find({ ...collectivityFilter, 'excel_files_expost.year_expost': indicatorValue.year, type: { $ne: 'config' }, ...ownerFilter });
      if (indicatorValue.situation === 'init') actionsWithSameYear = await Action.find({ ...collectivityFilter, year_init: indicatorValue.year, type: { $ne: 'config' }, 'exel_files_prev.0.excel_file_id': { $exists: true }, ...ownerFilter });

      for (const targetAction of actionsWithSameYear) {
        if (indicatorValue.situation === 'prev') {
          for (const excelFile of targetAction.exel_files_prev || []) {
            if (excelFile.excel_file_id && excelFile.year_prev === indicatorValue.year)
              excelUpdatePromises.push(updateExcelCellByIndicatorId(excelFile.excel_file_id, indicator.excel_indicator_id, req.body.value[indicatorValue.indicator_type], indicatorValue.situation, indicator.value_unit).catch(capture));
          }
        }
        if (indicatorValue.situation === 'ref') {
          for (const excelFile of targetAction.exel_files_prev || []) {
            if (excelFile.excel_file_id && excelFile.year_ref === indicatorValue.year)
              excelUpdatePromises.push(updateExcelCellByIndicatorId(excelFile.excel_file_id, indicator.excel_indicator_id, req.body.value[indicatorValue.indicator_type], indicatorValue.situation, indicator.value_unit).catch(capture));
          }
          for (const excelFile of targetAction.excel_files_expost || []) {
            if (excelFile.excel_file_id && excelFile.year_ref === indicatorValue.year)
              excelUpdatePromises.push(updateExcelCellByIndicatorId(excelFile.excel_file_id, indicator.excel_indicator_id, req.body.value[indicatorValue.indicator_type], indicatorValue.situation, indicator.value_unit).catch(capture));
          }
        }
        if (indicatorValue.situation === 'expost') {
          for (const excelFile of targetAction.excel_files_expost || []) {
            if (excelFile.excel_file_id && excelFile.year_expost === indicatorValue.year)
              excelUpdatePromises.push(updateExcelCellByIndicatorId(excelFile.excel_file_id, indicator.excel_indicator_id, req.body.value[indicatorValue.indicator_type], indicatorValue.situation, indicator.value_unit).catch(capture));
          }
        }
        if (indicatorValue.situation === 'init') {
          // init : mettre à jour tous les fichiers
          for (const excelFile of targetAction.exel_files_prev || []) {
            if (excelFile.excel_file_id) excelUpdatePromises.push(updateExcelCellByIndicatorId(excelFile.excel_file_id, indicator.excel_indicator_id, req.body.value[indicatorValue.indicator_type], indicatorValue.situation, indicator.value_unit).catch(capture));
          }
          for (const excelFile of targetAction.excel_files_expost || []) {
            if (excelFile.excel_file_id) excelUpdatePromises.push(updateExcelCellByIndicatorId(excelFile.excel_file_id, indicator.excel_indicator_id, req.body.value[indicatorValue.indicator_type], indicatorValue.situation, indicator.value_unit).catch(capture));
          }
        }
      }
    }
    if (action.type !== 'config') {
      if (indicatorValue.situation === 'init') {
        const AllExcelFiles = [...(action.exel_files_prev || []), ...(action.excel_files_expost || [])];
        for (const excelFile of AllExcelFiles) {
          excelUpdatePromises.push(updateExcelCellByIndicatorId(excelFile.excel_file_id, indicator.excel_indicator_id, req.body.value[indicatorValue.indicator_type], indicatorValue.situation, indicator.value_unit).catch(capture));
        }
      }
      if (indicatorValue.situation === 'prev') {
        for (const excelFile of action.exel_files_prev || []) {
          if (excelFile.year_prev !== indicatorValue.year) continue;
          excelUpdatePromises.push(updateExcelCellByIndicatorId(excelFile.excel_file_id, indicator.excel_indicator_id, req.body.value[indicatorValue.indicator_type], indicatorValue.situation, indicator.value_unit).catch(capture));
        }
      }
      if (indicatorValue.situation === 'ref') {
        for (const excelFile of action.exel_files_prev || []) {
          if (excelFile.year_ref !== indicatorValue.year) continue;
          excelUpdatePromises.push(updateExcelCellByIndicatorId(excelFile.excel_file_id, indicator.excel_indicator_id, req.body.value[indicatorValue.indicator_type], indicatorValue.situation, indicator.value_unit).catch(capture));
        }
        for (const excelFile of action.excel_files_expost || []) {
          if (excelFile.year_ref !== indicatorValue.year) continue;
          excelUpdatePromises.push(updateExcelCellByIndicatorId(excelFile.excel_file_id, indicator.excel_indicator_id, req.body.value[indicatorValue.indicator_type], indicatorValue.situation, indicator.value_unit).catch(capture));
        }
      }
      if (indicatorValue.situation === 'expost') {
        for (const excelFile of action.excel_files_expost || []) {
          if (excelFile.year_expost !== indicatorValue.year) continue;
          excelUpdatePromises.push(updateExcelCellByIndicatorId(excelFile.excel_file_id, indicator.excel_indicator_id, req.body.value[indicatorValue.indicator_type], indicatorValue.situation, indicator.value_unit).catch(capture));
        }
      }
    }

    await Promise.all(excelUpdatePromises);

    // Read Agrégation sheet & write emission values to collectivity aggregation Excel ("1. Données d'entrée")
    if (action.type !== 'config') {
      try {
        const allFiles = [...(action.exel_files_prev || []), ...(action.excel_files_expost || [])];
        let fileId = allFiles.find((f) => f.excel_file_id)?.excel_file_id;
        if (indicatorValue.situation === 'prev') fileId = (action.exel_files_prev || []).find((f) => f.excel_file_id && f.year_prev === indicatorValue.year)?.excel_file_id;
        if (indicatorValue.situation === 'expost') fileId = (action.excel_files_expost || []).find((f) => f.excel_file_id && f.year_expost === indicatorValue.year)?.excel_file_id;
        if (indicatorValue.situation === 'ref') fileId = allFiles.find((f) => f.excel_file_id && f.year_ref === indicatorValue.year)?.excel_file_id;

        if (fileId) {
          const siteId = (await graphFetch(`/sites/${sharePointSiteName}.sharepoint.com`)).id;
          try {
            await graphFetch(`/sites/${siteId}/drive/items/${fileId}/workbook/application/calculate`, { method: 'POST', body: JSON.stringify({ calculationType: 'Full' }) });
          } catch (e) {}
          const result = await graphFetch(`/sites/${siteId}/drive/items/${fileId}/workbook/worksheets/${encodeURIComponent('Agrégation')}/usedRange`);
          const rows = result.values || [];

          const agregRow = ACTION_AGREG_ROW[action.excel_worksheetname];
          const sitOffset = SIT_OFFSET[indicatorValue.situation];

          if (agregRow !== undefined && rows[agregRow]) {
            const rawEmissionValues = {};
            for (const [emission, col] of Object.entries(EMISSION_READ_COL)) {
              rawEmissionValues[emission] = rows[agregRow][col + sitOffset];
            }

            const aggregationFileId = await getAggregationFileId(action);
            if (aggregationFileId) {
              const inputSheetPath = `/sites/${siteId}/drive/items/${aggregationFileId}/workbook/worksheets/${encodeURIComponent("1. Données d'entrée")}`;
              const inputResult = await graphFetch(`${inputSheetPath}/usedRange`);
              const inputRows = inputResult.values || [];

              const idRowMap = new Map();
              for (let i = 0; i < inputRows.length; i++) {
                const id = inputRows[i][1]; // Column D (index 1 dans usedRange qui commence à C)
                if (id) idRowMap.set(String(id).trim(), i + 1);
              }

              const sitLabel = SIT_LABEL[indicatorValue.situation];
              const agregCol = getAggregationCol(action.instance_number);
              for (const [emission] of Object.entries(EMISSION_READ_COL)) {
                const writeKey = EMISSION_WRITE_KEY[emission] || emission;
                const rowNum = idRowMap.get(`${action.excel_worksheetname}-${writeKey}-${sitLabel}-${indicatorValue.year}`);
                if (rowNum === undefined) continue;
                await graphFetch(`${inputSheetPath}/range(address='${agregCol}${rowNum}')`, {
                  method: 'PATCH',
                  body: JSON.stringify({ values: [[String(rawEmissionValues[emission]).includes('#N/A') ? '' : rawEmissionValues[emission]]] }),
                });
              }
            }
          }
        }
      } catch (e) {
        console.log('[Agrégation] Error:', e.message);
      }
    }

    // Config: read Agrégation sheet from each affected regular action & write to collectivity aggregation Excel ("1. Données d'entrée")
    if (action.type === 'config' && actionsWithSameYear.length > 0) {
      try {
        const siteId = (await graphFetch(`/sites/${sharePointSiteName}.sharepoint.com`)).id;
        const sitOffset = SIT_OFFSET[indicatorValue.situation];
        const sitLabel = SIT_LABEL[indicatorValue.situation];
        const uniqueActions = [...new Map(actionsWithSameYear.map((a) => [a._id.toString(), a])).values()];

        for (const targetAction of uniqueActions) {
          const allFiles = [...(targetAction.exel_files_prev || []), ...(targetAction.excel_files_expost || [])];
          let fileId = allFiles.find((f) => f.excel_file_id)?.excel_file_id;
          if (indicatorValue.situation === 'prev') fileId = (targetAction.exel_files_prev || []).find((f) => f.excel_file_id && f.year_prev === indicatorValue.year)?.excel_file_id;
          if (indicatorValue.situation === 'expost') fileId = (targetAction.excel_files_expost || []).find((f) => f.excel_file_id && f.year_expost === indicatorValue.year)?.excel_file_id;
          if (indicatorValue.situation === 'ref') fileId = allFiles.find((f) => f.excel_file_id && f.year_ref === indicatorValue.year)?.excel_file_id;
          if (!fileId) continue;

          const agregRow = ACTION_AGREG_ROW[targetAction.excel_worksheetname];
          if (agregRow === undefined) continue;

          try {
            await graphFetch(`/sites/${siteId}/drive/items/${fileId}/workbook/application/calculate`, { method: 'POST', body: JSON.stringify({ calculationType: 'Full' }) });
          } catch (e) {}
          const result = await graphFetch(`/sites/${siteId}/drive/items/${fileId}/workbook/worksheets/${encodeURIComponent('Agrégation')}/usedRange`);
          const rows = result.values || [];

          if (!rows[agregRow]) continue;

          const rawEmissionValues = {};
          for (const [emission, col] of Object.entries(EMISSION_READ_COL)) {
            rawEmissionValues[emission] = rows[agregRow][col + sitOffset];
          }

          const aggregationFileId = await getAggregationFileId(targetAction);
          if (!aggregationFileId) continue;

          const inputSheetPath = `/sites/${siteId}/drive/items/${aggregationFileId}/workbook/worksheets/${encodeURIComponent("1. Données d'entrée")}`;
          const inputResult2 = await graphFetch(`${inputSheetPath}/usedRange`);
          const inputRows2 = inputResult2.values || [];

          const idRowMap = new Map();
          for (let i = 0; i < inputRows2.length; i++) {
            const id = inputRows2[i][1]; // Column D (index 1 dans usedRange qui commence à C)
            if (id) idRowMap.set(String(id).trim(), i + 1);
          }

          const targetAgregCol = getAggregationCol(targetAction.instance_number);
          for (const [emission] of Object.entries(EMISSION_READ_COL)) {
            const writeKey = EMISSION_WRITE_KEY[emission] || emission;
            const rowNum = idRowMap.get(`${targetAction.excel_worksheetname}-${writeKey}-${sitLabel}-${indicatorValue.year}`);
            if (rowNum === undefined) continue;
            await graphFetch(`${inputSheetPath}/range(address='${targetAgregCol}${rowNum}')`, {
              method: 'PATCH',
              body: JSON.stringify({ values: [[String(rawEmissionValues[emission]).includes('#N/A') ? '' : rawEmissionValues[emission]]] }),
            });
          }
        }
      } catch (e) {
        console.log('[Agrégation-config] Error:', e.message);
      }
    }

    if (logs.length > 0) await Log.insertMany(logs);

    if (!(indicatorValue.indicator_id && indicatorValue.situation && indicatorValue.year && indicatorValue.collectivity_id)) return res.status(200).send({ ok: true, data: indicatorValue });
    const payload = { indicator_id: indicatorValue.indicator_id, situation: indicatorValue.situation, year: indicatorValue.year, source_type: indicatorValue.source_type, owner: indicatorValue.owner, _id: { $ne: indicatorValue._id } };

    // For non-config actions, scope sync to the same action only (each instance has independent values)
    if (action.type !== 'config') payload.action_id = indicatorValue.action_id;

    if (indicatorValue.owner === 'economic_actor' && indicatorValue.economic_actor_id) {
      payload.economic_actor_id = indicatorValue.economic_actor_id;
    } else {
      payload.collectivity_id = indicatorValue.collectivity_id;
    }
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
          source: 'synchronization',
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

    const updateQuery = { indicator_id: indicatorValue.indicator_id, situation: indicatorValue.situation, year: indicatorValue.year, owner: indicatorValue.owner };
    // For non-config actions, scope sync to the same action only
    if (action.type !== 'config') {
      updateQuery.action_id = indicatorValue.action_id;
    }
    if (indicatorValue.owner === 'economic_actor' && indicatorValue.economic_actor_id) {
      updateQuery.economic_actor_id = indicatorValue.economic_actor_id;
    } else {
      updateQuery.collectivity_id = indicatorValue.collectivity_id;
    }
    await IndicatorValue.updateMany(updateQuery, { $set: { value: indicatorValue.value } });

    if (syncLogs.length > 0) await Log.insertMany(syncLogs);

    return res.status(200).send({ ok: true, data: indicatorValue });
  } catch (error) {
    capture(error);
    return res.status(500).send({ ok: false, code: ERROR_CODES.SERVER_ERROR });
  }
});

router.post('/search', passport.authenticate(['admin', 'user'], { session: false, failWithError: true }), async (req, res) => {
  try {
    let query = {};

    query.owner = 'collectivity';
    if (req.body.owner) query.owner = req.body.owner;

    if (req.body.indicator_id) query.indicator_id = req.body.indicator_id;
    if (req.body.action_id) query.action_id = req.body.action_id;
    if (req.body.action_name) query.action_name = req.body.action_name;
    if (req.body.collectivity_id) query.collectivity_id = req.body.collectivity_id;
    if (req.body.situation) query.situation = req.body.situation;
    if (req.body.year) query.year = req.body.year;
    if (req.body.indicator_category_name) query.indicator_category_name = req.body.indicator_category_name;
    if (req.body.indicator_value_collectivity_id) query.indicator_value_collectivity_id = req.body.indicator_value_collectivity_id;
    if (req.body.indicator_value_collectivity_ids) query.indicator_value_collectivity_id = { $in: req.body.indicator_value_collectivity_ids };
    if (req.body.indicator_ids) query.indicator_id = { $in: req.body.indicator_ids };
    if (req.body.indicator_sub_category_name !== undefined) {
      if (req.body.indicator_sub_category_name === null) query.indicator_sub_category_name = { $exists: false };
      query.indicator_sub_category_name = req.body.indicator_sub_category_name;
    }
    if (req.body.economic_actor_id) query.economic_actor_id = req.body.economic_actor_id;

    if (req.user.role === 'economic_actor') {
      query.economic_actor_id = req.user.economic_actor_id;
      query.owner = 'economic_actor';
    }

    if (req.body.unfilled_only) {
      query.$or = [
        { indicator_type: 'number', 'value.number': null },
        { indicator_type: 'text', 'value.text': { $in: [null, ''] } },
        { indicator_type: 'radio', 'value.radio': { $in: [null, ''] } },
        { indicator_type: 'checkbox', $or: [{ 'value.checkbox': { $size: 0 } }, { 'value.checkbox': null }] },
      ];
    }

    if (req.body.primordial_only) query.is_primordial = true;

    const data = await IndicatorValue.find(query)
      .sort({ excel_line_number: 1 })
      .skip(req.body.offset || 0)
      .limit(req.body.limit || 50);
    return res.status(200).send({ ok: true, data, total: await IndicatorValue.countDocuments(query) });
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
    return res.status(500).send({ ok: false, code: ERROR_CODES.SERVER_ERROR });
  }
});

router.post('/export_indicator_values_excel', passport.authenticate(['admin', 'user'], { session: false, failWithError: true }), async (req, res) => {
  try {
    if (!req.body.action_id) return res.status(400).send({ ok: false, code: ERROR_CODES.INVALID_BODY });
    const action = await Action.findById(req.body.action_id);
    if (!action) return res.status(404).send({ ok: false, code: ERROR_CODES.NOT_FOUND });

    const query = { action_id: action._id, indicator_excel_id: { $nin: HIDDEN_IDS } };
    if (req.body.situation) query.situation = req.body.situation;
    if (req.body.year) query.year = req.body.year;

    const indicatorValues = await IndicatorValue.find(query);
    // Build conditionValuesMap and yearMappings to filter by display_condition
    const condExcelIds = new Set();
    for (const iv of indicatorValues) {
      if (iv.display_condition?.conditions) {
        for (const cond of iv.display_condition.conditions) {
          if (cond.excel_indicator_id) condExcelIds.add(cond.excel_indicator_id);
        }
      }
    }

    const ownerFilter = { owner: action.owner };
    if (action.owner === 'economic_actor' && action.economic_actor_id) ownerFilter.economic_actor_id = action.economic_actor_id;

    const [regularActions, condValues, indicators] = await Promise.all([
      Action.find({ collectivity_id: action.collectivity_id, type: { $ne: 'config' }, ...ownerFilter }),
      condExcelIds.size > 0 ? IndicatorValue.find({ collectivity_id: action.collectivity_id, indicator_excel_id: { $in: [...condExcelIds] }, ...ownerFilter }) : Promise.resolve([]),
      Indicator.find({ _id: { $in: [...new Set(indicatorValues.map((iv) => iv.indicator_id))] } }),
    ]);

    const conditionValuesMap = new Map();
    for (const cv of condValues) conditionValuesMap.set(`${cv.indicator_excel_id}_${cv.situation}_${cv.year}`, cv);
    const yearMappingsBySituationYear = buildYearMappings(regularActions);
    const indicatorMap = new Map(indicators.map((ind) => [ind._id.toString(), ind]));
    const workbook = new ExcelJS.Workbook();

    const allSituations = [
      { key: 'init', label: 'Remplissage - Sit. Init.' },
      { key: 'ref', label: 'Remplissage - Sit. Ref.' },
      { key: 'prev', label: 'Remplissage - Sit. Prev.' },
      { key: 'expost', label: 'Remplissage - Sit. Expost' },
    ];

    const situations = req.body.situation ? allSituations.filter((s) => s.key === req.body.situation) : allSituations;

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
        if (!shouldDisplayIndicator(indicatorValue, yearMappingsBySituationYear[`${indicatorValue.situation}_${indicatorValue.year}`], conditionValuesMap)) continue;

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
    const { fileBase64, collectivity, action_id } = req.body;
    if (!fileBase64) return res.status(400).json({ ok: false, data: { error: 'fileBase64 is required' } });
    if (!collectivity) return res.status(400).json({ ok: false, data: { error: 'collectivity is required' } });
    if (!action_id) return res.status(400).json({ ok: false, data: { error: 'action_id is required' } });

    const action = await Action.findById(action_id);
    if (!action) return res.status(404).json({ ok: false, data: { error: 'Action not found' } });

    const fileBuffer = Buffer.from(fileBase64, 'base64');

    // Extract data directly from the uploaded Excel file for DB updates
    const importedWorkbook = new ExcelJS.Workbook();
    await importedWorkbook.xlsx.load(fileBuffer);

    const sheetsToProcess = req.body.situation ? SITUATION_SHEETS.filter((s) => s.situation === req.body.situation) : SITUATION_SHEETS;

    const extractedData = [];
    for (const { sheetName, situation } of sheetsToProcess) {
      const sheet = importedWorkbook.getWorksheet(sheetName);
      if (!sheet) continue;
      sheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;
        const excelIndicatorId = row.getCell(5).value;
        const value = row.getCell(6).value;
        if (excelIndicatorId) {
          extractedData.push({ excel_indicator_id: String(excelIndicatorId).trim(), value: value ?? '', situation });
        }
      });
    }

    // Sync to SharePoint Excel files if any exist
    const excelFileIds = [];
    for (const excelFile of action.exel_files_prev || []) {
      if (excelFile.excel_file_id) excelFileIds.push(excelFile.excel_file_id);
    }
    if (action.type === 'config') {
      const actionsWithSameYearInit = await Action.find({
        collectivity_id: action.collectivity_id,
        year_init: action.year_init,
        _id: { $ne: action._id },
        'exel_files_prev.0.excel_file_id': { $exists: true },
      });
      for (const targetAction of actionsWithSameYearInit) {
        for (const excelFile of targetAction.exel_files_prev || []) {
          if (excelFile.excel_file_id) excelFileIds.push(excelFile.excel_file_id);
        }
      }
    }
    if (excelFileIds.length > 0) {
      await Promise.all(excelFileIds.map((fileId) => importSheetsToExcelFile(fileId, fileBuffer, sheetsToProcess).catch(capture)));
    }

    if (!extractedData.length) return res.status(200).json({ ok: true });
    const indicators = await Indicator.find({ excel_indicator_id: { $in: [...new Set(extractedData.map((d) => d.excel_indicator_id))] } });
    const indicatorMap = new Map(indicators.map((ind) => [ind.excel_indicator_id, ind]));

    const ivQuery = {
      indicator_id: { $in: indicators.map((ind) => ind._id.toString()) },
      collectivity_id: collectivity._id,
      situation: { $in: [...new Set(extractedData.map((d) => d.situation))] },
    };
    if (req.body.year) ivQuery.year = req.body.year;
    const indicatorValues = await IndicatorValue.find(ivQuery);

    const indicatorValueMap = new Map();
    for (const iv of indicatorValues) {
      const key = `${iv.indicator_id}_${iv.situation}`;
      if (!indicatorValueMap.has(key)) indicatorValueMap.set(key, []);
      indicatorValueMap.get(key).push(iv);
    }

    const bulkOps = [];
    const logs = [];
    const updatedValues = [];

    for (const data of extractedData) {
      const indicator = indicatorMap.get(data.excel_indicator_id);
      if (!indicator) continue;

      const matchingValues = indicatorValueMap.get(`${indicator._id.toString()}_${data.situation}`) || [];
      if (!matchingValues.length) continue;

      const indicatorType = matchingValues[0].indicator_type;
      let convertedValue = data.value;
      if (indicatorType === 'number') {
        convertedValue = isNaN(parseFloat(convertedValue)) ? null : parseFloat(convertedValue);
        if (indicator.value_unit === '%' && convertedValue != null) convertedValue = convertedValue * 100;
      }
      if (indicatorType === 'checkbox') {
        const strValue = convertedValue != null ? String(convertedValue) : '';
        convertedValue = strValue
          .split(/[,;.]/)
          .map((v) => v.trim())
          .filter((v) => v);
      }
      if (indicatorType === 'radio' || indicatorType === 'text') convertedValue = convertedValue != null ? String(convertedValue).trim() : '';

      for (const indicatorValue of matchingValues) {
        const oldValue = indicatorValue.value?.[indicatorValue.indicator_type];
        const isOldEmpty = oldValue == null || oldValue === '' || (Array.isArray(oldValue) && oldValue.length === 0);
        const isNewEmpty = convertedValue == null || convertedValue === '' || (Array.isArray(convertedValue) && convertedValue.length === 0);
        if (isOldEmpty && isNewEmpty) continue;
        if (JSON.stringify(oldValue) === JSON.stringify(convertedValue)) continue;
        logs.push(
          new Log({
            model_name: 'indicator_value',
            name: indicator.name,
            field: 'value',
            operation: 'update',
            new_value: { [Array.isArray(convertedValue) ? 'array' : typeof convertedValue]: convertedValue },
            previous_value: { [Array.isArray(oldValue) ? 'array' : typeof oldValue]: oldValue },
            type_value: Array.isArray(convertedValue) ? 'array' : typeof convertedValue,
            date: new Date(),
            source: 'import_excel',
            user_id: req.user._id,
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
          }),
        );
        bulkOps.push({ updateOne: { filter: { _id: indicatorValue._id }, update: { $set: { [`value.${indicatorValue.indicator_type}`]: convertedValue, value_source: 'import_excel' } } } });
        updatedValues.push({ indicatorValue, indicator, newTypedValue: convertedValue });
      }
    }

    if (bulkOps.length > 0) await IndicatorValue.bulkWrite(bulkOps);
    if (logs.length > 0) await Log.insertMany(logs);

    if (bulkOps.length > 0) {
      // Update action last modification metadata (like PUT)
      action.last_modif_by_id = req.user._id;
      action.last_modif_by_name = req.user.name;
      action.last_modif_by_email = req.user.email;
      action.last_modif_date = new Date();
      await action.save();

      await computeActionCompletion(action_id, { situation: req.body.situation, year: req.body.year });

      // Cross-action sync: propagate updated values to other indicator values sharing same indicator_id/situation/year/owner (like PUT)
      const syncLogs = [];
      const excelUpdatePromises = [];
      const ownerFilter = { owner: action.owner, ...(action.owner === 'economic_actor' ? { economic_actor_id: action.economic_actor_id } : {}) };
      const collectivityFilter = action.owner === 'economic_actor' ? {} : { collectivity_id: action.collectivity_id };

      for (const { indicatorValue, indicator, newTypedValue } of updatedValues) {
        if (!(indicatorValue.indicator_id && indicatorValue.situation && indicatorValue.year && indicatorValue.collectivity_id)) continue;

        const newFullValue = { ...(indicatorValue.value?.toObject?.() || indicatorValue.value || {}), [indicatorValue.indicator_type]: newTypedValue };

        // Sync to other indicator values with same indicator/situation/year
        const syncQuery = { indicator_id: indicatorValue.indicator_id, situation: indicatorValue.situation, year: indicatorValue.year, source_type: indicatorValue.source_type, owner: indicatorValue.owner, _id: { $ne: indicatorValue._id } };
        // For non-config actions, scope sync to the same action only (each instance has independent values)
        if (action.type !== 'config') {
          syncQuery.action_id = indicatorValue.action_id;
        }
        if (indicatorValue.owner === 'economic_actor' && indicatorValue.economic_actor_id) {
          syncQuery.economic_actor_id = indicatorValue.economic_actor_id;
        } else {
          syncQuery.collectivity_id = indicatorValue.collectivity_id;
        }
        const otherIVs = await IndicatorValue.find(syncQuery);

        for (const otherIV of otherIVs) {
          if (JSON.stringify(otherIV.value) === JSON.stringify(newFullValue)) continue;

          const actualOldValue = otherIV.value?.[indicatorValue.indicator_type];
          let logType = typeof newTypedValue;
          if (newTypedValue instanceof Date) logType = 'date';
          if (Array.isArray(newTypedValue)) logType = 'array';

          syncLogs.push({
            model_name: 'indicator_value',
            name: otherIV.name,
            field: 'value',
            operation: 'update',
            new_value: { [logType]: newTypedValue },
            previous_value: { [logType]: actualOldValue },
            type_value: logType,
            date: new Date(),
            source: 'synchronization',
            user_id: req.user._id,
            user_name: req.user.name,
            user_email: req.user.email,
            collectivity_id: otherIV.collectivity_id,
            collectivity_name: otherIV.collectivity_name,
            action_id: otherIV.action_id,
            action_name: otherIV.action_name,
            indicator_id: otherIV.indicator_id,
            indicator_name: otherIV.indicator_name,
            indicator_value_id: otherIV._id,
            indicator_value_name: otherIV.name,
          });
        }

        const updateQuery = { indicator_id: indicatorValue.indicator_id, situation: indicatorValue.situation, year: indicatorValue.year, owner: indicatorValue.owner };
        // For non-config actions, scope sync to the same action only
        if (action.type !== 'config') {
          updateQuery.action_id = indicatorValue.action_id;
        }
        if (indicatorValue.owner === 'economic_actor' && indicatorValue.economic_actor_id) {
          updateQuery.economic_actor_id = indicatorValue.economic_actor_id;
        } else {
          updateQuery.collectivity_id = indicatorValue.collectivity_id;
        }
        await IndicatorValue.updateMany(updateQuery, { $set: { value: newFullValue } });

        // Excel cell updates for synced actions (like PUT)
        if (action.type === 'config') {
          let actionsWithSameYear = [];
          if (indicatorValue.situation === 'ref') actionsWithSameYear = await Action.find({ ...collectivityFilter, $or: [{ 'exel_files_prev.year_ref': indicatorValue.year }, { 'excel_files_expost.year_ref': indicatorValue.year }], type: { $ne: 'config' }, ...ownerFilter });
          if (indicatorValue.situation === 'prev') actionsWithSameYear = await Action.find({ ...collectivityFilter, 'exel_files_prev.year_prev': indicatorValue.year, type: { $ne: 'config' }, ...ownerFilter });
          if (indicatorValue.situation === 'expost') actionsWithSameYear = await Action.find({ ...collectivityFilter, 'excel_files_expost.year_expost': indicatorValue.year, type: { $ne: 'config' }, ...ownerFilter });
          if (indicatorValue.situation === 'init') actionsWithSameYear = await Action.find({ ...collectivityFilter, year_init: indicatorValue.year, type: { $ne: 'config' }, 'exel_files_prev.0.excel_file_id': { $exists: true }, ...ownerFilter });

          for (const targetAction of actionsWithSameYear) {
            if (indicatorValue.situation === 'prev') {
              for (const excelFile of targetAction.exel_files_prev || []) {
                if (excelFile.excel_file_id && excelFile.year_prev === indicatorValue.year) excelUpdatePromises.push(updateExcelCellByIndicatorId(excelFile.excel_file_id, indicator.excel_indicator_id, newTypedValue, indicatorValue.situation, indicator.value_unit).catch(capture));
              }
            }
            if (indicatorValue.situation === 'ref') {
              for (const excelFile of targetAction.exel_files_prev || []) {
                if (excelFile.excel_file_id && excelFile.year_ref === indicatorValue.year) excelUpdatePromises.push(updateExcelCellByIndicatorId(excelFile.excel_file_id, indicator.excel_indicator_id, newTypedValue, indicatorValue.situation, indicator.value_unit).catch(capture));
              }
              for (const excelFile of targetAction.excel_files_expost || []) {
                if (excelFile.excel_file_id && excelFile.year_ref === indicatorValue.year) excelUpdatePromises.push(updateExcelCellByIndicatorId(excelFile.excel_file_id, indicator.excel_indicator_id, newTypedValue, indicatorValue.situation, indicator.value_unit).catch(capture));
              }
            }
            if (indicatorValue.situation === 'expost') {
              for (const excelFile of targetAction.excel_files_expost || []) {
                if (excelFile.excel_file_id && excelFile.year_expost === indicatorValue.year) excelUpdatePromises.push(updateExcelCellByIndicatorId(excelFile.excel_file_id, indicator.excel_indicator_id, newTypedValue, indicatorValue.situation, indicator.value_unit).catch(capture));
              }
            }
            if (indicatorValue.situation === 'init') {
              for (const excelFile of targetAction.exel_files_prev || []) {
                if (excelFile.excel_file_id) excelUpdatePromises.push(updateExcelCellByIndicatorId(excelFile.excel_file_id, indicator.excel_indicator_id, newTypedValue, indicatorValue.situation, indicator.value_unit).catch(capture));
              }
              for (const excelFile of targetAction.excel_files_expost || []) {
                if (excelFile.excel_file_id) excelUpdatePromises.push(updateExcelCellByIndicatorId(excelFile.excel_file_id, indicator.excel_indicator_id, newTypedValue, indicatorValue.situation, indicator.value_unit).catch(capture));
              }
            }
          }
        }
      }

      await Promise.all(excelUpdatePromises);
      if (syncLogs.length > 0) await Log.insertMany(syncLogs);

      await updateOnboardingStatus(action);
    }

    res.status(200).json({ ok: true });
  } catch (error) {
    capture(error);
    res.status(500).json({ ok: false, data: { error: error.message } });
  }
});

module.exports = router;
