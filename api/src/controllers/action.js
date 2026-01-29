const express = require('express');
const router = express.Router();
const passport = require('passport');
const Action = require('../models/action');
const IndicatorValue = require('../models/indicator_value');
const ERROR_CODES = require('../utils/errorCodes');
const { capture } = require('../services/sentry');
const Log = require('../models/log');
const Indicator = require('../models/indicator');
const Collectivity = require('../models/collectivity');
const { updateExcelCellByIndicatorId, updateExcelCellsBatch, duplicateExcelFile } = require('../services/microsoftGraph');

const GLOBAL_INDICATOR_CATEGORIES = ['Fret routier','Données de base',"Données de production/consommation d'énergie",'Fret fluvial','Fret ferroviaire','Cyclologistique','Déplacements de particuliers'];

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

    // Seul admin@selego.co peut voir les actions des 2 collectivités spécifiques
    const restrictedCollectivities = ['69774615a3bd9ea14ad392e1', '697746c2a3bd9ea14ad3dd20'];
    if (req.user.email !== 'admin@selego.co') {
      if (req.body.collectivity_id && restrictedCollectivities.includes(req.body.collectivity_id)) {
        return res.status(403).send({ ok: false, code: ERROR_CODES.FORBIDDEN });
      }
      if (!req.body.collectivity_id) query.collectivity_id = { $nin: restrictedCollectivities };
    }

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
    if (!req.body.year_init) return res.status(400).send({ ok: false, code: ERROR_CODES.INVALID_BODY });
    if (!req.body.year_ref) return res.status(400).send({ ok: false, code: ERROR_CODES.INVALID_BODY });
    if (!req.body.year_prev) return res.status(400).send({ ok: false, code: ERROR_CODES.INVALID_BODY });
    if (!req.body.year_expost) return res.status(400).send({ ok: false, code: ERROR_CODES.INVALID_BODY });

    const parentAction = await Action.findById(req.body.action_parent_id);
    if (!parentAction) return res.status(404).send({ ok: false, code: ERROR_CODES.NOT_FOUND });

    const collectivity = await Collectivity.findById(req.body.collectivity_id);
    if (!collectivity) return res.status(404).send({ ok: false, code: ERROR_CODES.NOT_FOUND });

    // Vérifier si une action avec la même année init existe déjà
    const existingActionSameYear = await Action.findOne({ collectivity_id: collectivity._id, year_init: req.body.year_init, 'excel_files.0.excel_file_id': { $exists: true } });

    // Créer l'Excel : dupliquer depuis une action existante ou depuis le master template
    const sourceExcelId = existingActionSameYear?.excel_files?.[0]?.excel_file_id || null;
    const excelFileId = await duplicateExcelFile(`${req.body.name}_Prev${req.body.year_prev}.xlsx`,collectivity.sharepoint_folder_id,sourceExcelId);

    // Créer l'action
    const action = await Action.create({
      ...req.body,
      excel_worksheetname: parentAction.excel_worksheetname,
      excel_files: [{ year_prev: req.body.year_prev, excel_file_id: excelFileId }],
      last_modif_by_id: req.user._id,
      last_modif_by_name: req.user.name,
      last_modif_by_email: req.user.email,
      last_modif_date: new Date(),
    });
    if (!action) return res.status(400).send({ ok: false, code: ERROR_CODES.INVALID_BODY });

    // Vérifier si les actions config existent déjà pour cette année init
    const configActionExists = await Action.findOne({collectivity_id: collectivity._id,type: 'config',year_init: req.body.year_init});

    if (!configActionExists) {
      const configActions = [];

      // Action base_data
      const actionBasicData = await Action.create({name: `Données de base - ${req.body.year_init}`,type: 'config',collectivity_id: collectivity._id,collectivity_name: collectivity.name,owner: 'collectivity',status: 'no_status',year_init: req.body.year_init});
      configActions.push({ action: actionBasicData, category: 'Données de base' });

      // Action parc_type
      const actionParcTypes = await Action.create({name: `Parc types - ${req.body.year_init}`,type: 'config',collectivity_id: collectivity._id,collectivity_name: collectivity.name,owner: 'collectivity',status: 'no_status',year_init: req.body.year_init});
      configActions.push({ action: actionParcTypes, category: 'Parc types' });

      // Créer les indicator values pour les actions config
      const indicators = await Indicator.find({ indicator_category_name: { $in: GLOBAL_INDICATOR_CATEGORIES } });
      const allSituations = ['init', 'ref', 'prev', 'expost'];
      const configIndicatorValues = [];
      const parcTypesDefaultValues = { init: [], ref: [], prev: [], expost: [] };

      for (const indicator of indicators) {
        const situationsForIndicator = allSituations.filter((situation) => indicator.presence_in_excel?.[situation] === true);
        const configAction = indicator.indicator_category_name === 'Données de base' ? configActions[0].action : configActions[1].action;
        const isParcTypes = configAction.name.startsWith('Parc types');

        for (const situation of situationsForIndicator) {
          const defaultValue = indicator.value_default?.[situation]?.[indicator.value_type] ?? null;
          const indicatorValue = {
            action_id: configAction._id,
            action_name: configAction.name,
            collectivity_id: collectivity._id,
            collectivity_name: collectivity.name,
            owner: 'collectivity',
            indicator_id: indicator._id,
            indicator_name: indicator.name,
            indicator_type: indicator.value_type,
            situation,
            year: req.body[`year_${situation}`],
            indicator_value_unit: indicator.value_unit,
            value_default: { [indicator.value_type]: defaultValue },
            indicator_value_possibilities: indicator.value_possibilities || [],
            indicator_category_id: indicator.indicator_category_id,
            indicator_category_name: indicator.indicator_category_name,
            indicator_sub_category_id: indicator.indicator_sub_category_id,
            indicator_sub_category_name: indicator.indicator_sub_category_name,
            indicator_excel_id: indicator.excel_indicator_id,
            excel_line_number: indicator.excel_line_number?.[situation],
          };

          if (isParcTypes) {
            indicatorValue.value = { [indicator.value_type]: defaultValue };
            if (defaultValue !== null && indicator.excel_indicator_id) {
              parcTypesDefaultValues[situation].push({ excel_indicator_id: indicator.excel_indicator_id, value: defaultValue });
            }
          }

          const displayCondition = indicator.display_condition?.[situation];
          if (displayCondition?.operator || displayCondition?.conditions?.length) indicatorValue.display_condition = displayCondition;
          configIndicatorValues.push(indicatorValue);
        }
      }

      if (configIndicatorValues.length > 0) await IndicatorValue.insertMany(configIndicatorValues);

      // Update Excel with Parc types default values in batch
      const excelBatchPromises = [];
      for (const situation of allSituations) {
        if (parcTypesDefaultValues[situation].length > 0) excelBatchPromises.push(updateExcelCellsBatch(excelFileId, parcTypesDefaultValues[situation], situation).catch(capture));
      }
      await Promise.all(excelBatchPromises);
    }

    // Créer les indicator values pour l'action principale
    const indicators = await Indicator.find({ linked_action_id: parentAction._id });

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
          year: req.body[`year_${situation}`],
          excel_line_number: indicator.excel_line_number?.[situation],
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

    // Trouver l'action "Données de base" pour cette année init
    const configActionBasicData = await Action.findOne({collectivity_id: collectivity._id,type: 'config',year_init: req.body.year_init,name: { $regex: /^Données de base/ }});

    // Mettre à jour l'indicateur ActionsCharte ou ActionsAutres dans l'action Données de base
    if (configActionBasicData) {
    const targetExcelId = req.body.started_before_interlud === true ? 'ActionsAutres' : 'ActionsCharte';
    for (const situation of ['init', 'expost']) {
      const iv = await IndicatorValue.findOneAndUpdate(
          { action_id: configActionBasicData._id, indicator_excel_id: targetExcelId, situation },
        { $addToSet: { 'value.checkbox': parentAction.excel_worksheetname } },
        { new: true }
      );
        if (iv && excelFileId) await updateExcelCellByIndicatorId(excelFileId, targetExcelId, iv.value?.checkbox, situation);
      }

      // Mapping des IDs Excel par situation pour les années
      const anneeExcelIds = { init: 'AnneeRempl', ref: 'AnRef', prev: 'AnneeRempl', expost: 'AnneeRempl' };
      const anneeValues = { init: req.body.year_init, ref: req.body.year_ref, prev: req.body.year_prev, expost: req.body.year_expost };

      for (const situation of ['init', 'ref', 'prev', 'expost']) {
        await IndicatorValue.findOneAndUpdate(
          { action_id: configActionBasicData._id, indicator_excel_id: anneeExcelIds[situation], situation },
          { 'value.number': anneeValues[situation] },
          { new: true },
        );
        if (excelFileId) await updateExcelCellByIndicatorId(excelFileId, anneeExcelIds[situation], anneeValues[situation], situation);
      }
    }

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

    await IndicatorValue.deleteMany({ action_id: req.params.id });
    await Action.deleteOne({ _id: req.params.id });

    return res.status(200).send({ ok: true });
  } catch (error) {
    capture(error);
    return res.status(500).send({ ok: false, code: ERROR_CODES.SERVER_ERROR });
  }
});

