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
const { updateExcelCellByIndicatorId, importSheetsToExcelFile } = require('../services/microsoftGraph');
const Collectivity = require('../models/collectivity');
const EconomicActor = require('../models/economic_actor');
const { isIndicatorValueFilled, computeActionCompletion } = require('../utils/completion');
const SITUATION_SHEETS = [
  { sheetName: 'Remplissage - Sit. Init.', situation: 'init' },
  { sheetName: 'Remplissage - Sit. Ref.', situation: 'ref' },
  { sheetName: 'Remplissage - Sit. Prev.', situation: 'prev' },
  { sheetName: 'Remplissage - Sit. Expost', situation: 'expost' },
];

const HIDDEN_IDS = ['AnneeRempl', 'AnRef', 'ActionsAutres', 'ActionsCharte'];

const buildYearMappings = (regularActions) => {
  const mappings = {};
  const ensure = (k) => {
    if (!mappings[k]) mappings[k] = { year_init: new Set(), year_ref: new Set(), year_prev: new Set(), year_expost: new Set() };
  };
  for (const a of regularActions) {
    if (a.year_init != null) {
      ensure(`init_${a.year_init}`);
      mappings[`init_${a.year_init}`].year_init.add(a.year_init);
    }
    for (const f of a.exel_files_prev || []) {
      if (f.year_prev != null) {
        ensure(`prev_${f.year_prev}`);
        if (a.year_init != null) mappings[`prev_${f.year_prev}`].year_init.add(a.year_init);
        if (f.year_ref != null) mappings[`prev_${f.year_prev}`].year_ref.add(f.year_ref);
        mappings[`prev_${f.year_prev}`].year_prev.add(f.year_prev);
      }
      if (f.year_ref != null) {
        ensure(`ref_${f.year_ref}`);
        if (a.year_init != null) mappings[`ref_${f.year_ref}`].year_init.add(a.year_init);
        mappings[`ref_${f.year_ref}`].year_ref.add(f.year_ref);
      }
    }
    for (const f of a.excel_files_expost || []) {
      if (f.year_expost != null) {
        ensure(`expost_${f.year_expost}`);
        if (a.year_init != null) mappings[`expost_${f.year_expost}`].year_init.add(a.year_init);
        if (f.year_ref != null) mappings[`expost_${f.year_expost}`].year_ref.add(f.year_ref);
        mappings[`expost_${f.year_expost}`].year_expost.add(f.year_expost);
      }
      if (f.year_ref != null) {
        ensure(`ref_${f.year_ref}`);
        if (a.year_init != null) mappings[`ref_${f.year_ref}`].year_init.add(a.year_init);
        mappings[`ref_${f.year_ref}`].year_ref.add(f.year_ref);
      }
    }
  }
  for (const k in mappings) {
    const m = mappings[k];
    mappings[k] = { year_init: [...m.year_init], year_ref: [...m.year_ref], year_prev: [...m.year_prev], year_expost: [...m.year_expost] };
  }
  return mappings;
};

