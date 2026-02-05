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
const { updateExcelCellByIndicatorId, updateExcelCellsBatch, duplicateExcelFile } = require('../services/microsoftGraph');

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
    const existingActionSameYear = await Action.findOne({ collectivity_id: collectivity._id, year_init: req.body.year_init, 'excel_files.0.excel_file_id': { $exists: true } });

    // Créer l'Excel : dupliquer depuis une action existante ou depuis le master template
    const sourceExcelId = existingActionSameYear?.excel_files?.[0]?.excel_file_id || null;
    const excelFileId = await duplicateExcelFile(`${req.body.name}_Prev${req.body.year_prev}.xlsx`, collectivity.sharepoint_folder_id, sourceExcelId);

    // Créer l'action
    const action = await Action.create({
      ...req.body,
      excel_worksheetname: parentAction.excel_worksheetname,
      excel_files: [{ year_prev: req.body.year_prev, excel_file_id: excelFileId }],
      excel_files_expost: [{ year_expost: req.body.year_expost, excel_file_id: excelFileId }],
      last_modif_by_id: req.user._id,
      last_modif_by_name: req.user.name,
      last_modif_by_email: req.user.email,
      last_modif_date: new Date(),
    });
    if (!action) return res.status(400).send({ ok: false, code: ERROR_CODES.INVALID_BODY });

    // Vérifier si les actions config consolidées existent déjà pour cette collectivité
    let configActionBasicDataObj = await Action.findOne({ collectivity_id: collectivity._id, type: 'config', name: 'Données de base' });
    let configActionParcTypesObj = await Action.findOne({ collectivity_id: collectivity._id, type: 'config', name: 'Parc types' });

    // Créer les actions config si elles n'existent pas
    if (!configActionBasicDataObj)
      configActionBasicDataObj = await Action.create({
        name: 'Données de base',
        type: 'config',
        collectivity_id: collectivity._id,
        collectivity_name: collectivity.name,
        owner: 'collectivity',
        status: 'no_status',
      });
    if (!configActionParcTypesObj)
      configActionParcTypesObj = await Action.create({
        name: 'Parc types',
        type: 'config',
        collectivity_id: collectivity._id,
        collectivity_name: collectivity.name,
        owner: 'collectivity',
        status: 'no_status',
      });

    // Vérifier si les indicator values existent déjà pour cette combinaison d'années
    const existingConfigIndicatorValue = await IndicatorValue.findOne({
      action_id: { $in: [configActionBasicDataObj._id.toString(), configActionParcTypesObj._id.toString()] },
      situation: 'init',
      year: req.body.year_init,
    });

    let configIndicatorValues = [];
    if (!existingConfigIndicatorValue) {
      // Créer les indicator values pour les actions config (indicateurs sans action liée)
      const indicators = await Indicator.find({ $or: [{ linked_action_id: null }, { linked_action_id: { $exists: false } }] });
      const allSituations = ['init', 'ref', 'prev', 'expost'];
      const parcTypesDefaultValues = { init: [], ref: [], prev: [], expost: [] };

      for (const indicator of indicators) {
        const situationsForIndicator = allSituations.filter((situation) => indicator.presence_in_excel?.[situation] === true);
        const configAction = indicator.indicator_category_name === 'Données de base' ? configActionBasicDataObj : configActionParcTypesObj;
        const isParcTypes = configAction.name === 'Parc types';

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
            if (defaultValue !== null && indicator.excel_indicator_id)
              parcTypesDefaultValues[situation].push({ excel_indicator_id: indicator.excel_indicator_id, value: defaultValue });
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
          owner: 'collectivity',
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

        // Propager la mise à jour d'ActionsCharte/ActionsAutres aux acteurs économiques
        if (iv)
          await IndicatorValue.updateMany(
            { indicator_excel_id: targetExcelId, situation, year: req.body[`year_${situation}`], collectivity_id: collectivity._id, owner: 'economic_actor' },
            { $addToSet: { 'value.checkbox': parentAction.excel_worksheetname } },
          );
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

    // Propager la création de l'action aux acteurs économiques de cette collectivité
    const economicActors = await EconomicActor.find({ 'collectivities.id': collectivity._id.toString() });

    for (const actor of economicActors) {
      // Créer le fichier Excel pour l'acteur économique
      let actorExcelFileId = null;
      try {
        actorExcelFileId = await duplicateExcelFile(`${actor.name}_${action.name}_Prev${req.body.year_prev}.xlsx`, collectivity.sharepoint_folder_id, excelFileId);
      } catch (excelError) {
        capture(excelError);
      }

      // Créer l'action pour l'acteur économique
      const actorAction = await Action.create({
        ...action.toObject(),
        owner: 'economic_actor',
        status: 'no_status',
        economic_actor_id: actor._id,
        economic_actor_name: actor.name,
        action_collectivity_id: action._id,
        excel_files: actorExcelFileId ? [{ year_prev: req.body.year_prev, excel_file_id: actorExcelFileId }] : [],
        excel_files_expost: actorExcelFileId ? [{ year_expost: req.body.year_expost, excel_file_id: actorExcelFileId }] : [],
      });

      // Créer les indicator values pour l'acteur économique (actions régulières - valeurs vides)
      const actorIndicatorValues = createdIndicatorValues.map((iv) => ({
        ...iv,
        owner: 'economic_actor',
        economic_actor_id: actor._id,
        economic_actor_name: actor.name,
        action_id: actorAction._id,
        action_name: actorAction.name,
        indicator_value_collectivity_id: undefined, // Sera mis à jour après l'insertion des IV de la collectivité
        value: { text: null, number: null, radio: null, checkbox: [] },
      }));

      if (actorIndicatorValues.length > 0) await IndicatorValue.insertMany(actorIndicatorValues);

      // Créer les indicator values config pour l'acteur économique si les actions config ont été créées
      if (!existingConfigIndicatorValue && configIndicatorValues.length > 0) {
        // Trouver ou créer les actions config pour l'acteur économique
        let actorConfigBasicData = await Action.findOne({
          collectivity_id: collectivity._id,
          type: 'config',
          name: 'Données de base',
          owner: 'economic_actor',
          economic_actor_id: actor._id,
        });
        let actorConfigParcTypes = await Action.findOne({
          collectivity_id: collectivity._id,
          type: 'config',
          name: 'Parc types',
          owner: 'economic_actor',
          economic_actor_id: actor._id,
        });

        if (!actorConfigBasicData) {
          actorConfigBasicData = await Action.create({
            name: 'Données de base',
            type: 'config',
            collectivity_id: collectivity._id,
            collectivity_name: collectivity.name,
            owner: 'economic_actor',
            status: 'no_status',
            economic_actor_id: actor._id,
            economic_actor_name: actor.name,
            action_collectivity_id: configActionBasicDataObj._id,
          });
        }
        if (!actorConfigParcTypes) {
          actorConfigParcTypes = await Action.create({
            name: 'Parc types',
            type: 'config',
            collectivity_id: collectivity._id,
            collectivity_name: collectivity.name,
            owner: 'economic_actor',
            status: 'no_status',
            economic_actor_id: actor._id,
            economic_actor_name: actor.name,
            action_collectivity_id: configActionParcTypesObj._id,
          });
        }

        const actorConfigIndicatorValues = [];
        for (const configIV of configIndicatorValues) {
          const isParcTypes = configIV.action_name === 'Parc types';
          const isDonneesDeBase = configIV.action_name === 'Données de base';
          const targetAction = isDonneesDeBase ? actorConfigBasicData : actorConfigParcTypes;

          // Déterminer la valeur à mettre
          let valueToSet = { text: null, number: null, radio: null, checkbox: [] };
          if (isParcTypes) {
            const defaultVal = configIV.value_default?.[configIV.indicator_type];
            if (defaultVal !== undefined && defaultVal !== null) valueToSet = { ...valueToSet, [configIV.indicator_type]: defaultVal };
          }
          if (isDonneesDeBase) {
            if (configIV.indicator_excel_id === 'ActionsCharte' || configIV.indicator_excel_id === 'ActionsAutres') valueToSet = configIV.value || valueToSet;
          }

          actorConfigIndicatorValues.push({
            ...configIV,
            owner: 'economic_actor',
            economic_actor_id: actor._id,
            economic_actor_name: actor.name,
            action_id: targetAction._id,
            action_name: targetAction.name,
            value: valueToSet,
          });
        }

        if (actorConfigIndicatorValues.length > 0) await IndicatorValue.insertMany(actorConfigIndicatorValues);
      }

      // Mettre à jour les années dans l'Excel de l'acteur économique
      if (actorExcelFileId) {
        const anneeUpdates = [
          { situation: 'init', excelId: 'AnneeRempl', value: req.body.year_init },
          { situation: 'ref', excelId: 'AnRef', value: req.body.year_ref },
          { situation: 'prev', excelId: 'AnneeRempl', value: req.body.year_prev },
          { situation: 'expost', excelId: 'AnneeRempl', value: req.body.year_expost },
        ];

        for (const update of anneeUpdates) {
          if (update.value) {
            try {
              await updateExcelCellByIndicatorId(actorExcelFileId, update.excelId, update.value, update.situation);
            } catch (excelError) {
              capture(excelError);
            }
          }
        }
      }
    }

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
        for (const excelFile of action.excel_files || []) {
          try {
            const newExcelFileId = await duplicateExcelFile(
              `${economic_actor.name}_${action.name}_Prev${excelFile.year_prev}.xlsx`,
              collectivityDoc?.sharepoint_folder_id,
              excelFile.excel_file_id,
            );
            excelFiles.push({ year_prev: excelFile.year_prev, excel_file_id: newExcelFileId });
          } catch (excelError) {
            capture(excelError);
          }
        }
        for (const excelFile of action.excel_files_expost || []) {
          try {
            const newExcelFileId = await duplicateExcelFile(
              `${economic_actor.name}_${action.name}_Expost${excelFile.year_expost}.xlsx`,
              collectivityDoc?.sharepoint_folder_id,
              excelFile.excel_file_id,
            );
            excelFilesExpost.push({ year_expost: excelFile.year_expost, excel_file_id: newExcelFileId });
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
        excel_files: excelFiles,
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
    const existingPrev = action.excel_files?.find((f) => f.year_prev === year_prev);
    if (existingPrev) return res.status(400).send({ ok: false, code: 'YEAR_PREV_ALREADY_EXISTS' });

    const collectivity = await Collectivity.findById(action.collectivity_id);
    if (!collectivity) return res.status(404).send({ ok: false, code: ERROR_CODES.NOT_FOUND });

    // Construire le nom du fichier Excel selon le owner
    let excelFileName = `${action.name}_Prev${year_prev}.xlsx`;
    if (action.owner === 'economic_actor' && action.economic_actor_name) excelFileName = `${action.economic_actor_name}_${action.name}_Prev${year_prev}.xlsx`;

    // Dupliquer l'Excel depuis le premier fichier existant de cette action
    const sourceExcelId = action.excel_files?.[0]?.excel_file_id || null;
    const excelFileId = await duplicateExcelFile(excelFileName, collectivity.sharepoint_folder_id, sourceExcelId);

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
        owner: action.owner,
        indicator_id: indicator._id,
        indicator_name: indicator.name,
        indicator_type: indicator.value_type,
        situation: 'prev',
        year: year_prev,
        year_init: action.year_init,
        year_ref: action.year_ref,
        year_prev: year_prev,
        year_expost: action.year_expost,
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

      // Ajouter les champs spécifiques aux acteurs économiques
      if (action.owner === 'economic_actor') {
        indicatorValue.economic_actor_id = action.economic_actor_id;
        indicatorValue.economic_actor_name = action.economic_actor_name;
        const collectivityIV = await IndicatorValue.findOne({
          collectivity_id: action.collectivity_id,
          indicator_id: indicator._id,
          situation: 'prev',
          year: year_prev,
          owner: 'collectivity',
        });
        if (collectivityIV) indicatorValue.indicator_value_collectivity_id = collectivityIV._id;
        indicatorValue.value = { text: null, number: null, radio: null, checkbox: [] };
      }

      const displayCondition = indicator.display_condition?.prev;
      if (displayCondition?.operator || displayCondition?.conditions?.length) indicatorValue.display_condition = displayCondition;
      createdIndicatorValues.push(indicatorValue);
    }

    let insertedCollectivityIVs = [];
    if (createdIndicatorValues.length > 0) insertedCollectivityIVs = await IndicatorValue.insertMany(createdIndicatorValues);

    // Mettre à jour l'indicateur AnPrev avec la nouvelle année prévisionnelle dans l'Excel
    if (excelFileId) await updateExcelCellByIndicatorId(excelFileId, 'AnneeRempl', year_prev, 'prev');

    // Si c'est une action de collectivité, propager l'ajout de l'année prévisionnelle aux acteurs économiques
    if (action.owner === 'collectivity') {
      // Trouver toutes les actions des acteurs économiques liées à cette action
      const economicActorActions = await Action.find({ action_collectivity_id: action._id, owner: 'economic_actor' });

      for (const actorAction of economicActorActions) {
        try {
          // Vérifier si cette année prévisionnelle existe déjà pour l'acteur
          const actorExistingPrev = actorAction.excel_files?.find((f) => f.year_prev === year_prev);
          if (actorExistingPrev) continue;

          // Créer le fichier Excel pour l'acteur économique
          const actorExcelFileId = await duplicateExcelFile(
            `${actorAction.economic_actor_name}_${actorAction.name}_Prev${year_prev}.xlsx`,
            collectivity.sharepoint_folder_id,
            excelFileId,
          );

          // Ajouter le fichier Excel à l'action de l'acteur
          actorAction.excel_files = actorAction.excel_files || [];
          actorAction.excel_files.push({ year_prev, excel_file_id: actorExcelFileId });
          await actorAction.save();

          // Créer les indicator values pour l'acteur économique (valeurs vides)
          const actorIndicatorValues = [];
          for (const indicator of indicators) {
            if (indicator.presence_in_excel?.prev !== true) continue;

            const defaultValue = indicator.value_default?.prev?.[indicator.value_type] ?? null;

            // Trouver l'IV de la collectivité correspondant pour le lien
            const collectivityIV = insertedCollectivityIVs.find((iv) => iv.indicator_id.toString() === indicator._id.toString());

            actorIndicatorValues.push({
              action_id: actorAction._id,
              action_name: actorAction.name,
              collectivity_id: actorAction.collectivity_id,
              collectivity_name: actorAction.collectivity_name,
              owner: 'economic_actor',
              economic_actor_id: actorAction.economic_actor_id,
              economic_actor_name: actorAction.economic_actor_name,
              indicator_id: indicator._id,
              indicator_name: indicator.name,
              indicator_type: indicator.value_type,
              situation: 'prev',
              year: year_prev,
              year_init: actorAction.year_init,
              year_ref: actorAction.year_ref,
              year_prev: year_prev,
              year_expost: actorAction.year_expost,
              excel_line_number: indicator.excel_line_number?.prev,
              indicator_value_unit: indicator.value_unit,
              value_default: { [indicator.value_type]: defaultValue },
              indicator_value_possibilities: indicator.value_possibilities || [],
              indicator_category_id: indicator.indicator_category_id,
              indicator_category_name: indicator.indicator_category_name,
              indicator_sub_category_id: indicator.indicator_sub_category_id,
              indicator_sub_category_name: indicator.indicator_sub_category_name,
              indicator_excel_id: indicator.excel_indicator_id,
              indicator_value_collectivity_id: collectivityIV?._id,
              value: { text: null, number: null, radio: null, checkbox: [] },
              display_condition:
                indicator.display_condition?.prev?.operator || indicator.display_condition?.prev?.conditions?.length ? indicator.display_condition.prev : undefined,
            });
          }

          if (actorIndicatorValues.length > 0) await IndicatorValue.insertMany(actorIndicatorValues);

          await updateExcelCellByIndicatorId(actorExcelFileId, 'AnneeRempl', year_prev, 'prev');
        } catch (error) {
          capture(error);
          continue;
        }
      }
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
    const sourceExcelId = action.excel_files_expost?.[0]?.excel_file_id || action.excel_files?.[0]?.excel_file_id || null;
    const excelFileId = await duplicateExcelFile(excelFileName, collectivity.sharepoint_folder_id, sourceExcelId);

    // Ajouter le nouveau fichier Excel à l'action
    action.excel_files_expost = action.excel_files_expost || [];
    action.excel_files_expost.push({ year_expost, excel_file_id: excelFileId });
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
      const existingConfigIV = await IndicatorValue.findOne({
        action_id: { $in: [configActionBasicData?._id?.toString(), configActionParcTypes?._id?.toString()].filter(Boolean) },
        situation: 'expost',
        year: year_expost,
      });

      if (!existingConfigIV) {
        const configIndicators = await Indicator.find({ $or: [{ linked_action_id: null }, { linked_action_id: { $exists: false } }] });
        const configIndicatorValues = [];

        for (const indicator of configIndicators) {
          if (indicator.presence_in_excel?.expost !== true) continue;

          const configAction = indicator.indicator_category_name === 'Données de base' ? configActionBasicData : configActionParcTypes;
          if (!configAction) continue;

          const defaultValue = indicator.value_default?.expost?.[indicator.value_type] ?? null;
          const isParcTypes = configAction.name === 'Parc types';

          const iv = {
            action_id: configAction._id,
            action_name: configAction.name,
            collectivity_id: action.collectivity_id,
            collectivity_name: action.collectivity_name,
            owner: action.owner,
            indicator_id: indicator._id,
            indicator_name: indicator.name,
            indicator_type: indicator.value_type,
            situation: 'expost',
            year: year_expost,
            year_init: action.year_init,
            year_ref: action.year_ref,
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
            excel_line_number: indicator.excel_line_number?.expost,
          };

          if (isParcTypes) iv.value = { [indicator.value_type]: defaultValue };
          if (action.owner === 'economic_actor') {
            iv.economic_actor_id = action.economic_actor_id;
            iv.economic_actor_name = action.economic_actor_name;
          }

          const displayCondition = indicator.display_condition?.expost;
          if (displayCondition?.operator || displayCondition?.conditions?.length) iv.display_condition = displayCondition;
          configIndicatorValues.push(iv);
        }

        if (configIndicatorValues.length > 0) await IndicatorValue.insertMany(configIndicatorValues);

        // Mettre à jour ActionsCharte/ActionsAutres pour la nouvelle année expost
        if (configActionBasicData) {
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
                await IndicatorValue.findOneAndUpdate(
                  { action_id: configActionBasicData._id, indicator_excel_id: targetExcelId, situation: 'expost', year: year_expost },
                  { 'value.checkbox': existingIV.value.checkbox },
                  { new: true },
                );
              }
            }
          }

          // Mettre à jour l'indicateur AnneeRempl pour la nouvelle année expost dans les config
          await IndicatorValue.findOneAndUpdate(
            { action_id: configActionBasicData._id, indicator_excel_id: 'AnneeRempl', situation: 'expost', year: year_expost },
            { 'value.number': year_expost },
            { new: true },
          );
        }
      }
    }

    // Créer les indicator values pour la nouvelle situation expost
    const parentAction = await Action.findById(action.action_parent_id);
    const indicators = await Indicator.find({ linked_action_id: parentAction?._id || action.action_parent_id });
    const createdIndicatorValues = [];

    for (const indicator of indicators) {
      if (indicator.presence_in_excel?.expost !== true) continue;

      const defaultValue = indicator.value_default?.expost?.[indicator.value_type] ?? null;
      const indicatorValue = {
        action_id: action._id,
        action_name: action.name,
        collectivity_id: action.collectivity_id,
        collectivity_name: action.collectivity_name,
        owner: action.owner,
        indicator_id: indicator._id,
        indicator_name: indicator.name,
        indicator_type: indicator.value_type,
        situation: 'expost',
        year: year_expost,
        year_init: action.year_init,
        year_ref: action.year_ref,
        year_prev: action.year_prev,
        year_expost: year_expost,
        excel_line_number: indicator.excel_line_number?.expost,
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
        const collectivityIV = await IndicatorValue.findOne({
          collectivity_id: action.collectivity_id,
          indicator_id: indicator._id,
          situation: 'expost',
          year: year_expost,
          owner: 'collectivity',
        });
        if (collectivityIV) indicatorValue.indicator_value_collectivity_id = collectivityIV._id;
        indicatorValue.value = { text: null, number: null, radio: null, checkbox: [] };
      }

      const displayCondition = indicator.display_condition?.expost;
      if (displayCondition?.operator || displayCondition?.conditions?.length) indicatorValue.display_condition = displayCondition;
      createdIndicatorValues.push(indicatorValue);
    }

    let insertedCollectivityIVs = [];
    if (createdIndicatorValues.length > 0) insertedCollectivityIVs = await IndicatorValue.insertMany(createdIndicatorValues);

    // Mettre à jour l'indicateur AnneeRempl avec la nouvelle année expost dans l'Excel
    if (excelFileId) await updateExcelCellByIndicatorId(excelFileId, 'AnneeRempl', year_expost, 'expost');

    // Si c'est une action de collectivité, propager l'ajout de l'année expost aux acteurs économiques
    if (action.owner === 'collectivity') {
      const economicActorActions = await Action.find({ action_collectivity_id: action._id, owner: 'economic_actor' });

      for (const actorAction of economicActorActions) {
        try {
          // Vérifier si cette année expost existe déjà pour l'acteur
          const actorExistingExpost = actorAction.excel_files_expost?.find((f) => f.year_expost === year_expost);
          if (actorExistingExpost) continue;

          // Créer le fichier Excel pour l'acteur économique
          const actorExcelFileId = await duplicateExcelFile(
            `${actorAction.economic_actor_name}_${actorAction.name}_Expost${year_expost}.xlsx`,
            collectivity.sharepoint_folder_id,
            excelFileId,
          );

          // Ajouter le fichier Excel à l'action de l'acteur
          actorAction.excel_files_expost = actorAction.excel_files_expost || [];
          actorAction.excel_files_expost.push({ year_expost, excel_file_id: actorExcelFileId });
          await actorAction.save();

          // Créer les indicator values pour l'acteur économique (valeurs vides)
          const actorIndicatorValues = [];
          for (const indicator of indicators) {
            if (indicator.presence_in_excel?.expost !== true) continue;

            const defaultValue = indicator.value_default?.expost?.[indicator.value_type] ?? null;
            const collectivityIV = insertedCollectivityIVs.find((iv) => iv.indicator_id.toString() === indicator._id.toString());

            actorIndicatorValues.push({
              action_id: actorAction._id,
              action_name: actorAction.name,
              collectivity_id: actorAction.collectivity_id,
              collectivity_name: actorAction.collectivity_name,
              owner: 'economic_actor',
              economic_actor_id: actorAction.economic_actor_id,
              economic_actor_name: actorAction.economic_actor_name,
              indicator_id: indicator._id,
              indicator_name: indicator.name,
              indicator_type: indicator.value_type,
              situation: 'expost',
              year: year_expost,
              year_expost: year_expost,
              excel_line_number: indicator.excel_line_number?.expost,
              indicator_value_unit: indicator.value_unit,
              value_default: { [indicator.value_type]: defaultValue },
              indicator_value_possibilities: indicator.value_possibilities || [],
              indicator_category_id: indicator.indicator_category_id,
              indicator_category_name: indicator.indicator_category_name,
              indicator_sub_category_id: indicator.indicator_sub_category_id,
              indicator_sub_category_name: indicator.indicator_sub_category_name,
              indicator_excel_id: indicator.excel_indicator_id,
              indicator_value_collectivity_id: collectivityIV?._id,
              value: { text: null, number: null, radio: null, checkbox: [] },
              display_condition:
                indicator.display_condition?.expost?.operator || indicator.display_condition?.expost?.conditions?.length ? indicator.display_condition.expost : undefined,
            });
          }

          if (actorIndicatorValues.length > 0) await IndicatorValue.insertMany(actorIndicatorValues);

          await updateExcelCellByIndicatorId(actorExcelFileId, 'AnneeRempl', year_expost, 'expost');
        } catch (error) {
          capture(error);
          continue;
        }
      }
    }

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