router.post('/add_previsionnel', passport.authenticate(['admin', 'user'], { session: false, failWithError: true }), async (req, res) => {
  try {
    const { action_id, year_prev } = req.body;
    if (!action_id) return res.status(400).send({ ok: false, code: ERROR_CODES.INVALID_BODY });
    if (!year_prev) return res.status(400).send({ ok: false, code: ERROR_CODES.INVALID_BODY });

    const action = await Action.findById(action_id);
    if (!action) return res.status(404).send({ ok: false, code: ERROR_CODES.NOT_FOUND });

    // Vérifier si cette année prévisionnelle existe déjà
    const existingPrev = action.excel_files?.find(f => f.year_prev === year_prev);
    if (existingPrev) return res.status(400).send({ ok: false, code: 'YEAR_PREV_ALREADY_EXISTS' });

    const collectivity = await Collectivity.findById(action.collectivity_id);
    if (!collectivity) return res.status(404).send({ ok: false, code: ERROR_CODES.NOT_FOUND });

    // Dupliquer l'Excel depuis le premier fichier existant de cette action
    const sourceExcelId = action.excel_files?.[0]?.excel_file_id || null;
    const excelFileId = await duplicateExcelFile(`${action.name}_Prev${year_prev}.xlsx`, collectivity.sharepoint_folder_id, sourceExcelId);

    // Ajouter le nouveau fichier Excel à l'action
    action.excel_files.push({ year_prev, excel_file_id: excelFileId });
    action.last_modif_by_id = req.user._id;
    action.last_modif_by_name = req.user.name;
    action.last_modif_by_email = req.user.email;
    action.last_modif_date = new Date();
    await action.save();

    // Créer les indicator values pour la nouvelle situation prev
    const parentAction = await Action.findById(action.action_parent_id);
    const indicators = await Indicator.find({ linked_action_id: parentAction?._id || action.action_parent_id });
    const createdIndicatorValues = [];

    for (const indicator of indicators) {
      if (indicator.presence_in_excel?.prev !== true) continue;

      const defaultValue = indicator.value_default?.prev?.[indicator.value_type] ?? null;
      const indicatorValue = {
        action_id: action._id,
        action_name: action.name,
        collectivity_id: action.collectivity_id,
        collectivity_name: action.collectivity_name,
        indicator_id: indicator._id,
        indicator_name: indicator.name,
        indicator_type: indicator.value_type,
        situation: 'prev',
        year: year_prev,
        excel_line_number: indicator.excel_line_number?.prev,
        indicator_value_unit: indicator.value_unit,
        value_default: { [indicator.value_type]: defaultValue },
        indicator_value_possibilities: indicator.value_possibilities || [],
        indicator_category_id: indicator.indicator_category_id,
        indicator_category_name: indicator.indicator_category_name,
        indicator_sub_category_id: indicator.indicator_sub_category_id,
        indicator_sub_category_name: indicator.indicator_sub_category_name,
        indicator_excel_id: indicator.excel_indicator_id,
      };
      const displayCondition = indicator.display_condition?.prev;
      if (displayCondition?.operator || displayCondition?.conditions?.length) indicatorValue.display_condition = displayCondition;
      createdIndicatorValues.push(indicatorValue);
    }

    if (createdIndicatorValues.length > 0) await IndicatorValue.insertMany(createdIndicatorValues);

    // Mettre à jour l'indicateur AnPrev avec la nouvelle année prévisionnelle dans l'Excel
    if (excelFileId) {
      await updateExcelCellByIndicatorId(excelFileId, 'AnPrev', year_prev, 'prev');
    }

    await Log.create({
      model_name: 'action',
      name: action.name,
      field: 'excel_files',
      operation: 'add_previsionnel',
      new_value: { number: year_prev },
      type_value: 'number',
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

// page settings obselete ne pas utiliser
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
        excel_line_number: indicator.excel_line_number?.[situation],
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