const shouldDisplayIndicator = (iv, yearMappings, conditionValuesMap, visited = new Set()) => {
  if (!iv.display_condition?.conditions?.length) return true;
  const ivKey = `${iv.indicator_excel_id}_${iv.situation}_${iv.year}`;
  if (visited.has(ivKey)) return false;
  visited.add(ivKey);
  const results = iv.display_condition.conditions.map((cond) => {
    const targetSituation = cond.excel_indicator_situation || iv.situation;
    const possibleYears = yearMappings?.[`year_${targetSituation}`] || [];
    return possibleYears.some((year) => {
      const source = conditionValuesMap.get(`${cond.excel_indicator_id}_${targetSituation}_${year}`);
      if (!source) return false;
      if (source.display_condition?.conditions?.length && !shouldDisplayIndicator(source, yearMappings, conditionValuesMap, new Set(visited))) return false;
      const val = source.value?.[source.indicator_type];
      let isMatch = false;
      if (cond.type === 'equals') {
        isMatch = val == cond.value;
        if (Array.isArray(val) && Array.isArray(cond.value)) isMatch = JSON.stringify([...val].sort()) === JSON.stringify([...cond.value].sort());
      }
      if (cond.type === 'contains') {
        if (Array.isArray(val)) isMatch = val.includes(cond.value);
        else if (typeof val === 'string') isMatch = val.includes(cond.value);
      }
      if (cond.type === 'greaterThan') isMatch = Number(val) > Number(cond.value);
      if (cond.type === 'lessThan') isMatch = Number(val) < Number(cond.value);
      if (cond.type === 'greaterOrEqual') isMatch = Number(val) >= Number(cond.value);
      if (cond.type === 'lessOrEqual') isMatch = Number(val) <= Number(cond.value);
      if (cond.type === 'notEmpty') isMatch = val !== null && val !== undefined && val !== '' && (!Array.isArray(val) || val.length > 0);
      if (cond.type === 'isEmpty') isMatch = val === null || val === undefined || val === '' || (Array.isArray(val) && val.length === 0);
      if (cond.negate) isMatch = !isMatch;
      return isMatch;
    });
  });
  return iv.display_condition.operator === 'OR' ? results.some((r) => r) : results.every((r) => r);
};

const updateOnboardingStatus = async (action) => {
  if (action.type !== 'config' || (action.name !== 'Données de base' && action.name !== 'Parc types')) return;
  try {
    const ownerFilter = { owner: action.owner };
    if (action.owner === 'economic_actor' && action.economic_actor_id) ownerFilter.economic_actor_id = action.economic_actor_id;

    const allIVs = await IndicatorValue.find({ action_id: action._id, indicator_excel_id: { $nin: HIDDEN_IDS }, ...ownerFilter });

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
      const { situation, year } = iv;
      if (!situationYears[situation]) situationYears[situation] = [];
      if (year != null && !situationYears[situation].includes(year)) situationYears[situation].push(year);
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
        if (a.year_init != null) (actionsBySituationYear[`init_${a.year_init}`] ||= []).push(a.name);
        const refYears = new Set();
        for (const f of a.exel_files_prev || []) if (f.year_ref != null) refYears.add(f.year_ref);
        for (const f of a.excel_files_expost || []) if (f.year_ref != null) refYears.add(f.year_ref);
        for (const y of refYears) (actionsBySituationYear[`ref_${y}`] ||= []).push(a.name);
        for (const f of a.exel_files_prev || []) if (f.year_prev != null) (actionsBySituationYear[`prev_${f.year_prev}`] ||= []).push(a.name);
        for (const f of a.excel_files_expost || []) if (f.year_expost != null) (actionsBySituationYear[`expost_${f.year_expost}`] ||= []).push(a.name);
      }
      yearMappingsBySituationYear = buildYearMappings(regularActions);
    }

    // Compute completion stats, excluding indicators hidden by display conditions
    const completion = {};
    let totalAll = 0;
    let filledAll = 0;

    for (const iv of indicatorValues) {
      const key = `${iv.situation}_${iv.year}`;
      const yearMappings = yearMappingsBySituationYear[key];
      if (!shouldDisplayIndicator(iv, yearMappings, conditionValuesMap)) continue;

      if (!completion[key]) completion[key] = { total: 0, filled: 0 };
      completion[key].total++;
      totalAll++;

      if (isIndicatorValueFilled(iv)) {
        completion[key].filled++;
        filledAll++;
      }
    }

    return res.status(200).send({ ok: true, data: { situationYears, completion, totalAll, filledAll, actionsBySituationYear, yearMappingsBySituationYear } });
  } catch (error) {
    capture(error);
    return res.status(500).send({ ok: false, code: ERROR_CODES.SERVER_ERROR });
  }
});

