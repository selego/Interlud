const express = require('express');
const router = express.Router();
const passport = require('passport');
const EconomicActorForm = require('../models/economic_actor_form');
const ERROR_CODES = require('../utils/errorCodes');
const { capture } = require('../services/sentry');

// Réglages du questionnaire acteurs économiques (document unique).

router.get('/', passport.authenticate(['admin', 'user'], { session: false, failWithError: true }), async (req, res) => {
  try {
    const form = await EconomicActorForm.findOne({});
    return res.status(200).send({ ok: true, data: form || { intro_text: '' } });
  } catch (error) {
    capture(error);
    return res.status(500).send({ ok: false, code: ERROR_CODES.SERVER_ERROR });
  }
});

router.put('/', passport.authenticate('admin', { session: false, failWithError: true }), async (req, res) => {
  try {
    const form = await EconomicActorForm.findOneAndUpdate({}, { intro_text: req.body.intro_text }, { new: true, upsert: true });
    return res.status(200).send({ ok: true, data: form });
  } catch (error) {
    capture(error);
    return res.status(500).send({ ok: false, code: ERROR_CODES.SERVER_ERROR });
  }
});

module.exports = router;
