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
const { updateExcelCellByIndicatorId, updateExcelCellsBatch, duplicateExcelFile, clearWorksheetValues, graphFetch, sharePointSiteName, readExcelDefaultValues, createFolder } = require('../services/microsoftGraph');
const { computeActionCompletion } = require('../utils/completion');

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
    let query = { owner: 'collectivity', type: { $ne: 'config' } };

    if (req.body.collectivity_id) query.collectivity_id = req.body.collectivity_id;
    if (req.body.action_parent_id) query.action_parent_id = req.body.action_parent_id;
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
    if (!req.body.action_parent_id) return res.status(400).send({ ok: false, code: ERROR_CODES.INVALID_BODY });
    if (!req.body.year_init) return res.status(400).send({ ok: false, code: ERROR_CODES.INVALID_BODY });
    if (!req.body.year_prev) return res.status(400).send({ ok: false, code: ERROR_CODES.INVALID_BODY });
    if (!req.body.year_expost) return res.status(400).send({ ok: false, code: ERROR_CODES.INVALID_BODY });

    const parentAction = await Action.findById(req.body.action_parent_id);
    if (!parentAction) return res.status(404).send({ ok: false, code: ERROR_CODES.NOT_FOUND });

    const collectivity = await Collectivity.findById(req.body.collectivity_id);
    if (!collectivity) return res.status(404).send({ ok: false, code: ERROR_CODES.NOT_FOUND });

    if (!collectivity.sharepoint_folder_id) {
      collectivity.sharepoint_folder_id = await createFolder(collectivity.name);
      const AGGREGATION_TEMPLATE_FILE_ID = '01IBL4ADOUOXHM475PNZALWXNQOJOSDTIV';
      collectivity.aggregation_excel_file_id = await duplicateExcelFile(`${collectivity.name} - Aggregation.xlsx`, collectivity.sharepoint_folder_id, AGGREGATION_TEMPLATE_FILE_ID);
      await collectivity.save();
    }

    const isEconomicActor = req.body.owner === 'economic_actor' && req.body.economic_actor_id;

    // Compute instance_number for this action
    const instanceQuery = {
      action_parent_id: req.body.action_parent_id,
      collectivity_id: collectivity._id.toString(),
      owner: isEconomicActor ? 'economic_actor' : 'collectivity',
      type: { $ne: 'config' },
      ...(isEconomicActor ? { economic_actor_id: req.body.economic_actor_id } : {}),
    };
    const existingInstances = await Action.find(instanceQuery);
    const usedNumbers = existingInstances.map((a) => a.instance_number || 1);
    let instance_number = 1;
    while (usedNumbers.includes(instance_number)) instance_number++;
    if (instance_number > 3) return res.status(400).send({ ok: false, code: ERROR_CODES.MAX_INSTANCES_REACHED });

    const existingActionSameYearQuery = {
      collectivity_id: collectivity._id,
      year_init: req.body.year_init,
      owner: isEconomicActor ? 'economic_actor' : 'collectivity',
      ...(isEconomicActor ? { economic_actor_id: req.body.economic_actor_id } : {}),
    };
    const [existingActionPrev, existingActionExpost] = await Promise.all([
      Action.findOne({ ...existingActionSameYearQuery, 'exel_files_prev.0.excel_file_id': { $exists: true } }),
      Action.findOne({ ...existingActionSameYearQuery, 'excel_files_expost.0.excel_file_id': { $exists: true } }),
    ]);

    // Créer 2 fichiers Excel : un pour prev, un pour expost
    const sourceExcelIdPrev = existingActionPrev?.exel_files_prev?.[0]?.excel_file_id || null;
    const sourceExcelIdExpost = existingActionExpost?.excel_files_expost?.[0]?.excel_file_id || null;
    const instanceSuffix = instance_number > 1 ? `_${instance_number}` : '';
    const excelFileNamePrev = isEconomicActor ? `${req.body.economic_actor_name}_${req.body.name}${instanceSuffix}_Prev${req.body.year_prev}.xlsx` : `${req.body.name}${instanceSuffix}_Prev${req.body.year_prev}.xlsx`;
    const excelFileNameExpost = isEconomicActor ? `${req.body.economic_actor_name}_${req.body.name}${instanceSuffix}_Expost${req.body.year_expost}.xlsx` : `${req.body.name}${instanceSuffix}_Expost${req.body.year_expost}.xlsx`;
    const [excelFileIdPrev, excelFileIdExpost] = await Promise.all([duplicateExcelFile(excelFileNamePrev, collectivity.sharepoint_folder_id, sourceExcelIdPrev), duplicateExcelFile(excelFileNameExpost, collectivity.sharepoint_folder_id, sourceExcelIdExpost)]);

    // Nettoyer les sheets inutiles dans chaque fichier
    await Promise.all([clearWorksheetValues(excelFileIdPrev, 'expost'), clearWorksheetValues(excelFileIdExpost, 'prev')]);

    // Vider les cellules des indicateurs liés à l'action parent (données spécifiques à l'ancienne action)
    const clearUpdates = (await Indicator.find({ linked_action_id: parentAction._id })).filter((ind) => ind.excel_indicator_id).map((ind) => ({ excel_indicator_id: ind.excel_indicator_id, value: '' }));
    if (clearUpdates.length > 0) {
      await Promise.all([...['init', 'ref', 'prev'].map((s) => updateExcelCellsBatch(excelFileIdPrev, clearUpdates, s).catch(capture)), ...['init', 'ref', 'expost'].map((s) => updateExcelCellsBatch(excelFileIdExpost, clearUpdates, s).catch(capture))]);
    }

    // Créer l'action
    const action = await Action.create({
      ...req.body,
      instance_number,
      excel_worksheetname: parentAction.excel_worksheetname,
      exel_files_prev: [{ year_prev: req.body.year_prev, year_ref: req.body.year_prev, excel_file_id: excelFileIdPrev }],
      excel_files_expost: [{ year_expost: req.body.year_expost, year_ref: req.body.year_expost, excel_file_id: excelFileIdExpost }],
      last_modif_by_id: req.user._id,
      last_modif_by_name: req.user.name,
      last_modif_by_email: req.user.email,
      last_modif_date: new Date(),
    });
    if (!action) return res.status(400).send({ ok: false, code: ERROR_CODES.INVALID_BODY });

    // Vérifier si les actions config existent déjà
    const configQuery = { collectivity_id: collectivity._id, type: 'config', owner: isEconomicActor ? 'economic_actor' : 'collectivity', ...(isEconomicActor ? { economic_actor_id: req.body.economic_actor_id } : {}) };
    let [configActionBasicDataObj, configActionParcTypesObj] = await Promise.all([Action.findOne({ ...configQuery, name: 'Données de base' }), Action.findOne({ ...configQuery, name: 'Parc types' })]);

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
        { situation: 'ref', year: req.body.year_prev },
        ...(req.body.year_expost !== req.body.year_prev ? [{ situation: 'ref', year: req.body.year_expost }] : []),
        { situation: 'prev', year: req.body.year_prev },
        { situation: 'expost', year: req.body.year_expost },
      ],
    });
    const existingSituationKeys = new Set(existingConfigIVs.map((iv) => `${iv.situation}_${iv.year}`));

    let configIndicatorValues = [];
    {
      // Créer les indicator values pour les actions config (indicateurs sans action liée)
      const indicators = await Indicator.find({ $or: [{ linked_action_id: null }, { linked_action_id: { $exists: false } }] });
      const parcTypesDefaultValues = { init: [], ref: [], prev: [], expost: [] };

      // Paires situation/année : ref a 2 entrées si year_expost != year_prev
      const situationYearPairs = [
        { situation: 'init', year: req.body.year_init },
        { situation: 'ref', year: req.body.year_prev },
        { situation: 'prev', year: req.body.year_prev },
        { situation: 'expost', year: req.body.year_expost },
      ];
      if (req.body.year_expost !== req.body.year_prev) situationYearPairs.push({ situation: 'ref', year: req.body.year_expost });

      for (const indicator of indicators) {
        const pairs = situationYearPairs.filter((p) => indicator.presence_in_excel?.[p.situation] === true);
        const configAction = indicator.indicator_category_name === 'Données de base' ? configActionBasicDataObj : configActionParcTypesObj;

        for (const { situation, year } of pairs) {
          if (existingSituationKeys.has(`${situation}_${year}`)) continue;

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
            year,
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

          if (configAction.name === 'Parc types') {
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

      // Collecter les valeurs des IVs Données de base déjà existantes pour les écrire dans le nouvel Excel
      const existingBasicDataValues = { init: [], ref: [], prev: [], expost: [] };
      const existingBasicDataIVs = existingConfigIVs.filter((iv) => iv.action_id.toString() === configActionBasicDataObj._id.toString());
      for (const iv of existingBasicDataIVs) {
        if (iv.indicator_excel_id && iv.value) {
          if (iv.value[iv.indicator_type] !== null && iv.value[iv.indicator_type] !== undefined) existingBasicDataValues[iv.situation].push({ excel_indicator_id: iv.indicator_excel_id, value: iv.value[iv.indicator_type] });
        }
      }

      // Update Excel with Parc types + Données de base values in batch — écrire dans les 2 fichiers
      const excelBatchPromises = [];
      for (const situation of ['init', 'ref', 'prev']) {
        if (parcTypesDefaultValues[situation].length > 0) excelBatchPromises.push(updateExcelCellsBatch(excelFileIdPrev, parcTypesDefaultValues[situation], situation).catch(capture));
        if (existingBasicDataValues[situation].length > 0) excelBatchPromises.push(updateExcelCellsBatch(excelFileIdPrev, existingBasicDataValues[situation], situation).catch(capture));
      }
      for (const situation of ['init', 'ref', 'expost']) {
        if (parcTypesDefaultValues[situation].length > 0) excelBatchPromises.push(updateExcelCellsBatch(excelFileIdExpost, parcTypesDefaultValues[situation], situation).catch(capture));
        if (existingBasicDataValues[situation].length > 0) excelBatchPromises.push(updateExcelCellsBatch(excelFileIdExpost, existingBasicDataValues[situation], situation).catch(capture));
      }
      await Promise.all(excelBatchPromises);
    }

    // Créer les indicator values pour l'action principale
    const indicators = await Indicator.find({ linked_action_id: parentAction._id });

    // Paires situation/année pour l'action (ref a 2 entrées si year_expost != year_prev)
    const actionSituationYearPairs = [
      { situation: 'init', year: req.body.year_init },
      { situation: 'ref', year: req.body.year_prev },
      { situation: 'prev', year: req.body.year_prev },
      { situation: 'expost', year: req.body.year_expost },
    ];
    if (req.body.year_expost !== req.body.year_prev) actionSituationYearPairs.push({ situation: 'ref', year: req.body.year_expost });

    const createdIndicatorValues = [];

    for (const indicator of indicators) {
      const pairs = actionSituationYearPairs.filter((p) => indicator.presence_in_excel?.[p.situation] === true);
      for (const { situation, year } of pairs) {
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
          year,
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

      // init + expost : récupérer les 2 IVs en parallèle
      const [ivInit, ivExpost] = await Promise.all([
        IndicatorValue.findOneAndUpdate({ action_id: configActionBasicDataObj._id, indicator_excel_id: targetExcelId, situation: 'init', year: req.body.year_init }, { $addToSet: { 'value.checkbox': parentAction.excel_worksheetname } }, { new: true }),
        IndicatorValue.findOneAndUpdate({ action_id: configActionBasicDataObj._id, indicator_excel_id: targetExcelId, situation: 'expost', year: req.body.year_expost }, { $addToSet: { 'value.checkbox': parentAction.excel_worksheetname } }, { new: true }),
      ]);

      // Écrire dans les fichiers Excel en parallèle
      const excelWritePromises = [];
      if (ivInit) {
        if (excelFileIdPrev) excelWritePromises.push(updateExcelCellByIndicatorId(excelFileIdPrev, targetExcelId, ivInit.value?.checkbox, 'init'));
        if (excelFileIdExpost) excelWritePromises.push(updateExcelCellByIndicatorId(excelFileIdExpost, targetExcelId, ivInit.value?.checkbox, 'init'));
      }
      if (ivExpost && excelFileIdExpost) excelWritePromises.push(updateExcelCellByIndicatorId(excelFileIdExpost, targetExcelId, ivExpost.value?.checkbox, 'expost'));
      if (excelWritePromises.length > 0) await Promise.all(excelWritePromises);

      // Écriture des années dans les 2 fichiers Excel
      const anneeExcelIds = { init: 'AnneeRempl', ref: 'AnRef', prev: 'AnneeRempl', expost: 'AnneeRempl' };

      const configActionIds = [configActionBasicDataObj._id, ...(configActionParcTypesObj ? [configActionParcTypesObj._id] : [])];

      // Fichier Prev : init→year_init, ref→year_prev, prev→year_prev
      const prevFileYears = [
        { situation: 'init', year: req.body.year_init },
        { situation: 'ref', year: req.body.year_prev },
        { situation: 'prev', year: req.body.year_prev },
      ];
      // Fichier Expost : init→year_init, ref→year_expost, expost→year_expost
      const expostFileYears = [
        { situation: 'init', year: req.body.year_init },
        { situation: 'ref', year: req.body.year_expost },
        { situation: 'expost', year: req.body.year_expost },
      ];

      // Toutes les mises à jour DB des années en parallèle
      const allYearEntries = [...new Set([...prevFileYears, ...expostFileYears].map((e) => JSON.stringify(e)))].map((e) => JSON.parse(e));
      const yearDbUpdates = [];
      for (const { situation, year } of allYearEntries) {
        const excelId = anneeExcelIds[situation];
        for (const configId of configActionIds) {
          yearDbUpdates.push(IndicatorValue.findOneAndUpdate({ action_id: configId, indicator_excel_id: excelId, situation, year }, { 'value.number': year }, { new: true }));
        }
      }
      await Promise.all(yearDbUpdates);

      // Écriture des infos collectivité dans les 2 fichiers Excel
      const collectivityFieldsMapping = [
        { excel_indicator_id: 'NomTerr', value: collectivity.name, value_type: 'text' },
        { excel_indicator_id: 'SIRENTerr', value: collectivity.siren, value_type: 'number' },
        { excel_indicator_id: 'SupTerr', value: collectivity.area, value_type: 'number' },
      ].filter((f) => f.value !== null && f.value !== undefined);

      if (collectivityFieldsMapping.length > 0) {
        // Situations collectivité : init et expost uniquement
        const collectivitySituations = allYearEntries.filter(({ situation }) => situation === 'init' || situation === 'expost');

        // Mises à jour DB des infos collectivité en parallèle
        const collectivityDbUpdates = [];
        for (const { situation, year } of collectivitySituations) {
          for (const configId of configActionIds) {
            for (const { excel_indicator_id, value, value_type } of collectivityFieldsMapping) {
              collectivityDbUpdates.push(IndicatorValue.findOneAndUpdate({ action_id: configId, indicator_excel_id: excel_indicator_id, situation, year }, { [`value.${value_type}`]: value }, { new: true }));
            }
          }
        }
        await Promise.all(collectivityDbUpdates);
      }

      // Toutes les écritures Excel (années + collectivité) en parallèle
      const excelWrites = [];
      if (excelFileIdPrev) {
        for (const { situation, year } of prevFileYears) {
          excelWrites.push(updateExcelCellByIndicatorId(excelFileIdPrev, anneeExcelIds[situation], year, situation));
        }
        for (const { excel_indicator_id, value } of collectivityFieldsMapping) {
          excelWrites.push(updateExcelCellByIndicatorId(excelFileIdPrev, excel_indicator_id, value, 'init'));
        }
      }
      if (excelFileIdExpost) {
        for (const { situation, year } of expostFileYears) {
          excelWrites.push(updateExcelCellByIndicatorId(excelFileIdExpost, anneeExcelIds[situation], year, situation));
        }
        for (const { excel_indicator_id, value } of collectivityFieldsMapping) {
          excelWrites.push(updateExcelCellByIndicatorId(excelFileIdExpost, excel_indicator_id, value, 'init'));
          excelWrites.push(updateExcelCellByIndicatorId(excelFileIdExpost, excel_indicator_id, value, 'expost'));
        }
      }
      if (excelWrites.length > 0) await Promise.all(excelWrites);
    }

    // Relire les valeurs par défaut depuis l'Excel (recalculées après écriture des années et infos collectivité)
    const [prevInitDefaults, prevRefDefaults, prevPrevDefaults, expostRefDefaults, expostExpostDefaults] = await Promise.all([
      readExcelDefaultValues(excelFileIdPrev, 'init').catch(() => new Map()),
      readExcelDefaultValues(excelFileIdPrev, 'ref').catch(() => new Map()),
      readExcelDefaultValues(excelFileIdPrev, 'prev').catch(() => new Map()),
      readExcelDefaultValues(excelFileIdExpost, 'ref').catch(() => new Map()),
      readExcelDefaultValues(excelFileIdExpost, 'expost').catch(() => new Map()),
    ]);

    const getDefaultsForSituation = (situation, year) => {
      if (situation === 'init') return prevInitDefaults;
      if (situation === 'prev') return prevPrevDefaults;
      if (situation === 'expost') return expostExpostDefaults;
      if (situation === 'ref') return year === req.body.year_expost && req.body.year_expost !== req.body.year_prev ? expostRefDefaults : prevRefDefaults;
      return new Map();
    };

    const parseDefaultValue = (rawValue, indicatorType) => {
      if (rawValue === null || rawValue === undefined || rawValue === '') return null;
      if (typeof rawValue === 'string' && rawValue.startsWith('#')) return null;
      if (indicatorType === 'number') {
        const p = parseFloat(rawValue);
        return !isNaN(p) ? p : null;
      }
      if (indicatorType === 'text' || indicatorType === 'radio') return String(rawValue).trim() || null;
      if (indicatorType === 'checkbox')
        return String(rawValue)
          .split(',')
          .map((v) => v.trim())
          .filter((v) => v !== '');
      return null;
    };

    // Récupérer tous les IVs des actions créées pour mettre à jour leurs valeurs par défaut
    const allActionIdsForDefaultUpdate = [action._id.toString(), configActionBasicDataObj._id.toString(), configActionParcTypesObj._id.toString()];
    const allIVsForDefaultUpdate = await IndicatorValue.find({
      action_id: { $in: allActionIdsForDefaultUpdate },
      indicator_excel_id: { $exists: true, $ne: null },
      $or: [
        { situation: 'init', year: req.body.year_init },
        { situation: 'ref', year: req.body.year_prev },
        ...(req.body.year_expost !== req.body.year_prev ? [{ situation: 'ref', year: req.body.year_expost }] : []),
        { situation: 'prev', year: req.body.year_prev },
        { situation: 'expost', year: req.body.year_expost },
      ],
    });

    const defaultUpdateBulkOps = [];
    const parcTypesNewValues = { init: [], ref: [], prev: [], expost: [] };

    for (const iv of allIVsForDefaultUpdate) {
      const defaultsMap = getDefaultsForSituation(iv.situation, iv.year);
      if (!defaultsMap || !defaultsMap.has(iv.indicator_excel_id)) continue;

      const newDefault = parseDefaultValue(defaultsMap.get(iv.indicator_excel_id), iv.indicator_type);
      const currentDefault = iv.value_default?.[iv.indicator_type] ?? null;
      if (JSON.stringify(newDefault) === JSON.stringify(currentDefault)) continue;

      const updateFields = { [`value_default.${iv.indicator_type}`]: newDefault };

      if (iv.action_name === 'Parc types') {
        updateFields[`value.${iv.indicator_type}`] = newDefault;
        if (newDefault !== null && iv.indicator_excel_id) {
          parcTypesNewValues[iv.situation].push({ excel_indicator_id: iv.indicator_excel_id, value: newDefault });
        }
      }

      defaultUpdateBulkOps.push({ updateOne: { filter: { _id: iv._id }, update: { $set: updateFields } } });
    }

    if (defaultUpdateBulkOps.length > 0) {
      await IndicatorValue.bulkWrite(defaultUpdateBulkOps);

      // Réécrire les valeurs Parc types mises à jour dans les fichiers Excel
      const rewritePromises = [];
      for (const situation of ['init', 'ref', 'prev']) {
        if (parcTypesNewValues[situation].length > 0) rewritePromises.push(updateExcelCellsBatch(excelFileIdPrev, parcTypesNewValues[situation], situation).catch(capture));
      }
      for (const situation of ['init', 'ref', 'expost']) {
        if (parcTypesNewValues[situation].length > 0) rewritePromises.push(updateExcelCellsBatch(excelFileIdExpost, parcTypesNewValues[situation], situation).catch(capture));
      }
      await Promise.all(rewritePromises);
    }

    // Recalculer la completion pour l'action créée et les actions config
    await Promise.all([computeActionCompletion(action._id), configActionBasicDataObj ? computeActionCompletion(configActionBasicDataObj._id) : null, configActionParcTypesObj ? computeActionCompletion(configActionParcTypesObj._id) : null].filter(Boolean));

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

    // Delete Excel files from SharePoint
    const allExcelFileIds = [...new Set([...(action.exel_files_prev || []), ...(action.excel_files_expost || [])].map((f) => f.excel_file_id).filter(Boolean))];

    if (allExcelFileIds.length > 0) {
      const siteId = (await graphFetch(`/sites/${sharePointSiteName}.sharepoint.com`)).id;
      for (const fileId of allExcelFileIds) {
        try {
          await graphFetch(`/sites/${siteId}/drive/items/${fileId}`, { method: 'DELETE' });
        } catch (e) {
          console.error(`Failed to delete Excel file ${fileId}:`, e.message);
        }
      }
    }

    // Cleanup des indicator values config liées à cette action
    const configActions = await Action.find({ collectivity_id: action.collectivity_id, type: 'config', owner: action.owner, ...(action.owner === 'economic_actor' ? { economic_actor_id: action.economic_actor_id } : {}) });
    const configActionIds = configActions.map((a) => a._id.toString());
    const configActionBasicData = configActions.find((a) => a.name === 'Données de base');

    // Retirer l'excel_worksheetname de cette action des checkbox ActionsCharte/ActionsAutres
    if (configActionBasicData && action.excel_worksheetname) {
      const otherActionSameWorksheet = await Action.findOne({
        _id: { $ne: action._id },
        collectivity_id: action.collectivity_id,
        owner: action.owner,
        type: { $ne: 'config' },
        excel_worksheetname: action.excel_worksheetname,
        ...(action.owner === 'economic_actor' ? { economic_actor_id: action.economic_actor_id } : {}),
      });

      if (!otherActionSameWorksheet) await IndicatorValue.updateMany({ action_id: configActionBasicData._id.toString(), indicator_excel_id: { $in: ['ActionsCharte', 'ActionsAutres'] } }, { $pull: { 'value.checkbox': action.excel_worksheetname } });
    }

    // Supprimer les IVs de l'action
    await IndicatorValue.deleteMany({ action_id: req.params.id });

    // Vérifier quels config IVs sont orphelins en cherchant si une autre ACTION régulière référence encore cette année
    // (même logique que le PUT indicator_value qui trouve les actions par leurs champs year_init, exel_files_prev.year_prev, etc.)
    if (configActionIds.length > 0) {
      const configIVs = await IndicatorValue.find({ action_id: { $in: configActionIds } });
      const configPairs = [...new Set(configIVs.map((iv) => `${iv.situation}_${iv.year}`))];
      const ownerFilter = { owner: action.owner, ...(action.owner === 'economic_actor' ? { economic_actor_id: action.economic_actor_id } : {}) };
      const baseQuery = { collectivity_id: action.collectivity_id, type: { $ne: 'config' }, _id: { $ne: action._id }, ...ownerFilter };

      for (const pair of configPairs) {
        const [situation, year] = pair.split('_');
        const yearNum = parseInt(year);

        let otherAction = null;
        if (situation === 'init') otherAction = await Action.findOne({ ...baseQuery, year_init: yearNum });
        if (situation === 'prev') otherAction = await Action.findOne({ ...baseQuery, 'exel_files_prev.year_prev': yearNum });
        if (situation === 'expost') otherAction = await Action.findOne({ ...baseQuery, 'excel_files_expost.year_expost': yearNum });
        if (situation === 'ref') otherAction = await Action.findOne({ ...baseQuery, $or: [{ 'exel_files_prev.year_ref': yearNum }, { 'excel_files_expost.year_ref': yearNum }] });

        if (!otherAction) await IndicatorValue.deleteMany({ action_id: { $in: configActionIds }, situation, year: yearNum });
      }

      // Supprimer les actions config qui n'ont plus d'indicator values
      for (const configAction of configActions) {
        const remainingIVs = await IndicatorValue.countDocuments({ action_id: configAction._id.toString() });
        if (remainingIVs === 0) await Action.deleteOne({ _id: configAction._id });
      }
    }

    // Clear aggregation Excel values for this action in "1. Données d'entrée"
    if (action.excel_worksheetname && action.type !== 'config') {
      try {
        let aggregationFileId;
        if (action.owner === 'economic_actor' && action.economic_actor_id) {
          const actor = await EconomicActor.findById(action.economic_actor_id);
          const coll = actor?.collectivities?.find((c) => c.id === action.collectivity_id);
          aggregationFileId = coll?.aggregation_excel_file_id;
        } else {
          const collectivityDoc = await Collectivity.findById(action.collectivity_id);
          aggregationFileId = collectivityDoc?.aggregation_excel_file_id;
        }
        if (aggregationFileId) {
          const siteId = (await graphFetch(`/sites/${sharePointSiteName}.sharepoint.com`)).id;
          const sheetPath = `/sites/${siteId}/drive/items/${aggregationFileId}/workbook/worksheets/${encodeURIComponent("1. Données d'entrée")}`;
          const usedRange = await graphFetch(`${sheetPath}/usedRange`);
          const rows = usedRange.values || [];
          const startRow = parseInt(usedRange.address?.match(/\d+/)?.[0] || 1);
          const col = String.fromCharCode(72 + (action.instance_number || 1));
          const colIdx = col.charCodeAt(0) - (usedRange.address?.match(/([A-Z]+)/)?.[1] || 'A').charCodeAt(0);

          const matched = new Set();
          for (let i = 0; i < rows.length; i++) {
            if (rows[i][1] && String(rows[i][1]).trim().startsWith(`${action.excel_worksheetname}-`)) matched.add(i);
          }

          if (matched.size > 0) {
            const min = Math.min(...matched);
            const max = Math.max(...matched);
            const values = Array.from({ length: max - min + 1 }, (_, i) => [matched.has(min + i) ? '' : (rows[min + i]?.[colIdx] ?? '')]);

            await graphFetch(`${sheetPath}/range(address='${col}${startRow + min}:${col}${startRow + max}')`, {
              method: 'PATCH',
              body: JSON.stringify({ values }),
            });
          }
        }
      } catch (e) {
        console.error('[Agrégation cleanup] Error:', e.message);
      }
    }

    await Action.deleteOne({ _id: req.params.id });

    return res.status(200).send({ ok: true });
  } catch (error) {
    capture(error);
    return res.status(500).send({ ok: false, code: ERROR_CODES.SERVER_ERROR });
  }
});

router.post('/add_year_previsionnel', passport.authenticate(['admin', 'user'], { session: false, failWithError: true }), async (req, res) => {
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
    const instanceSuffixPrev = action.instance_number > 1 ? `_${action.instance_number}` : '';
    let excelFileName = `${action.name}${instanceSuffixPrev}_Prev${year_prev}.xlsx`;
    if (action.owner === 'economic_actor' && action.economic_actor_name) excelFileName = `${action.economic_actor_name}_${action.name}${instanceSuffixPrev}_Prev${year_prev}.xlsx`;

    // Dupliquer l'Excel depuis le premier fichier existant de cette action
    const sourceExcelId = action.exel_files_prev?.[0]?.excel_file_id || null;
    const excelFileId = await duplicateExcelFile(excelFileName, collectivity.sharepoint_folder_id, sourceExcelId);

    // Vider les feuilles init et expost du nouveau fichier Excel
    await clearWorksheetValues(excelFileId, 'expost');

    // Vider les cellules des indicateurs liés à l'action parent (données spécifiques à l'ancienne année)
    const clearUpdatesPrev = (await Indicator.find({ linked_action_id: action.action_parent_id })).filter((ind) => ind.excel_indicator_id).map((ind) => ({ excel_indicator_id: ind.excel_indicator_id, value: '' }));
    if (clearUpdatesPrev.length > 0) {
      await Promise.all(['ref', 'prev'].map((s) => updateExcelCellsBatch(excelFileId, clearUpdatesPrev, s).catch(capture)));
    }

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

    // Écrire les valeurs config existantes (Données de base + Parc types) dans le nouveau fichier Excel
    {
      const parcTypesValues = { ref: [], prev: [] };
      const basicDataValues = { ref: [], prev: [] };

      if (configActionParcTypes) {
        const existingParcIVs = await IndicatorValue.find({ action_id: configActionParcTypes._id, situation: { $in: ['ref', 'prev'] }, year: year_prev });
        for (const iv of existingParcIVs) {
          if (iv.indicator_excel_id && iv.value && iv.value[iv.indicator_type] !== null && iv.value[iv.indicator_type] !== undefined) {
            parcTypesValues[iv.situation].push({ excel_indicator_id: iv.indicator_excel_id, value: iv.value[iv.indicator_type] });
          }
        }
      }
      if (configActionBasicData) {
        const existingBasicIVs = await IndicatorValue.find({ action_id: configActionBasicData._id, situation: { $in: ['ref', 'prev'] }, year: year_prev });
        for (const iv of existingBasicIVs) {
          if (iv.indicator_excel_id && !['ActionsCharte', 'ActionsAutres'].includes(iv.indicator_excel_id) && iv.value && iv.value[iv.indicator_type] !== null && iv.value[iv.indicator_type] !== undefined) {
            basicDataValues[iv.situation].push({ excel_indicator_id: iv.indicator_excel_id, value: iv.value[iv.indicator_type] });
          }
        }
      }

      const excelWritePromises = [];
      for (const situation of ['ref', 'prev']) {
        if (parcTypesValues[situation].length > 0) excelWritePromises.push(updateExcelCellsBatch(excelFileId, parcTypesValues[situation], situation).catch(capture));
        if (basicDataValues[situation].length > 0) excelWritePromises.push(updateExcelCellsBatch(excelFileId, basicDataValues[situation], situation).catch(capture));
      }
      if (excelWritePromises.length > 0) await Promise.all(excelWritePromises);
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

    if (createdPrevIndicatorValues.length > 0) await IndicatorValue.insertMany(createdPrevIndicatorValues);
    if (createdRefIndicatorValues.length > 0) await IndicatorValue.insertMany(createdRefIndicatorValues);

    // Mettre à jour l'indicateur AnPrev avec la nouvelle année prévisionnelle dans l'Excel
    if (excelFileId) await updateExcelCellByIndicatorId(excelFileId, 'AnneeRempl', year_prev, 'prev');

    // Mettre à jour l'indicateur AnRef avec la nouvelle année de référence (= year_prev) dans l'Excel
    if (excelFileId) await updateExcelCellByIndicatorId(excelFileId, 'AnRef', year_prev, 'ref');

    // Recalculer la completion pour l'action et les actions config
    await computeActionCompletion(action._id);
    if (configActionBasicData) await computeActionCompletion(configActionBasicData._id);
    if (configActionParcTypes) await computeActionCompletion(configActionParcTypes._id);

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

router.post('/add_year_expost', passport.authenticate(['admin', 'user'], { session: false, failWithError: true }), async (req, res) => {
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
    const instanceSuffixExpost = action.instance_number > 1 ? `_${action.instance_number}` : '';
    let excelFileName = `${action.name}${instanceSuffixExpost}_Expost${year_expost}.xlsx`;
    if (action.owner === 'economic_actor' && action.economic_actor_name) excelFileName = `${action.economic_actor_name}_${action.name}${instanceSuffixExpost}_Expost${year_expost}.xlsx`;

    // Dupliquer l'Excel depuis le premier fichier expost existant de cette action
    const sourceExcelId = action.excel_files_expost?.[0]?.excel_file_id || null;
    const excelFileId = await duplicateExcelFile(excelFileName, collectivity.sharepoint_folder_id, sourceExcelId);

    // Vider les feuilles init et prev du nouveau fichier Excel
    await clearWorksheetValues(excelFileId, 'prev');

    // Vider les cellules des indicateurs liés à l'action parent (données spécifiques à l'ancienne année)
    const clearUpdatesExpost = (await Indicator.find({ linked_action_id: action.action_parent_id })).filter((ind) => ind.excel_indicator_id).map((ind) => ({ excel_indicator_id: ind.excel_indicator_id, value: '' }));
    if (clearUpdatesExpost.length > 0) {
      await Promise.all(['ref', 'expost'].map((s) => updateExcelCellsBatch(excelFileId, clearUpdatesExpost, s).catch(capture)));
    }

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

        // Mettre à jour l'indicateur AnneeRempl pour la nouvelle année expost dans les config
        if (configActionBasicData && !existingConfigExpostIV) {
          await IndicatorValue.findOneAndUpdate({ action_id: configActionBasicData._id, indicator_excel_id: 'AnneeRempl', situation: 'expost', year: year_expost }, { 'value.number': year_expost }, { new: true });
        }

        // Mettre à jour AnRef pour la situation ref dans les config
        if (configActionBasicData && !existingConfigRefIV) {
          await IndicatorValue.findOneAndUpdate({ action_id: configActionBasicData._id, indicator_excel_id: 'AnRef', situation: 'ref', year: year_expost }, { 'value.number': year_expost }, { new: true });
        }
      }
    }

    // Écrire les valeurs config existantes (Données de base + Parc types) dans le nouveau fichier Excel
    {
      const parcTypesValues = { ref: [], expost: [] };
      const basicDataValues = { ref: [], expost: [] };

      if (configActionParcTypes) {
        const existingParcIVs = await IndicatorValue.find({ action_id: configActionParcTypes._id, situation: { $in: ['ref', 'expost'] }, year: year_expost });
        for (const iv of existingParcIVs) {
          if (iv.indicator_excel_id && iv.value && iv.value[iv.indicator_type] !== null && iv.value[iv.indicator_type] !== undefined) {
            parcTypesValues[iv.situation].push({ excel_indicator_id: iv.indicator_excel_id, value: iv.value[iv.indicator_type] });
          }
        }
      }
      if (configActionBasicData) {
        const existingBasicIVs = await IndicatorValue.find({ action_id: configActionBasicData._id, situation: { $in: ['ref', 'expost'] }, year: year_expost });
        for (const iv of existingBasicIVs) {
          if (iv.indicator_excel_id && !['ActionsCharte', 'ActionsAutres'].includes(iv.indicator_excel_id) && iv.value && iv.value[iv.indicator_type] !== null && iv.value[iv.indicator_type] !== undefined) {
            basicDataValues[iv.situation].push({ excel_indicator_id: iv.indicator_excel_id, value: iv.value[iv.indicator_type] });
          }
        }
      }

      const excelWritePromises = [];
      for (const situation of ['ref', 'expost']) {
        if (parcTypesValues[situation].length > 0) excelWritePromises.push(updateExcelCellsBatch(excelFileId, parcTypesValues[situation], situation).catch(capture));
        if (basicDataValues[situation].length > 0) excelWritePromises.push(updateExcelCellsBatch(excelFileId, basicDataValues[situation], situation).catch(capture));
      }
      if (excelWritePromises.length > 0) await Promise.all(excelWritePromises);
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

    if (createdExpostIndicatorValues.length > 0) await IndicatorValue.insertMany(createdExpostIndicatorValues);
    if (createdRefIndicatorValues.length > 0) await IndicatorValue.insertMany(createdRefIndicatorValues);

    // Mettre à jour l'indicateur AnneeRempl avec la nouvelle année expost dans l'Excel
    if (excelFileId) await updateExcelCellByIndicatorId(excelFileId, 'AnneeRempl', year_expost, 'expost');

    // Mettre à jour l'indicateur AnRef avec la nouvelle année de référence (= year_expost) dans l'Excel
    if (excelFileId) await updateExcelCellByIndicatorId(excelFileId, 'AnRef', year_expost, 'ref');

    // Recalculer la completion pour l'action et les actions config
    await computeActionCompletion(action._id);
    if (configActionBasicData) await computeActionCompletion(configActionBasicData._id);
    if (configActionParcTypes) await computeActionCompletion(configActionParcTypes._id);

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

module.exports = router;
