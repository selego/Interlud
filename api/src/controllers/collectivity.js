const express = require('express');
const router = express.Router();
const passport = require('passport');
const Collectivity = require('../models/collectivity');
const ERROR_CODES = require('../utils/errorCodes');
const { capture } = require('../services/sentry');
const { createFolder, duplicateExcelFile } = require('../services/microsoftGraph');

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
    const existingCollectivity = await Collectivity.findOne({ name: req.body.name });
    if (existingCollectivity) return res.status(400).send({ ok: false, code: ERROR_CODES.COLLECTIVITY_ALREADY_EXISTS });

    const collectivity = await Collectivity.create(req.body);
    collectivity.sharepoint_folder_id = await createFolder(collectivity.name);

    const AGGREGATION_TEMPLATE_FILE_ID = '01IBL4ADOUOXHM475PNZALWXNQOJOSDTIV';
    collectivity.aggregation_excel_file_id = await duplicateExcelFile(`${collectivity.name} - Aggregation.xlsx`, collectivity.sharepoint_folder_id, AGGREGATION_TEMPLATE_FILE_ID);

    await collectivity.save();

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
