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
const EconomicActor = require('../models/economic_actor');
const { updateExcelCellByIndicatorId, updateExcelCellsBatch, duplicateExcelFile, clearWorksheetValues } = require('../services/microsoftGraph');

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
    if (!req.body.year_init) return res.status(400).send({ ok: false, code: ERROR_CODES.INVALID_BODY });
    if (!req.body.year_ref) return res.status(400).send({ ok: false, code: ERROR_CODES.INVALID_BODY });
    if (!req.body.year_prev) return res.status(400).send({ ok: false, code: ERROR_CODES.INVALID_BODY });
    if (!req.body.year_expost) return res.status(400).send({ ok: false, code: ERROR_CODES.INVALID_BODY });

    const parentAction = await Action.findById(req.body.action_parent_id);
    if (!parentAction) return res.status(404).send({ ok: false, code: ERROR_CODES.NOT_FOUND });

    const collectivity = await Collectivity.findById(req.body.collectivity_id);
    if (!collectivity) return res.status(404).send({ ok: false, code: ERROR_CODES.NOT_FOUND });
    const isEconomicActor = req.body.owner === 'economic_actor' && req.body.economic_actor_id;
    const existingActionSameYear = await Action.findOne({
      collectivity_id: collectivity._id,
      year_init: req.body.year_init,
      owner: isEconomicActor ? 'economic_actor' : 'collectivity',
      ...(isEconomicActor ? { economic_actor_id: req.body.economic_actor_id } : {}),
      'exel_files_prev.0.excel_file_id': { $exists: true },
    });

    // Créer l'Excel : dupliquer depuis une action existante ou depuis le master template
    const excelFileName = isEconomicActor ? `${req.body.economic_actor_name}_${req.body.name}_Prev${req.body.year_prev}.xlsx` : `${req.body.name}_Prev${req.body.year_prev}.xlsx`;
    const excelFileId = await duplicateExcelFile(excelFileName, collectivity.sharepoint_folder_id, existingActionSameYear?.exel_files_prev?.[0]?.excel_file_id || null);

    // Créer l'action
    const action = await Action.create({
      ...req.body,
      excel_worksheetname: parentAction.excel_worksheetname,
      exel_files_prev: [{ year_prev: req.body.year_prev, year_ref: req.body.year_prev, excel_file_id: excelFileId }],
      excel_files_expost: [{ year_expost: req.body.year_expost, year_ref: req.body.year_prev, excel_file_id: excelFileId }],
      last_modif_by_id: req.user._id,
      last_modif_by_name: req.user.name,
      last_modif_by_email: req.user.email,
      last_modif_date: new Date(),
    });
    if (!action) return res.status(400).send({ ok: false, code: ERROR_CODES.INVALID_BODY });

    // Vérifier si les actions config consolidées existent déjà
    const configQuery = { collectivity_id: collectivity._id, type: 'config', owner: isEconomicActor ? 'economic_actor' : 'collectivity', ...(isEconomicActor ? { economic_actor_id: req.body.economic_actor_id } : {}) };
    let configActionBasicDataObj = await Action.findOne({ ...configQuery, name: 'Données de base' });
    let configActionParcTypesObj = await Action.findOne({ ...configQuery, name: 'Parc types' });

    // Créer les actions config si elles n'existent pas
    const configBase = {
      type: 'config',
      collectivity_id: collectivity._id,
      collectivity_name: collectivity.name,
      owner: isEconomicActor ? 'economic_actor' : 'collectivity',
      status: 'no_status',
      ...(isEconomicActor ? { economic_actor_id: req.body.economic_actor_id, economic_actor_name: req.body.economic_actor_name } : {}),
    };
    if (!configActionBasicDataObj) configActionBasicDataObj = await Action.create({ ...configBase, name: 'Données de base' });
    if (!configActionParcTypesObj) configActionParcTypesObj = await Action.create({ ...configBase, name: 'Parc types' });

    // Vérifier si les indicator values existent déjà pour chaque combinaison situation/année
    const configActionIds = [configActionBasicDataObj._id.toString(), configActionParcTypesObj._id.toString()];
    const existingConfigIVs = await IndicatorValue.find({
      action_id: { $in: configActionIds },
      $or: [
        { situation: 'init', year: req.body.year_init },
        { situation: 'ref', year: req.body.year_ref },
        { situation: 'prev', year: req.body.year_prev },
        { situation: 'expost', year: req.body.year_expost },
      ],
    });
    const existingSituationKeys = new Set(existingConfigIVs.map((iv) => `${iv.situation}_${iv.year}`));

    let configIndicatorValues = [];
    {
      // Créer les indicator values pour les actions config (indicateurs sans action liée)
      const indicators = await Indicator.find({ $or: [{ linked_action_id: null }, { linked_action_id: { $exists: false } }] });
      const allSituations = ['init', 'ref', 'prev', 'expost'];
      const parcTypesDefaultValues = { init: [], ref: [], prev: [], expost: [] };

      for (const indicator of indicators) {
        const situationsForIndicator = allSituations.filter((situation) => indicator.presence_in_excel?.[situation] === true);
        const configAction = indicator.indicator_category_name === 'Données de base' ? configActionBasicDataObj : configActionParcTypesObj;
        const isParcTypes = configAction.name === 'Parc types';

        for (const situation of situationsForIndicator) {
          const yearForSituation = req.body[`year_${situation}`];
          if (existingSituationKeys.has(`${situation}_${yearForSituation}`)) continue;

          const defaultValue = indicator.value_default?.[situation]?.[indicator.value_type] ?? null;
          const indicatorValue = {
            action_id: configAction._id,
            action_name: configAction.name,
            collectivity_id: collectivity._id,
            collectivity_name: collectivity.name,
            owner: isEconomicActor ? 'economic_actor' : 'collectivity',
            ...(isEconomicActor ? { economic_actor_id: req.body.economic_actor_id, economic_actor_name: req.body.economic_actor_name } : {}),
            indicator_id: indicator._id,
            indicator_name: indicator.name,
            indicator_type: indicator.value_type,
            situation,
            year: req.body[`year_${situation}`],
            year_init: req.body.year_init,
            year_ref: req.body.year_ref,
            year_prev: req.body.year_prev,
            year_expost: req.body.year_expost,
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
            if (defaultValue !== null && indicator.excel_indicator_id) parcTypesDefaultValues[situation].push({ excel_indicator_id: indicator.excel_indicator_id, value: defaultValue });
          }

          const displayCondition = indicator.display_condition?.[situation];
          if (displayCondition?.operator || displayCondition?.conditions?.length) indicatorValue.display_condition = displayCondition;
          configIndicatorValues.push(indicatorValue);
        }
      }

      if (configIndicatorValues.length > 0) await IndicatorValue.insertMany(configIndicatorValues);
      // Collecter les valeurs des IVs Parc types déjà existantes pour les écrire dans le nouvel Excel
      const existingParcTypesIVs = existingConfigIVs.filter((iv) => iv.action_id.toString() === configActionParcTypesObj._id.toString());
      for (const iv of existingParcTypesIVs) {
        if (iv.indicator_excel_id && iv.value) {
          if (iv.value[iv.indicator_type] !== null && iv.value[iv.indicator_type] !== undefined) parcTypesDefaultValues[iv.situation].push({ excel_indicator_id: iv.indicator_excel_id, value: iv.value[iv.indicator_type] });
        }
      }

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
          owner: isEconomicActor ? 'economic_actor' : 'collectivity',
          ...(isEconomicActor ? { economic_actor_id: req.body.economic_actor_id, economic_actor_name: req.body.economic_actor_name } : {}),
          indicator_id: indicator._id,
          indicator_name: indicator.name,
          indicator_type: indicator.value_type,
          situation,
          year: req.body[`year_${situation}`],
          year_init: req.body.year_init,
          year_ref: req.body.year_ref,
          year_prev: req.body.year_prev,
          year_expost: req.body.year_expost,
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

    // Mettre à jour l'indicateur ActionsCharte ou ActionsAutres dans l'action Données de base consolidée
    if (configActionBasicDataObj) {
      const targetExcelId = req.body.started_before_interlud === true ? 'ActionsAutres' : 'ActionsCharte';
      for (const situation of ['init', 'expost']) {
        const iv = await IndicatorValue.findOneAndUpdate(
          { action_id: configActionBasicDataObj._id, indicator_excel_id: targetExcelId, situation, year: req.body[`year_${situation}`] },
          { $addToSet: { 'value.checkbox': parentAction.excel_worksheetname } },
          { new: true },
        );
        if (iv && excelFileId) await updateExcelCellByIndicatorId(excelFileId, targetExcelId, iv.value?.checkbox, situation);
      }

      // Mapping des IDs Excel par situation pour les années
      const anneeExcelIds = { init: 'AnneeRempl', ref: 'AnRef', prev: 'AnneeRempl', expost: 'AnneeRempl' };
      const anneeValues = { init: req.body.year_init, ref: req.body.year_ref, prev: req.body.year_prev, expost: req.body.year_expost };

      for (const situation of ['init', 'ref', 'prev', 'expost']) {
        await IndicatorValue.findOneAndUpdate(
          { action_id: configActionBasicDataObj._id, indicator_excel_id: anneeExcelIds[situation], situation, year: req.body[`year_${situation}`] },
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

    const collectivityDoc = await Collectivity.findById(collectivity._id);

    // Inclure TOUTES les actions de la collectivité (y compris les actions config)
    const sourceActions = await Action.find({ collectivity_id: collectivity._id, owner: 'collectivity' });
    if (!sourceActions.length) return res.status(200).send({ ok: true, data: [] });

    // Créer les actions avec leurs propres fichiers Excel
    const duplicatedActions = [];
    for (const action of sourceActions) {
      const excelFiles = [];
      const excelFilesExpost = [];
      if (action.type !== 'config') {
        for (const excelFile of action.exel_files_prev || []) {
          try {
            const newExcelFileId = await duplicateExcelFile(`${economic_actor.name}_${action.name}_Prev${excelFile.year_prev}.xlsx`, collectivityDoc?.sharepoint_folder_id, excelFile.excel_file_id);
            excelFiles.push({ year_prev: excelFile.year_prev, year_ref: excelFile.year_ref || excelFile.year_prev, excel_file_id: newExcelFileId });
          } catch (excelError) {
            capture(excelError);
          }
        }
        for (const excelFile of action.excel_files_expost || []) {
          try {
            const newExcelFileId = await duplicateExcelFile(`${economic_actor.name}_${action.name}_Expost${excelFile.year_expost}.xlsx`, collectivityDoc?.sharepoint_folder_id, excelFile.excel_file_id);
            excelFilesExpost.push({ year_expost: excelFile.year_expost, year_ref: excelFile.year_ref || excelFile.year_expost, excel_file_id: newExcelFileId });
          } catch (excelError) {
            capture(excelError);
          }
        }
      }

      const newAction = await Action.create({
        ...action.toObject(),
        owner: 'economic_actor',
        status: 'no_status',
        economic_actor_id: economic_actor._id,
        economic_actor_name: economic_actor.name,
        action_collectivity_id: action._id,
        exel_files_prev: excelFiles,
        excel_files_expost: excelFilesExpost,
        last_modif_by_id: null,
        last_modif_by_name: null,
        last_modif_date: null,
        _id: undefined,
        __v: undefined,
        createdAt: undefined,
        updatedAt: undefined,
      });
      duplicatedActions.push(newAction);
    }

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
    const existingPrev = action.exel_files_prev?.find((f) => f.year_prev === year_prev);
    if (existingPrev) return res.status(400).send({ ok: false, code: 'YEAR_PREV_ALREADY_EXISTS' });

    const collectivity = await Collectivity.findById(action.collectivity_id);
    if (!collectivity) return res.status(404).send({ ok: false, code: ERROR_CODES.NOT_FOUND });

    // Construire le nom du fichier Excel selon le owner
    let excelFileName = `${action.name}_Prev${year_prev}.xlsx`;
    if (action.owner === 'economic_actor' && action.economic_actor_name) excelFileName = `${action.economic_actor_name}_${action.name}_Prev${year_prev}.xlsx`;

    // Dupliquer l'Excel depuis le premier fichier existant de cette action
    const sourceExcelId = action.exel_files_prev?.[0]?.excel_file_id || null;
    const excelFileId = await duplicateExcelFile(excelFileName, collectivity.sharepoint_folder_id, sourceExcelId);

    // Vider les feuilles init et expost du nouveau fichier Excel
    await clearWorksheetValues(excelFileId, 'expost');

    // Ajouter le nouveau fichier Excel à l'action
    action.exel_files_prev.push({ year_prev, year_ref: year_prev, excel_file_id: excelFileId });
    action.last_modif_by_id = req.user._id;
    action.last_modif_by_name = req.user.name;
    action.last_modif_by_email = req.user.email;
    action.last_modif_date = new Date();
    await action.save();

    // Créer les indicator values config (Données de base, Parc types) pour les situations prev et ref si elles n'existent pas
    const configActionBasicData = await Action.findOne({
      collectivity_id: action.collectivity_id,
      type: 'config',
      name: 'Données de base',
      owner: action.owner,
      ...(action.owner === 'economic_actor' ? { economic_actor_id: action.economic_actor_id } : {}),
    });
    const configActionParcTypes = await Action.findOne({
      collectivity_id: action.collectivity_id,
      type: 'config',
      name: 'Parc types',
      owner: action.owner,
      ...(action.owner === 'economic_actor' ? { economic_actor_id: action.economic_actor_id } : {}),
    });

    if (configActionBasicData || configActionParcTypes) {
      // Vérifier si les indicateurs config existent déjà pour ces années (prev et ref)
      const existingConfigPrevIV = await IndicatorValue.findOne({
        action_id: { $in: [configActionBasicData?._id?.toString(), configActionParcTypes?._id?.toString()].filter(Boolean) },
        situation: 'prev',
        year: year_prev,
      });
      const existingConfigRefIV = await IndicatorValue.findOne({
        action_id: { $in: [configActionBasicData?._id?.toString(), configActionParcTypes?._id?.toString()].filter(Boolean) },
        situation: 'ref',
        year: year_prev,
      });

      if (!existingConfigPrevIV || !existingConfigRefIV) {
        const configIndicators = await Indicator.find({ $or: [{ linked_action_id: null }, { linked_action_id: { $exists: false } }] });
        const configIndicatorValues = [];

        for (const indicator of configIndicators) {
          const situations = [];
          if (!existingConfigPrevIV && indicator.presence_in_excel?.prev === true) situations.push('prev');
          if (!existingConfigRefIV && indicator.presence_in_excel?.ref === true) situations.push('ref');

          const configAction = indicator.indicator_category_name === 'Données de base' ? configActionBasicData : configActionParcTypes;
          if (!configAction) continue;
          for (const situation of situations) {
            const defaultValue = indicator.value_default?.[situation]?.[indicator.value_type] ?? null;
            const iv = {
              action_id: configAction._id,
              action_name: configAction.name,
              collectivity_id: action.collectivity_id,
              collectivity_name: action.collectivity_name,
              owner: action.owner,
              indicator_id: indicator._id,
              indicator_name: indicator.name,
              indicator_type: indicator.value_type,
              situation,
              year: year_prev,
              year_init: action.year_init,
              year_ref: year_prev,
              year_prev: year_prev,
              year_expost: action.year_expost,
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

            if (configAction.name === 'Parc types') iv.value = { [indicator.value_type]: defaultValue };
            if (action.owner === 'economic_actor') {
              iv.economic_actor_id = action.economic_actor_id;
              iv.economic_actor_name = action.economic_actor_name;
            }

            const displayCondition = indicator.display_condition?.[situation];
            if (displayCondition?.operator || displayCondition?.conditions?.length) iv.display_condition = displayCondition;
            configIndicatorValues.push(iv);
          }
        }

        if (configIndicatorValues.length > 0) await IndicatorValue.insertMany(configIndicatorValues);

        // Mettre à jour AnneeRempl et AnRef pour les config
        if (configActionBasicData) {
          if (!existingConfigPrevIV) {
            await IndicatorValue.findOneAndUpdate({ action_id: configActionBasicData._id, indicator_excel_id: 'AnneeRempl', situation: 'prev', year: year_prev }, { 'value.number': year_prev }, { new: true });
          }
          if (!existingConfigRefIV) {
            await IndicatorValue.findOneAndUpdate({ action_id: configActionBasicData._id, indicator_excel_id: 'AnRef', situation: 'ref', year: year_prev }, { 'value.number': year_prev }, { new: true });
          }
        }
      }
    }

    // Créer les indicator values pour les situations prev et ref (year_ref = year_prev)
    const parentAction = await Action.findById(action.action_parent_id);
    const indicators = await Indicator.find({ linked_action_id: parentAction?._id || action.action_parent_id });
    const createdPrevIndicatorValues = [];
    const createdRefIndicatorValues = [];

    for (const indicator of indicators) {
      const situations = [];
      if (indicator.presence_in_excel?.prev === true) situations.push('prev');
      if (indicator.presence_in_excel?.ref === true) situations.push('ref');

      for (const situation of situations) {
        const defaultValue = indicator.value_default?.[situation]?.[indicator.value_type] ?? null;
        const indicatorValue = {
          action_id: action._id,
          action_name: action.name,
          collectivity_id: action.collectivity_id,
          collectivity_name: action.collectivity_name,
          owner: action.owner,
          indicator_id: indicator._id,
          indicator_name: indicator.name,
          indicator_type: indicator.value_type,
          situation,
          year: year_prev,
          year_init: action.year_init,
          year_ref: year_prev,
          year_prev: year_prev,
          year_expost: action.year_expost,
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

        // Ajouter les champs spécifiques aux acteurs économiques
        if (action.owner === 'economic_actor') {
          indicatorValue.economic_actor_id = action.economic_actor_id;
          indicatorValue.economic_actor_name = action.economic_actor_name;
          if (situation === 'prev') {
            const collectivityIV = await IndicatorValue.findOne({
              collectivity_id: action.collectivity_id,
              indicator_id: indicator._id,
              situation: 'prev',
              year: year_prev,
              owner: 'collectivity',
            });
            if (collectivityIV) indicatorValue.indicator_value_collectivity_id = collectivityIV._id;
          }
          indicatorValue.value = { text: null, number: null, radio: null, checkbox: [] };
        }

        const displayCondition = indicator.display_condition?.[situation];
        if (displayCondition?.operator || displayCondition?.conditions?.length) indicatorValue.display_condition = displayCondition;

        if (situation === 'prev') createdPrevIndicatorValues.push(indicatorValue);
        else createdRefIndicatorValues.push(indicatorValue);
      }
    }

    let insertedPrevIVs = [];
    let insertedRefIVs = [];
    if (createdPrevIndicatorValues.length > 0) insertedPrevIVs = await IndicatorValue.insertMany(createdPrevIndicatorValues);
    if (createdRefIndicatorValues.length > 0) insertedRefIVs = await IndicatorValue.insertMany(createdRefIndicatorValues);

    // Mettre à jour l'indicateur AnPrev avec la nouvelle année prévisionnelle dans l'Excel
    if (excelFileId) await updateExcelCellByIndicatorId(excelFileId, 'AnneeRempl', year_prev, 'prev');

    // Mettre à jour l'indicateur AnRef avec la nouvelle année de référence (= year_prev) dans l'Excel
    if (excelFileId) await updateExcelCellByIndicatorId(excelFileId, 'AnRef', year_prev, 'ref');

    await Log.create({
      model_name: 'action',
      name: action.name,
      field: 'exel_files_prev',
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

router.post('/add_expost', passport.authenticate(['admin', 'user'], { session: false, failWithError: true }), async (req, res) => {
  try {
    const { action_id, year_expost } = req.body;
    if (!action_id) return res.status(400).send({ ok: false, code: ERROR_CODES.INVALID_BODY });
    if (!year_expost) return res.status(400).send({ ok: false, code: ERROR_CODES.INVALID_BODY });

    const action = await Action.findById(action_id);
    if (!action) return res.status(404).send({ ok: false, code: ERROR_CODES.NOT_FOUND });

    // Vérifier si cette année expost existe déjà
    const existingExpost = action.excel_files_expost?.find((f) => f.year_expost === year_expost);
    if (existingExpost) return res.status(400).send({ ok: false, code: 'YEAR_EXPOST_ALREADY_EXISTS' });

    const collectivity = await Collectivity.findById(action.collectivity_id);
    if (!collectivity) return res.status(404).send({ ok: false, code: ERROR_CODES.NOT_FOUND });

    // Construire le nom du fichier Excel selon le owner
    let excelFileName = `${action.name}_Expost${year_expost}.xlsx`;
    if (action.owner === 'economic_actor' && action.economic_actor_name) excelFileName = `${action.economic_actor_name}_${action.name}_Expost${year_expost}.xlsx`;

    // Dupliquer l'Excel depuis le premier fichier existant de cette action
    const sourceExcelId = action.excel_files_expost?.[0]?.excel_file_id || action.exel_files_prev?.[0]?.excel_file_id || null;
    const excelFileId = await duplicateExcelFile(excelFileName, collectivity.sharepoint_folder_id, sourceExcelId);

    // Vider les feuilles init et prev du nouveau fichier Excel
    await clearWorksheetValues(excelFileId, 'prev');

    // Ajouter le nouveau fichier Excel à l'action
    action.excel_files_expost = action.excel_files_expost || [];
    action.excel_files_expost.push({ year_expost, year_ref: year_expost, excel_file_id: excelFileId });
    action.last_modif_by_id = req.user._id;
    action.last_modif_by_name = req.user.name;
    action.last_modif_by_email = req.user.email;
    action.last_modif_date = new Date();
    await action.save();

    // Créer les indicator values config (Données de base, Parc types) pour la nouvelle année expost si elles n'existent pas
    const configActionBasicData = await Action.findOne({
      collectivity_id: action.collectivity_id,
      type: 'config',
      name: 'Données de base',
      owner: action.owner,
      ...(action.owner === 'economic_actor' ? { economic_actor_id: action.economic_actor_id } : {}),
    });
    const configActionParcTypes = await Action.findOne({
      collectivity_id: action.collectivity_id,
      type: 'config',
      name: 'Parc types',
      owner: action.owner,
      ...(action.owner === 'economic_actor' ? { economic_actor_id: action.economic_actor_id } : {}),
    });

    if (configActionBasicData || configActionParcTypes) {
      // Vérifier si les indicateurs config existent déjà pour ces années (expost et ref)
      const existingConfigExpostIV = await IndicatorValue.findOne({
        action_id: { $in: [configActionBasicData?._id?.toString(), configActionParcTypes?._id?.toString()].filter(Boolean) },
        situation: 'expost',
        year: year_expost,
      });
      const existingConfigRefIV = await IndicatorValue.findOne({
        action_id: { $in: [configActionBasicData?._id?.toString(), configActionParcTypes?._id?.toString()].filter(Boolean) },
        situation: 'ref',
        year: year_expost,
      });

      if (!existingConfigExpostIV || !existingConfigRefIV) {
        const configIndicators = await Indicator.find({ $or: [{ linked_action_id: null }, { linked_action_id: { $exists: false } }] });
        const configIndicatorValues = [];

        for (const indicator of configIndicators) {
          const situations = [];
          if (!existingConfigExpostIV && indicator.presence_in_excel?.expost === true) situations.push('expost');
          if (!existingConfigRefIV && indicator.presence_in_excel?.ref === true) situations.push('ref');

          const configAction = indicator.indicator_category_name === 'Données de base' ? configActionBasicData : configActionParcTypes;
          if (!configAction) continue;

          for (const situation of situations) {
            const defaultValue = indicator.value_default?.[situation]?.[indicator.value_type] ?? null;
            const iv = {
              action_id: configAction._id,
              action_name: configAction.name,
              collectivity_id: action.collectivity_id,
              collectivity_name: action.collectivity_name,
              owner: action.owner,
              indicator_id: indicator._id,
              indicator_name: indicator.name,
              indicator_type: indicator.value_type,
              situation,
              year: year_expost,
              year_init: action.year_init,
              year_ref: year_expost,
              year_prev: action.year_prev,
              year_expost: year_expost,
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

            if (configAction.name === 'Parc types') iv.value = { [indicator.value_type]: defaultValue };
            if (action.owner === 'economic_actor') {
              iv.economic_actor_id = action.economic_actor_id;
              iv.economic_actor_name = action.economic_actor_name;
            }

            const displayCondition = indicator.display_condition?.[situation];
            if (displayCondition?.operator || displayCondition?.conditions?.length) iv.display_condition = displayCondition;
            configIndicatorValues.push(iv);
          }
        }

        if (configIndicatorValues.length > 0) await IndicatorValue.insertMany(configIndicatorValues);

        // Mettre à jour ActionsCharte/ActionsAutres pour la nouvelle année expost
        if (configActionBasicData && !existingConfigExpostIV) {
          const parentAction = await Action.findById(action.action_parent_id);
          if (parentAction) {
            // Copier les valeurs ActionsCharte/ActionsAutres depuis la situation expost existante
            for (const targetExcelId of ['ActionsCharte', 'ActionsAutres']) {
              const existingIV = await IndicatorValue.findOne({
                action_id: configActionBasicData._id,
                indicator_excel_id: targetExcelId,
                situation: 'expost',
                year: { $ne: year_expost },
                owner: action.owner,
              });
              if (existingIV?.value?.checkbox?.length > 0) {
                await IndicatorValue.findOneAndUpdate({ action_id: configActionBasicData._id, indicator_excel_id: targetExcelId, situation: 'expost', year: year_expost }, { 'value.checkbox': existingIV.value.checkbox }, { new: true });
              }
            }
          }

          // Mettre à jour l'indicateur AnneeRempl pour la nouvelle année expost dans les config
          await IndicatorValue.findOneAndUpdate({ action_id: configActionBasicData._id, indicator_excel_id: 'AnneeRempl', situation: 'expost', year: year_expost }, { 'value.number': year_expost }, { new: true });
        }

        // Mettre à jour AnRef pour la situation ref dans les config
        if (configActionBasicData && !existingConfigRefIV) {
          await IndicatorValue.findOneAndUpdate({ action_id: configActionBasicData._id, indicator_excel_id: 'AnRef', situation: 'ref', year: year_expost }, { 'value.number': year_expost }, { new: true });
        }
      }
    }

    // Créer les indicator values pour les situations expost et ref (year_ref = year_expost)
    const parentAction = await Action.findById(action.action_parent_id);
    const indicators = await Indicator.find({ linked_action_id: parentAction?._id || action.action_parent_id });
    const createdExpostIndicatorValues = [];
    const createdRefIndicatorValues = [];

    for (const indicator of indicators) {
      const situations = [];
      if (indicator.presence_in_excel?.expost === true) situations.push('expost');
      if (indicator.presence_in_excel?.ref === true) situations.push('ref');

      for (const situation of situations) {
        const defaultValue = indicator.value_default?.[situation]?.[indicator.value_type] ?? null;
        const indicatorValue = {
          action_id: action._id,
          action_name: action.name,
          collectivity_id: action.collectivity_id,
          collectivity_name: action.collectivity_name,
          owner: action.owner,
          indicator_id: indicator._id,
          indicator_name: indicator.name,
          indicator_type: indicator.value_type,
          situation,
          year: year_expost,
          year_init: action.year_init,
          year_ref: year_expost,
          year_prev: action.year_prev,
          year_expost: year_expost,
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

        // Ajouter les champs spécifiques aux acteurs économiques
        if (action.owner === 'economic_actor') {
          indicatorValue.economic_actor_id = action.economic_actor_id;
          indicatorValue.economic_actor_name = action.economic_actor_name;
          if (situation === 'expost') {
            const collectivityIV = await IndicatorValue.findOne({
              collectivity_id: action.collectivity_id,
              indicator_id: indicator._id,
              situation: 'expost',
              year: year_expost,
              owner: 'collectivity',
            });
            if (collectivityIV) indicatorValue.indicator_value_collectivity_id = collectivityIV._id;
          }
          indicatorValue.value = { text: null, number: null, radio: null, checkbox: [] };
        }

        const displayCondition = indicator.display_condition?.[situation];
        if (displayCondition?.operator || displayCondition?.conditions?.length) indicatorValue.display_condition = displayCondition;

        if (situation === 'expost') createdExpostIndicatorValues.push(indicatorValue);
        else createdRefIndicatorValues.push(indicatorValue);
      }
    }

    let insertedExpostIVs = [];
    let insertedRefIVs = [];
    if (createdExpostIndicatorValues.length > 0) insertedExpostIVs = await IndicatorValue.insertMany(createdExpostIndicatorValues);
    if (createdRefIndicatorValues.length > 0) insertedRefIVs = await IndicatorValue.insertMany(createdRefIndicatorValues);

    // Mettre à jour l'indicateur AnneeRempl avec la nouvelle année expost dans l'Excel
    if (excelFileId) await updateExcelCellByIndicatorId(excelFileId, 'AnneeRempl', year_expost, 'expost');

    // Mettre à jour l'indicateur AnRef avec la nouvelle année de référence (= year_expost) dans l'Excel
    if (excelFileId) await updateExcelCellByIndicatorId(excelFileId, 'AnRef', year_expost, 'ref');

    await Log.create({
      model_name: 'action',
      name: action.name,
      field: 'excel_files_expost',
      operation: 'add_expost',
      new_value: { number: year_expost },
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
