const express = require('express');
const router = express.Router();
const passport = require('passport');
const Collectivity = require('../models/collectivity');
const Action = require('../models/action');
const Indicator = require('../models/indicator');
const IndicatorValue = require('../models/indicator_value');
const ERROR_CODES = require('../utils/errorCodes');
const { capture } = require('../services/sentry');
const { duplicateExcelFile } = require('../services/microsoftGraph');

// Catégories d'indicateurs à inclure lors de la création d'une collectivité
const GLOBAL_INDICATOR_CATEGORIES = [
  'Fret routier',
  'Données de base',
  "Données de production/consommation d'énergie",
  'Fret fluvial',
  'Fret ferroviaire',
  'Cyclologistique',
  'Déplacements de particuliers',
];

router.get('/:id', passport.authenticate(['admin', 'user'], { session: false, failWithError: true }), async (req, res) => {
  try {
    const collectivity = await Collectivity.findById(req.params.id);
    if (!collectivity) return res.status(404).send({ ok: false, code: ERROR_CODES.NOT_FOUND });

    return res.status(200).send({ ok: true, data: collectivity });
  } catch (error) {
    capture(error);
    return res.status(500).send({ ok: false, code: ERROR_CODES.SERVER_ERROR });
  }
});

router.put('/:id', passport.authenticate(['admin', 'user'], { session: false, failWithError: true }), async (req, res) => {
  try {
    const collectivity = await Collectivity.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!collectivity) return res.status(404).send({ ok: false, code: ERROR_CODES.NOT_FOUND });
    return res.status(200).send({ ok: true, data: collectivity });
  } catch (error) {
    capture(error);
    return res.status(500).send({ ok: false, code: ERROR_CODES.SERVER_ERROR });
  }
});

router.post('/search', passport.authenticate(['admin', 'user'], { session: false, failWithError: true }), async (req, res) => {
  try {
    let query = {};

    if (req.body.search) query.name = { $regex: req.body.search, $options: 'i' };

    const limit = req.body.limit || 50;
    const skip = req.body.offset || 0;
    const total = await Collectivity.countDocuments(query);
    const data = await Collectivity.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit);
    return res.status(200).send({ ok: true, data, total });
  } catch (error) {
    capture(error);
    return res.status(500).send({ ok: false, code: ERROR_CODES.SERVER_ERROR });
  }
});

router.post('/', passport.authenticate(['admin', 'user'], { session: false, failWithError: true }), async (req, res) => {
  try {
    if (!req.body.name) return res.status(400).send({ ok: false, code: ERROR_CODES.INVALID_BODY });
    const collectivity = await Collectivity.create(req.body);

    try {
      collectivity.excelFileId = await duplicateExcelFile(`${collectivity.name}.xlsx`);
      await collectivity.save();
    } catch (excelError) {
      capture(excelError);
    }

    // Créer l'action globale pour la collectivité
    const action = await Action.create({
      name: 'Parc types',
      type: 'reference',
      collectivity_id: collectivity._id,
      collectivity_name: collectivity.name,
      owner: 'collectivity',
      status: 'no_status',
    });

    // Récupérer tous les indicateurs des catégories globales
    const indicators = await Indicator.find({ indicator_category_name: { $in: GLOBAL_INDICATOR_CATEGORIES } });

    // Créer les indicator_values pour chaque indicateur et chaque situation
    const allSituations = ['init', 'ref', 'prev', 'expost'];
    const createdIndicatorValues = [];

    for (const indicator of indicators) {
      const situationsForIndicator = allSituations.filter((situation) => indicator.presence_in_excel?.[situation] === true);

      for (const situation of situationsForIndicator) {
        const defaultValue = indicator.value_default?.[situation]?.[indicator.value_type] ?? null;
        const indicatorValue = {
          action_id: action._id,
          action_name: action.name,
          collectivity_id: collectivity._id,
          collectivity_name: collectivity.name,
          owner: 'collectivity',
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

    return res.status(200).send({ ok: true, data: collectivity });
  } catch (error) {
    capture(error);
    return res.status(500).send({ ok: false, data: { code: ERROR_CODES.SERVER_ERROR } });
  }
});

router.delete('/:id', passport.authenticate(['admin', 'user'], { session: false, failWithError: true }), async (req, res) => {
  try {
    const collectivity = await Collectivity.findByIdAndDelete(req.params.id);
    if (!collectivity) return res.status(404).send({ ok: false, code: ERROR_CODES.NOT_FOUND });

    return res.status(200).send({ ok: true });
  } catch (error) {
    capture(error);
    return res.status(500).send({ ok: false, code: ERROR_CODES.SERVER_ERROR });
  }
});

module.exports = router;