// Check general data completion for all config actions of a collectivity, grouped by related action
router.post('/check-general-data-completion', passport.authenticate(['admin', 'user'], { session: false, failWithError: true }), async (req, res) => {
  try {
    const { collectivity_id } = req.body;
    if (!collectivity_id) return res.status(400).send({ ok: false, code: ERROR_CODES.INVALID_BODY });

    const [configActions, regularActions] = await Promise.all([
      Action.find({ collectivity_id, type: 'config', owner: 'collectivity' }),
      Action.find({ collectivity_id, type: { $ne: 'config' }, owner: 'collectivity' }),
    ]);

    if (configActions.length === 0) return res.status(200).send({ ok: true, data: [] });

    const configActionIds = configActions.map((a) => a._id.toString());
    const indicatorValues = await IndicatorValue.find({ action_id: { $in: configActionIds }, indicator_excel_id: { $nin: HIDDEN_IDS } });

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
      const condValues = await IndicatorValue.find({ collectivity_id, indicator_excel_id: { $in: [...condExcelIds] }, owner: 'collectivity' });
      for (const cv of condValues) conditionValuesMap.set(`${cv.indicator_excel_id}_${cv.situation}_${cv.year}`, cv);
    }

    // Group by configAction name + situation + year, compute completion (only for displayed indicators)
    const groups = {};
    for (const iv of indicatorValues) {
      const situationYearKey = `${iv.situation}_${iv.year}`;
      const yearMappings = yearMappingsBySituationYear[situationYearKey];
      if (!shouldDisplayIndicator(iv, yearMappings, conditionValuesMap)) continue;

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
      const actions = situationYearActions[`${group.situation}_${group.year}`] || [];
      const item = { configActionName: group.configActionName, situation: group.situation, year: group.year, completion: group.total > 0 ? Math.round((group.filled / group.total) * 100) : 0 };
      for (const actionName of actions) (groupedMap[actionName] ||= []).push(item);
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

    const data = await IndicatorValue.find(query).lean();
    return res.status(200).send({ ok: true, data });
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

    res.status(200).send({ ok: true, data: indicatorValue });
    const excelUpdatePromises = [];

    if (action.type === 'config') {
      let actionsWithSameYear = [];
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
              excelUpdatePromises.push(updateExcelCellByIndicatorId(excelFile.excel_file_id, indicator.excel_indicator_id, req.body.value[indicatorValue.indicator_type], indicatorValue.situation).catch(capture));
          }
        }
        if (indicatorValue.situation === 'ref') {
          for (const excelFile of targetAction.exel_files_prev || []) {
            if (excelFile.excel_file_id && excelFile.year_ref === indicatorValue.year)
              excelUpdatePromises.push(updateExcelCellByIndicatorId(excelFile.excel_file_id, indicator.excel_indicator_id, req.body.value[indicatorValue.indicator_type], indicatorValue.situation).catch(capture));
          }
          for (const excelFile of targetAction.excel_files_expost || []) {
            if (excelFile.excel_file_id && excelFile.year_ref === indicatorValue.year)
              excelUpdatePromises.push(updateExcelCellByIndicatorId(excelFile.excel_file_id, indicator.excel_indicator_id, req.body.value[indicatorValue.indicator_type], indicatorValue.situation).catch(capture));
          }
        }
        if (indicatorValue.situation === 'expost') {
          for (const excelFile of targetAction.excel_files_expost || []) {
            if (excelFile.excel_file_id && excelFile.year_expost === indicatorValue.year)
              excelUpdatePromises.push(updateExcelCellByIndicatorId(excelFile.excel_file_id, indicator.excel_indicator_id, req.body.value[indicatorValue.indicator_type], indicatorValue.situation).catch(capture));
          }
        }
        if (indicatorValue.situation === 'init') {
          // init : mettre à jour tous les fichiers
          for (const excelFile of targetAction.exel_files_prev || []) {
            if (excelFile.excel_file_id) excelUpdatePromises.push(updateExcelCellByIndicatorId(excelFile.excel_file_id, indicator.excel_indicator_id, req.body.value[indicatorValue.indicator_type], indicatorValue.situation).catch(capture));
          }
          for (const excelFile of targetAction.excel_files_expost || []) {
            if (excelFile.excel_file_id) excelUpdatePromises.push(updateExcelCellByIndicatorId(excelFile.excel_file_id, indicator.excel_indicator_id, req.body.value[indicatorValue.indicator_type], indicatorValue.situation).catch(capture));
          }
        }
      }
    }
    if (action.type !== 'config') {
      // Pour les acteurs économiques, propager aussi aux actions similaires dans les autres collectivités
      let actionsToUpdate = [action];
      if (action.owner === 'economic_actor' && action.economic_actor_id) {
        const siblingActions = await Action.find({ owner: 'economic_actor', economic_actor_id: action.economic_actor_id, collectivity_id: { $ne: action.collectivity_id }, action_parent_id: action.action_parent_id });
        actionsToUpdate = [action, ...siblingActions];
      }

      for (const currentAction of actionsToUpdate) {
        if (indicatorValue.situation === 'init') {
          // Situation init : mettre à jour tous les exel_files_prev (le fichier initial contient toutes les situations)
          const AllExcelFiles = [...(currentAction.exel_files_prev || []), ...(currentAction.excel_files_expost || [])];
          for (const excelFile of AllExcelFiles) {
            excelUpdatePromises.push(updateExcelCellByIndicatorId(excelFile.excel_file_id, indicator.excel_indicator_id, req.body.value[indicatorValue.indicator_type], indicatorValue.situation).catch(capture));
          }
        }
        if (indicatorValue.situation === 'prev') {
          // Situation prev : mettre à jour le fichier exel_files_prev correspondant à l'année prev
          for (const excelFile of currentAction.exel_files_prev || []) {
            if (excelFile.year_prev !== indicatorValue.year) continue;
            excelUpdatePromises.push(updateExcelCellByIndicatorId(excelFile.excel_file_id, indicator.excel_indicator_id, req.body.value[indicatorValue.indicator_type], indicatorValue.situation).catch(capture));
          }
        }
        if (indicatorValue.situation === 'ref') {
          // Situation ref : mettre à jour tous les fichiers dont year_ref === indicatorValue.year
          for (const excelFile of currentAction.exel_files_prev || []) {
            if (excelFile.year_ref !== indicatorValue.year) continue;
            excelUpdatePromises.push(updateExcelCellByIndicatorId(excelFile.excel_file_id, indicator.excel_indicator_id, req.body.value[indicatorValue.indicator_type], indicatorValue.situation).catch(capture));
          }
          for (const excelFile of currentAction.excel_files_expost || []) {
            if (excelFile.year_ref !== indicatorValue.year) continue;
            excelUpdatePromises.push(updateExcelCellByIndicatorId(excelFile.excel_file_id, indicator.excel_indicator_id, req.body.value[indicatorValue.indicator_type], indicatorValue.situation).catch(capture));
          }
        }
        if (indicatorValue.situation === 'expost') {
          // Si c'est l'année expost principale → mettre à jour tous les exel_files_prev (le fichier initial contient toutes les situations)
          if (indicatorValue.year === currentAction.year_expost) {
            for (const excelFile of currentAction.exel_files_prev || []) {
              excelUpdatePromises.push(updateExcelCellByIndicatorId(excelFile.excel_file_id, indicator.excel_indicator_id, req.body.value[indicatorValue.indicator_type], indicatorValue.situation).catch(capture));
            }
          }
          // Mettre à jour le bon fichier excel_files_expost correspondant à l'année
          for (const excelFile of currentAction.excel_files_expost || []) {
            if (excelFile.year_expost !== indicatorValue.year) continue;
            excelUpdatePromises.push(updateExcelCellByIndicatorId(excelFile.excel_file_id, indicator.excel_indicator_id, req.body.value[indicatorValue.indicator_type], indicatorValue.situation).catch(capture));
          }
        }
      }
    }

    await Promise.all(excelUpdatePromises);

    if (logs.length > 0) await Log.insertMany(logs);

    if (!(indicatorValue.indicator_id && indicatorValue.situation && indicatorValue.year && indicatorValue.collectivity_id)) return;
    const payload = { indicator_id: indicatorValue.indicator_id, situation: indicatorValue.situation, year: indicatorValue.year, source_type: indicatorValue.source_type, owner: indicatorValue.owner, _id: { $ne: indicatorValue._id } };

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
    if (indicatorValue.owner === 'economic_actor' && indicatorValue.economic_actor_id) {
      updateQuery.economic_actor_id = indicatorValue.economic_actor_id;
    } else {
      updateQuery.collectivity_id = indicatorValue.collectivity_id;
    }
    await IndicatorValue.updateMany(updateQuery, { $set: { value: indicatorValue.value } });

    if (syncLogs.length > 0) await Log.insertMany(syncLogs);
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
        { indicator_type: 'checkbox', 'value.checkbox': { $size: 0 } },
      ];
    }

    const limit = req.body.limit || 50;
    const skip = req.body.offset || 0;

    const data = await IndicatorValue.find(query).sort({ excel_line_number: 1 }).skip(skip).limit(limit);
    const total = await IndicatorValue.countDocuments(query);

    return res.status(200).send({ ok: true, data, total });
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
    const indicatorValues = await IndicatorValue.find({ action_id: action._id, indicator_excel_id: { $nin: HIDDEN_IDS } });
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
        const yearMappings = yearMappingsBySituationYear[`${indicatorValue.situation}_${indicatorValue.year}`];
        if (!shouldDisplayIndicator(indicatorValue, yearMappings, conditionValuesMap)) continue;

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

    const extractedData = [];
    for (const { sheetName, situation } of SITUATION_SHEETS) {
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
      await Promise.all(excelFileIds.map((fileId) => importSheetsToExcelFile(fileId, fileBuffer, SITUATION_SHEETS).catch(capture)));
    }

    if (!extractedData.length) return res.status(200).json({ ok: true });
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
    const updatedValues = [];

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
        bulkOps.push({ updateOne: { filter: { _id: indicatorValue._id }, update: { $set: { [`value.${indicatorValue.indicator_type}`]: data.value, value_source: 'import_excel' } } } });
        updatedValues.push({ indicatorValue, indicator, newTypedValue: data.value });
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

      await computeActionCompletion(action_id);

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
                if (excelFile.excel_file_id && excelFile.year_prev === indicatorValue.year)
                  excelUpdatePromises.push(updateExcelCellByIndicatorId(excelFile.excel_file_id, indicator.excel_indicator_id, newTypedValue, indicatorValue.situation).catch(capture));
              }
            }
            if (indicatorValue.situation === 'ref') {
              for (const excelFile of targetAction.exel_files_prev || []) {
                if (excelFile.excel_file_id && excelFile.year_ref === indicatorValue.year)
                  excelUpdatePromises.push(updateExcelCellByIndicatorId(excelFile.excel_file_id, indicator.excel_indicator_id, newTypedValue, indicatorValue.situation).catch(capture));
              }
              for (const excelFile of targetAction.excel_files_expost || []) {
                if (excelFile.excel_file_id && excelFile.year_ref === indicatorValue.year)
                  excelUpdatePromises.push(updateExcelCellByIndicatorId(excelFile.excel_file_id, indicator.excel_indicator_id, newTypedValue, indicatorValue.situation).catch(capture));
              }
            }
            if (indicatorValue.situation === 'expost') {
              for (const excelFile of targetAction.excel_files_expost || []) {
                if (excelFile.excel_file_id && excelFile.year_expost === indicatorValue.year)
                  excelUpdatePromises.push(updateExcelCellByIndicatorId(excelFile.excel_file_id, indicator.excel_indicator_id, newTypedValue, indicatorValue.situation).catch(capture));
              }
            }
            if (indicatorValue.situation === 'init') {
              for (const excelFile of targetAction.exel_files_prev || []) {
                if (excelFile.excel_file_id) excelUpdatePromises.push(updateExcelCellByIndicatorId(excelFile.excel_file_id, indicator.excel_indicator_id, newTypedValue, indicatorValue.situation).catch(capture));
              }
              for (const excelFile of targetAction.excel_files_expost || []) {
                if (excelFile.excel_file_id) excelUpdatePromises.push(updateExcelCellByIndicatorId(excelFile.excel_file_id, indicator.excel_indicator_id, newTypedValue, indicatorValue.situation).catch(capture));
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
