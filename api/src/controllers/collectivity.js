const express = require('express');
const router = express.Router();
const passport = require('passport');
const Collectivity = require('../models/collectivity');
const Action = require('../models/action');
const ERROR_CODES = require('../utils/errorCodes');
const { capture } = require('../services/sentry');
const { createFolder, duplicateExcelFile, aggregationTemplateFileId } = require('../services/microsoftGraph');

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
    const { name, description, department, population, siren, year, area, basedata_onboarded, parc_types_onboarded } = req.body;
    const collectivity = await Collectivity.findByIdAndUpdate(req.params.id, { name, description, department, population, siren, year, area, basedata_onboarded, parc_types_onboarded }, { new: true });
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
    const sortBy = req.body.sortBy || 'createdAt';
    const sortOrder = req.body.sortOrder === 'asc' ? 1 : -1;
    const total = await Collectivity.countDocuments(query);

    if (sortBy === 'action_count') {
      const collectivityIds = (await Collectivity.find(query, { _id: 1 })).map((c) => c._id.toString());
      const actionCounts = await Action.aggregate([{ $match: { collectivity_id: { $in: collectivityIds }, type: { $ne: 'config' } } }, { $group: { _id: '$collectivity_id', count: { $sum: 1 } } }]);
      const countMap = Object.fromEntries(actionCounts.map((a) => [a._id, a.count]));
      const allCollectivities = await Collectivity.find(query);
      const sorted = allCollectivities.map((c) => ({ ...c.toObject(), action_count: countMap[c._id.toString()] || 0 })).sort((a, b) => sortOrder * (a.action_count - b.action_count));
      const data = sorted.slice(skip, skip + limit);
      return res.status(200).send({ ok: true, data, total });
    }

    const data = await Collectivity.find(query)
      .sort({ [sortBy]: sortOrder })
      .skip(skip)
      .limit(limit);
    // Add action counts
    const collectivityIds = data.map((c) => c._id.toString());
    const actionCounts = await Action.aggregate([{ $match: { collectivity_id: { $in: collectivityIds }, type: { $ne: 'config' } } }, { $group: { _id: '$collectivity_id', count: { $sum: 1 } } }]);
    const countMap = Object.fromEntries(actionCounts.map((a) => [a._id, a.count]));
    const dataWithCounts = data.map((c) => ({ ...c.toObject(), action_count: countMap[c._id.toString()] || 0 }));

    return res.status(200).send({ ok: true, data: dataWithCounts, total });
  } catch (error) {
    capture(error);
    return res.status(500).send({ ok: false, code: ERROR_CODES.SERVER_ERROR });
  }
});

router.post('/', passport.authenticate(['admin', 'user'], { session: false, failWithError: true }), async (req, res) => {
  try {
    const { name, description, department, population, siren, year, area, basedata_onboarded, parc_types_onboarded } = req.body;
    if (!name) return res.status(400).send({ ok: false, code: ERROR_CODES.INVALID_BODY });
    const existingCollectivity = await Collectivity.findOne({ name });
    if (existingCollectivity) return res.status(400).send({ ok: false, code: ERROR_CODES.COLLECTIVITY_ALREADY_EXISTS });

    const collectivity = await Collectivity.create({ name, description, department, population, siren, year, area, basedata_onboarded, parc_types_onboarded });
    collectivity.sharepoint_folder_id = await createFolder(collectivity.name);

    collectivity.aggregation_excel_file_id = await duplicateExcelFile(`${collectivity.name} - Aggregation.xlsx`, collectivity.sharepoint_folder_id, aggregationTemplateFileId);

    await collectivity.save();

    return res.status(200).send({ ok: true, data: collectivity });
  } catch (error) {
    capture(error);
    return res.status(500).send({ ok: false, code: ERROR_CODES.SERVER_ERROR });
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
