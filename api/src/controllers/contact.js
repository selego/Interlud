const express = require('express');
const router = express.Router();

const brevo = require('../services/brevo');
const { capture } = require('../services/sentry');
const ERROR_CODES = require('../utils/errorCodes');

const CONTACT_RECIPIENT = 'axel@selego.co';

router.post('/', async (req, res) => {
  try {
    const { name, email, subject, message } = req.body;

    if (!name || !email || !subject || !message) {
      return res.status(400).send({ ok: false, code: 'MISSING_FIELDS' });
    }

    const html = `
      <div style="font-family: 'Source Sans Pro', sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff;">
        <div style="background: #2DAC6A; padding: 20px; border-radius: 8px 8px 0 0;">
          <h2 style="color: #ffffff; margin: 0;">Nouveau message depuis InTerLUD+</h2>
        </div>
        <div style="padding: 24px; background: #F9FFFC; border: 1px solid #D9EFE3;">
          <p style="font-size: 14px; color: #768776; margin: 0 0 4px;">De</p>
          <p style="font-size: 16px; color: #0A3641; margin: 0 0 16px;"><strong>${name}</strong> &lt;${email}&gt;</p>
          <p style="font-size: 14px; color: #768776; margin: 0 0 4px;">Sujet</p>
          <p style="font-size: 16px; color: #0A3641; margin: 0 0 16px;"><strong>${subject}</strong></p>
          <p style="font-size: 14px; color: #768776; margin: 0 0 4px;">Message</p>
          <div style="font-size: 15px; color: #123314; background: #ffffff; border: 1px solid #E0E0E0; border-radius: 6px; padding: 16px; white-space: pre-wrap;">${message}</div>
        </div>
        <div style="text-align: center; padding: 16px; background: #F5F5F5; border-radius: 0 0 8px 8px;">
          <p style="font-size: 12px; color: #768776; margin: 0;">© ${new Date().getFullYear()} InTerLUD+</p>
        </div>
      </div>
    `;

    await brevo.sendEmail(html, {
      subject: `[InTerLUD+ Contact] ${subject}`,
      sender: { name: 'InTerLUD+', email: 'interlud@selego.co' },
      to: [{ email: CONTACT_RECIPIENT }],
      replyTo: { email, name },
    });

    return res.status(200).send({ ok: true });
  } catch (e) {
    capture(e);
    return res.status(500).send({ ok: false, code: ERROR_CODES.SERVER_ERROR });
  }
});

module.exports = router;
