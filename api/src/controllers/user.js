const express = require('express');
const passport = require('passport');
const jwt = require('jsonwebtoken');
const router = express.Router();
const crypto = require('crypto');

const Collectivity = require('../models/collectivity');
const EconomicActor = require('../models/economic_actor');
const UserObject = require('../models/user');
const UserActionRightObject = require('../models/user_action_right');
const config = require('../config');
const { validatePassword } = require('../utils');
const { BREVO_TEMPLATES } = require('../utils/constants');
const ERROR_CODES = require('../utils/errorCodes');
const Notification = require('../models/notification');

const brevo = require('../services/brevo');
const joptimiz = require('../services/joptimiz');
const { capture } = require('../services/sentry');

// 1 year
const COOKIE_MAX_AGE = 31557600000;
const JWT_MAX_AGE = '1y';

// Logo InTerLUD+ pour les emails (URL publique)
const INTERLUD_LOGO_URL = 'https://www.interlud.green/images/interlud-plus@2x.png';

const emailLogoBanner = () => `
  <div style="background: #ffffff; padding: 24px 30px; text-align: center; border-radius: 12px 12px 0 0; border-bottom: 1px solid #EEEEEE;">
    <img src="${INTERLUD_LOGO_URL}" alt="InTerLUD+" height="40" style="height: 40px; vertical-align: middle;" />
  </div>`;

const cookieOptions = () => {
  if (config.ENVIRONMENT === 'development') {
    return { maxAge: COOKIE_MAX_AGE, httpOnly: true, secure: false, sameSite: 'Lax' };
  } else {
    return {
      maxAge: COOKIE_MAX_AGE,
      httpOnly: true,
      secure: true,
      origin: 'YOUR PROD URL',
      sameSite: 'none',
    };
  }
};

router.post('/signin', async (req, res) => {
  let { password, email } = req.body;
  email = (email || '').trim();

  if (!email || !password) return res.status(400).send({ ok: false, code: ERROR_CODES.EMAIL_AND_PASSWORD_REQUIRED });

  try {
    const user = await UserObject.findOne({ email });
    if (!user) return res.status(401).send({ ok: false, code: ERROR_CODES.USER_NOT_EXISTS });

    const userActionRights = await UserActionRightObject.find({ user_id: user._id });

    const approvedCollectivities = user.collectivities?.filter((c) => c.status === 'approved') || [];
    let collectivity = await Collectivity.findById(approvedCollectivities[0]?.id);
    if (user.role === 'admin') collectivity = await Collectivity.findOne();

    let economicActor = null;
    if (user.role === 'economic_actor') economicActor = await EconomicActor.findById(user.economic_actor_id);

    const match = config.ENVIRONMENT === 'development' || (await user.comparePassword(password));
    if (!match) return res.status(401).send({ ok: false, code: ERROR_CODES.EMAIL_OR_PASSWORD_INVALID });

    user.set({ last_login_at: Date.now() });
    await user.save();

    const token = jwt.sign({ _id: user._id }, config.SECRET, { expiresIn: JWT_MAX_AGE });
    res.cookie('jwt', token, cookieOptions());

    return res.status(200).send({ ok: true, token, user, userActionRights, collectivity, economicActor });
  } catch (error) {
    capture(error);
    return res.status(500).send({ ok: false, code: ERROR_CODES.SERVER_ERROR, error });
  }
});

router.post('/signup', async (req, res) => {
  let { password, email, economic_actor_name, role, name } = req.body;
  email = (email || '').trim().toLowerCase();

  try {
    const existingUser = await UserObject.findOne({ email });
    if (existingUser) return res.status(409).send({ ok: false, code: ERROR_CODES.USER_ALREADY_REGISTERED });

    if (password && !validatePassword(password)) return res.status(400).send({ ok: false, user: null, code: ERROR_CODES.PASSWORDS_NOT_MATCH });

    let payload = { password, email, role: 'user', name };
    if (role === 'economic_actor') {
      const economic_actor = await EconomicActor.create({ name: economic_actor_name });
      payload.economic_actor_id = economic_actor._id;
      payload.economic_actor_name = economic_actor.name;
      payload.role = 'economic_actor';
    }

    const user = await UserObject.create(payload);
    const token = jwt.sign({ _id: user._id }, config.SECRET, { expiresIn: JWT_MAX_AGE });
    res.cookie('jwt', token, cookieOptions());

    return res.status(200).send({ user, token, ok: true });
  } catch (error) {
    if (error.code === 11000) return res.status(409).send({ ok: false, code: ERROR_CODES.USER_ALREADY_REGISTERED });
    capture(error);
    return res.status(500).send({ ok: false, code: ERROR_CODES.SERVER_ERROR, error });
  }
});

router.post('/logout', async (_, res) => {
  try {
    res.clearCookie('jwt', cookieOptions());
    return res.status(200).send({ ok: true });
  } catch (error) {
    capture(error);
    return res.status(500).send({ ok: false, code: ERROR_CODES.SERVER_ERROR });
  }
});

router.get('/sso/joptimiz', async (req, res) => {
  try {
    const { code, state } = req.query;

    if (!code) {
      const newState = crypto.randomBytes(16).toString('hex');
      res.cookie('joptimiz_state', newState, { maxAge: 600000, httpOnly: true, secure: config.ENVIRONMENT !== 'development', sameSite: 'lax' });
      return res.redirect(joptimiz.getAuthorizationUrl(newState));
    }

    if (!state || state !== req.cookies.joptimiz_state) return res.redirect(`${config.APP_URL}/auth?sso_error=${encodeURIComponent(ERROR_CODES.UNAUTHORIZED)}`);
    res.clearCookie('joptimiz_state');

    const tokenData = await joptimiz.exchangeCode(code);
    if (!tokenData.access_token) return res.redirect(`${config.APP_URL}/auth?sso_error=${encodeURIComponent(ERROR_CODES.UNAUTHORIZED)}`);

    const userinfo = await joptimiz.getUserInfo(tokenData.access_token);
    const email = (userinfo.email || '').trim();
    if (!email) return res.redirect(`${config.APP_URL}/auth?sso_error=${encodeURIComponent(ERROR_CODES.UNAUTHORIZED)}`);

    let user = await UserObject.findOne({ email });
    if (!user) user = await UserObject.findOne({ email: email.toLowerCase() });
    if (!user) {
      user = await UserObject.create({
        email: email.toLowerCase(),
        name: userinfo.name || `${userinfo.firstname || userinfo.given_name || ''} ${userinfo.lastname || userinfo.family_name || ''}`.trim(),
        role: 'user',
      });
    }

    user.set({ last_login_at: Date.now() });
    await user.save();

    const token = jwt.sign({ _id: user._id }, config.SECRET, { expiresIn: JWT_MAX_AGE });
    res.cookie('jwt', token, cookieOptions());

    return res.redirect(config.APP_URL);
  } catch (error) {
    capture(error);
    return res.redirect(`${config.APP_URL}/auth?sso_error=${encodeURIComponent(ERROR_CODES.SERVER_ERROR)}`);
  }
});

router.get('/signin_token', passport.authenticate(['user', 'admin'], { session: false }), async (req, res) => {
  try {
    const { user } = req;
    user.set({ last_login_at: Date.now() });
    await user.save();

    const token = jwt.sign({ _id: user._id }, config.SECRET, { expiresIn: JWT_MAX_AGE });
    res.cookie('jwt', token, cookieOptions());

    return res.status(200).send({ user, token, ok: true });
  } catch (error) {
    capture(error);
    return res.status(500).send({ ok: false, code: ERROR_CODES.SERVER_ERROR, error });
  }
});

router.post('/forgot_password', async (req, res) => {
  try {
    const obj = await UserObject.findOne({ email: req.body.email.toLowerCase() });

    if (!obj) return res.status(401).send({ ok: false, code: ERROR_CODES.EMAIL_OR_PASSWORD_INVALID });

    const token = await crypto.randomBytes(20).toString('hex');
    obj.set({ password_reset_token: token, password_reset_expires: Date.now() + 7200000 }); //2h
    await obj.save();

    await brevo.sendEmail(
      `<div style="font-family: 'Source Sans Pro', Arial, sans-serif; line-height: 1.6; color: #123314; max-width: 600px; margin: 0 auto; background: #ffffff;">
      <div style="background-color: #2DAC6A; padding: 40px 30px; text-align: center; border-radius: 12px 12px 0 0;">
        <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 600;">Réinitialisation de votre mot de passe</h1>
      </div>
      <div style="padding: 40px 30px; background: #F9FFFC;">
        <p style="margin: 0 0 16px;">Bonjour ${obj.name},</p>
        <p style="margin: 0 0 16px;">Vous avez demandé la réinitialisation de votre mot de passe. Cliquez sur le bouton ci-dessous pour en définir un nouveau :</p>
        <div style="text-align: center; margin: 32px 0;">
          <a href="${config.APP_URL}/auth/reset?token=${token}" style="display: inline-block; background-color: #2DAC6A; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600; padding: 14px 32px; border-radius: 30px;">Réinitialiser mon mot de passe</a>
        </div>
        <p style="margin: 0 0 8px; font-size: 14px; color: #768776;">Ce lien est valable pendant 2 heures.</p>
        <p style="margin: 0; font-size: 14px; color: #768776;">Si vous n'êtes pas à l'origine de cette demande, vous pouvez ignorer cet e-mail.</p>
      </div>
      <div style="text-align: center; padding: 20px; background: #F5F5F5; border-radius: 0 0 12px 12px;">
        <p style="font-size: 12px; color: #768776; margin: 0;">© ${new Date().getFullYear()} InTerLUD+ - Plateforme de pilotage territorial</p>
      </div>
    </div>`,
      {
        subject: 'Réinitialisation de votre mot de passe',
        sender: { name: 'InTerLUD+', email: 'interlud@selego.co' },
        to: [{ email: obj.email }],
      },
    );

    res.status(200).send({ ok: true });
  } catch (error) {
    capture(error);
    return res.status(500).send({ ok: false, code: ERROR_CODES.SERVER_ERROR, error });
  }
});

router.post('/forgot_password_reset', async (req, res) => {
  try {
    const obj = await UserObject.findOne({
      password_reset_token: req.body.token,
      password_reset_expires: { $gt: new Date() },
    });

    if (!obj) return res.status(400).send({ ok: false, code: ERROR_CODES.PASSWORD_TOKEN_EXPIRED_OR_INVALID });

    if (!validatePassword(req.body.password)) return res.status(400).send({ ok: false, code: ERROR_CODES.PASSWORD_NOT_VALIDATED });

    obj.password = req.body.password;
    obj.password_reset_token = '';
    obj.password_reset_expires = undefined;
    await obj.save();
    return res.status(200).send({ ok: true });
  } catch (error) {
    capture(error);
    return res.status(500).send({ ok: false, code: ERROR_CODES.SERVER_ERROR, error });
  }
});

router.post('/reset_password', passport.authenticate('user', { session: false }), async (req, res) => {
  try {
    const match = await req.user.comparePassword(req.body.password);
    if (!match) {
      return res.status(401).send({ ok: false, code: ERROR_CODES.PASSWORD_INVALID });
    }
    if (req.body.newPassword !== req.body.verifyPassword) {
      return res.status(422).send({ ok: false, code: ERROR_CODES.PASSWORDS_DO_NOT_MATCH });
    }
    if (!validatePassword(req.body.newPassword)) {
      return res.status(400).send({ ok: false, code: ERROR_CODES.PASSWORD_NOT_VALIDATED });
    }
    const obj = await UserObject.findById(req.user._id);

    obj.set({ password: req.body.newPassword });
    await obj.save();
    return res.status(200).send({ ok: true, user: obj });
  } catch (error) {
    capture(error);
    return res.status(500).send({ ok: false, code: ERROR_CODES.SERVER_ERROR, error });
  }
});

router.get('/:id', passport.authenticate(['admin', 'user'], { session: false, failWithError: true }), async (req, res) => {
  try {
    const data = await UserObject.findOne({ _id: req.params.id });
    return res.status(200).send({ ok: true, data });
  } catch (error) {
    capture(error);
    res.status(500).send({ ok: false, code: ERROR_CODES.SERVER_ERROR, error });
  }
});

router.get('/', passport.authenticate(['admin', 'user'], { session: false }), async (req, res) => {
  try {
    const data = await UserObject.find({ role: 'normal' });
    return res.status(200).send({ ok: true, data });
  } catch (error) {
    capture(error);
    res.status(500).send({ ok: false, code: ERROR_CODES.SERVER_ERROR, error });
  }
});

router.post('/search', passport.authenticate(['admin', 'user'], { session: false }), async (req, res) => {
  try {
    const { search, sort, per_page, page } = req.body;
    let query = {};

    if (req.body.collectivity_id) query = { ...query, collectivities: { $elemMatch: { id: req.body.collectivity_id } } };
    if (req.body.economic_actor_id) query = { ...query, economic_actor_id: req.body.economic_actor_id };
    if (req.body.role) query = { ...query, role: req.body.role };

    const searchValue = search?.replace(/[#-.]|[[-^]|[?|{}]/g, '\\$&');
    if (search) {
      query = {
        ...query,
        $or: [{ name: { $regex: searchValue, $options: 'i' } }, { email: { $regex: searchValue, $options: 'i' } }],
      };
    }

    const no_of_docs_each_page = per_page || 200;
    const current_page_number = page - 1 || 0;

    const users = await UserObject.find(query)
      .skip(no_of_docs_each_page * current_page_number)
      .limit(no_of_docs_each_page)
      .sort(sort);

    const total = await UserObject.countDocuments(query);

    return res.status(200).send({ ok: true, data: users, total: total });
  } catch (error) {
    capture(error);
    res.status(500).send({ ok: false, code: ERROR_CODES.SERVER_ERROR, error });
  }
});

router.post('/', passport.authenticate(['admin'], { session: false }), async (req, res) => {
  try {
    const { password, role, economic_actor_name, email } = req.body;
    const existingUser = await UserObject.findOne({ email });
    if (existingUser) return res.status(409).send({ ok: false, code: ERROR_CODES.USER_ALREADY_REGISTERED });
    if (!validatePassword(password)) return res.status(400).send({ ok: false, user: null, code: ERROR_CODES.PASSWORD_NOT_VALIDATED });

    let payload = { ...req.body };

    // Si c'est un acteur économique, créer l'entité EconomicActor
    if (role === 'economic_actor' && economic_actor_name) {
      const economic_actor = await EconomicActor.create({ name: economic_actor_name });
      payload.economic_actor_id = economic_actor._id;
      payload.economic_actor_name = economic_actor.name;
    }

    const user = await UserObject.create(payload);

    return res.status(200).send({ data: user, ok: true });
  } catch (error) {
    if (error.code === 11000) return res.status(409).send({ ok: false, code: ERROR_CODES.USER_ALREADY_REGISTERED });
    capture(error);
    return res.status(500).send({ ok: false, code: ERROR_CODES.SERVER_ERROR, error });
  }
});

//@check
router.put('/:id', passport.authenticate(['admin', 'user'], { session: false }), async (req, res) => {
  try {
    const user = await UserObject.findById(req.params.id);
    const obj = req.body;
    user.set(obj);
    await user.save();

    res.status(200).send({ ok: true, data: user });
  } catch (error) {
    capture(error);
    res.status(500).send({ ok: false, code: ERROR_CODES.SERVER_ERROR, error });
  }
});

router.put('/', passport.authenticate(['admin', 'user', 'applicant'], { session: false }), async (req, res) => {
  try {
    const obj = req.body;
    const data = await UserObject.findByIdAndUpdate(req.user._id, obj, { new: true });
    res.status(200).send({ ok: true, data });
  } catch (error) {
    capture(error);
    res.status(500).send({ ok: false, code: ERROR_CODES.SERVER_ERROR, error });
  }
});

router.delete('/:id', passport.authenticate('admin', { session: false }), async (req, res) => {
  try {
    await UserObject.findOneAndRemove({ _id: req.params.id });
    res.status(200).send({ ok: true });
  } catch (error) {
    capture(error);
    res.status(500).send({ ok: false, code: ERROR_CODES.SERVER_ERROR, error });
  }
});

router.post('/reset_password/:id', passport.authenticate(['admin', 'user'], { session: false }), async (req, res) => {
  try {
    if (req.user.role === 'user' && req.user._id.toString() !== req.params.id) return res.status(403).send({ ok: false, code: ERROR_CODES.FORBIDDEN });
    if (req.body.newPassword !== req.body.verifyPassword) return res.status(422).send({ ok: false, code: ERROR_CODES.PASSWORDS_DO_NOT_MATCH });
    if (!validatePassword(req.body.newPassword)) return res.status(400).send({ ok: false, code: ERROR_CODES.PASSWORD_NOT_VALIDATED });
    const obj = await UserObject.findById(req.params.id);
    if (!obj) return res.status(404).send({ ok: false, code: ERROR_CODES.USER_NOT_EXISTS });
    obj.set({ password: req.body.newPassword });
    await obj.save();
    return res.status(200).send({ ok: true, user: obj });
  } catch (error) {
    capture(error);
    return res.status(500).send({ ok: false, code: ERROR_CODES.SERVER_ERROR, error });
  }
});

router.post('/invite', passport.authenticate(['admin', 'user'], { session: false }), async (req, res) => {
  try {
    const obj = req.body;
    const exist = await UserObject.findOne({ email: obj.email });

    if (obj.economic_actor) {
      if (exist) {
        if (exist.economic_actor_id === obj.economic_actor._id) {
          return res.status(409).send({ ok: false, code: ERROR_CODES.ALREADY_MEMBER });
        }

        exist.economic_actor_id = obj.economic_actor._id;
        exist.economic_actor_name = obj.economic_actor.name;
        if (exist.role !== 'admin') exist.role = 'economic_actor';
        for (const col of obj.economic_actor.collectivities || []) {
          if (!exist.collectivities?.some((c) => c.id === col.id)) {
            exist.collectivities.push({ id: col.id, name: col.name, role: 'economic_actor', status: 'approved' });
          }
        }
        await exist.save();

        const addedBodyHTML = `
        <div style="font-family: 'Source Sans Pro', Arial, sans-serif; line-height: 1.6; color: #123314; max-width: 600px; margin: 0 auto; background: #ffffff;">
          <div style="background-color: #2DAC6A; padding: 40px 30px; text-align: center; border-radius: 12px 12px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 28px; font-weight: 600;">Nouvel acteur économique</h1>
          </div>
          <div style="padding: 40px 30px; background: #F9FFFC; border-radius: 0 0 12px 12px;">
            <p style="font-size: 16px; margin-bottom: 20px;">Bonjour${exist.name ? ` ${exist.name}` : ''},</p>
            <p style="font-size: 16px; margin-bottom: 20px;">
              Vous avez été ajouté à l'acteur économique <strong>${obj.economic_actor.name}</strong> sur la plateforme <strong>InTerLUD+</strong>.
            </p>
            <div style="text-align: center; margin: 40px 0;">
              <a href="${config.APP_URL}" style="background: #2DAC6A; color: white; padding: 16px 40px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; display: inline-block; box-shadow: 0 4px 12px rgba(45, 172, 106, 0.3);">
                Accéder à la plateforme
              </a>
            </div>
            <p style="font-size: 16px; margin-bottom: 0;">
              Cordialement,<br>
              <strong style="color: #2DAC6A;">L'équipe InTerLUD+</strong>
            </p>
          </div>
          <div style="text-align: center; padding: 20px; background: #F5F5F5; border-radius: 0 0 8px 8px;">
            <p style="font-size: 12px; color: #768776; margin: 0;">
              © ${new Date().getFullYear()} InTerLUD+ - Plateforme de pilotage territorial
            </p>
          </div>
        </div>
      `;

        await brevo.sendEmail(addedBodyHTML, {
          subject: `Vous avez été ajouté à ${obj.economic_actor.name} sur InTerLUD+`,
          sender: { name: 'InTerLUD+', email: 'interlud@selego.co' },
          to: [{ email: exist.email }],
        });

        return res.status(200).send({ data: exist, ok: true });
      }

      obj.created_at = new Date();

      const token = crypto.randomBytes(32).toString('hex');
      const expires = new Date(Date.now() + 1000 * 60 * 60 * 24 * 365); // 1 an
      obj.invitation_token = token;
      obj.invitation_token_expires = expires;
      obj.invitation_sent_at = new Date();
      obj.role = 'economic_actor';
      obj.economic_actor_id = obj.economic_actor._id;
      obj.economic_actor_name = obj.economic_actor.name;
      obj.collectivities = (obj.economic_actor.collectivities || []).map((col) => ({
        id: col.id,
        name: col.name,
        role: 'economic_actor',
        status: 'approved',
      }));

      let cta = `${config.APP_URL}/auth/invite?token=${token}`;

      const bodyHTML = `
        <div style="font-family: 'Source Sans Pro', Arial, sans-serif; line-height: 1.6; color: #123314; max-width: 600px; margin: 0 auto; background: #ffffff;">
          <!-- Bandeau blanc avec les logos -->
          ${emailLogoBanner()}

          <!-- En-tête avec dégradé vert Interlud (background-color de repli pour Outlook) -->
          <div style="background-color: #2DAC6A; background: linear-gradient(135deg, #2DAC6A 0%, #56BDB8 100%); padding: 40px 30px; text-align: center;">
            <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 600;">Invitation à rejoindre votre acteur économique</h1>
          </div>

          <!-- Corps du message -->
          <div style="padding: 40px 30px; background: #F9FFFC; border-radius: 0 0 12px 12px;">
            <p style="font-size: 16px; margin-bottom: 20px;">Bonjour,</p>

            <p style="font-size: 16px; margin-bottom: 20px;">
              Vous avez été invité à rejoindre <strong>${obj.economic_actor.name}</strong> sur la plateforme <strong>InTerLUD+</strong>.
            </p>

            <p style="font-size: 16px; margin-bottom: 30px;">
              InTerLUD+ est une plateforme collaborative qui vous permet de piloter et suivre vos actions territoriales en faveur de la transition écologique et économique.
            </p>

            <!-- Bouton CTA -->
            <div style="text-align: center; margin: 40px 0;">
              <a href="${cta}" style="background: #2DAC6A; color: white; padding: 16px 40px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; display: inline-block; box-shadow: 0 4px 12px rgba(45, 172, 106, 0.3);">
                Accepter l'invitation
              </a>
            </div>

            <p style="font-size: 16px; margin-bottom: 10px;">Une question ? Notre équipe est à votre disposition pour vous accompagner.</p>

            <p style="font-size: 16px; margin-bottom: 0;">
              Cordialement,<br>
              <strong style="color: #2DAC6A;">L'équipe InTerLUD+</strong>
            </p>
          </div>

          <!-- Pied de page -->
          <div style="text-align: center; padding: 20px; background: #F5F5F5; border-radius: 0 0 8px 8px;">
            <p style="font-size: 12px; color: #768776; margin: 0;">
              © ${new Date().getFullYear()} InTerLUD+ - Plateforme de pilotage territorial
            </p>
          </div>
      </div>
      `;

      await brevo.sendEmail(bodyHTML, {
        subject: `Invitation à rejoindre ${obj.economic_actor.name} sur InTerLUD+`,
        sender: { name: 'InTerLUD+', email: 'interlud@selego.co' },
        to: [{ email: obj.email }],
      });

      const user = await UserObject.create(obj);
      return res.status(200).send({ data: user, ok: true });
    }

    if (exist) {
      if (exist.collectivities?.some((c) => c.id === obj.collectivity._id)) {
        return res.status(409).send({ ok: false, code: ERROR_CODES.ALREADY_MEMBER });
      }

      exist.collectivities.push({
        id: obj.collectivity._id,
        name: obj.collectivity.name,
        role: 'user',
        status: 'approved',
      });
      await exist.save();

      const addedBodyHTML = `
        <div style="font-family: 'Source Sans Pro', Arial, sans-serif; line-height: 1.6; color: #123314; max-width: 600px; margin: 0 auto; background: #ffffff;">
          <div style="background-color: #2DAC6A; padding: 40px 30px; text-align: center; border-radius: 12px 12px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 28px; font-weight: 600;">Nouvelle collectivité</h1>
          </div>
          <div style="padding: 40px 30px; background: #F9FFFC; border-radius: 0 0 12px 12px;">
            <p style="font-size: 16px; margin-bottom: 20px;">Bonjour${exist.name ? ` ${exist.name}` : ''},</p>
            <p style="font-size: 16px; margin-bottom: 20px;">
              Vous avez été ajouté à la collectivité <strong>${obj.collectivity.name}</strong> sur la plateforme <strong>InTerLUD+</strong>.
            </p>
            <div style="text-align: center; margin: 40px 0;">
              <a href="${config.APP_URL}" style="background: #2DAC6A; color: white; padding: 16px 40px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; display: inline-block; box-shadow: 0 4px 12px rgba(45, 172, 106, 0.3);">
                Accéder à la plateforme
              </a>
            </div>
            <p style="font-size: 16px; margin-bottom: 0;">
              Cordialement,<br>
              <strong style="color: #2DAC6A;">L'équipe InTerLUD+</strong>
            </p>
          </div>
          <div style="text-align: center; padding: 20px; background: #F5F5F5; border-radius: 0 0 8px 8px;">
            <p style="font-size: 12px; color: #768776; margin: 0;">
              © ${new Date().getFullYear()} InTerLUD+ - Plateforme de pilotage territorial
            </p>
          </div>
        </div>
      `;

      await brevo.sendEmail(addedBodyHTML, {
        subject: `Vous avez été ajouté à ${obj.collectivity.name} sur InTerLUD+`,
        sender: { name: 'InTerLUD+', email: 'interlud@selego.co' },
        to: [{ email: exist.email }],
      });

      return res.status(200).send({ data: exist, ok: true });
    }

    obj.created_at = new Date();

    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 1000 * 60 * 60 * 24 * 365); // 1 an
    obj.invitation_token = token;
    obj.invitation_token_expires = expires;
    obj.invitation_sent_at = new Date();
    obj.collectivities = [
      {
        id: obj.collectivity._id,
        name: obj.collectivity.name,
        role: 'user',
        status: 'approved',
      },
    ];

    let cta = `${config.APP_URL}/auth/invite?token=${token}`;

    const bodyHTML = `
        <div style="font-family: 'Source Sans Pro', Arial, sans-serif; line-height: 1.6; color: #123314; max-width: 600px; margin: 0 auto; background: #ffffff;">
          <!-- Bandeau blanc avec les logos -->
          ${emailLogoBanner()}

          <!-- En-tête avec dégradé vert Interlud (background-color de repli pour Outlook) -->
          <div style="background-color: #2DAC6A; background: linear-gradient(135deg, #2DAC6A 0%, #56BDB8 100%); padding: 40px 30px; text-align: center;">
            <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 600;">Invitation à rejoindre votre collectivité</h1>
          </div>

          <!-- Corps du message -->
          <div style="padding: 40px 30px; background: #F9FFFC; border-radius: 0 0 12px 12px;">
            <p style="font-size: 16px; margin-bottom: 20px;">Bonjour,</p>

            <p style="font-size: 16px; margin-bottom: 20px;">
              Vous avez été invité à rejoindre <strong>${obj.collectivity.name}</strong> sur la plateforme <strong>InTerLUD+</strong>.
            </p>
            
            <p style="font-size: 16px; margin-bottom: 30px;">
              InTerLUD+ est une plateforme collaborative qui vous permet de piloter et suivre vos actions territoriales en faveur de la transition écologique et économique.
            </p>

            <!-- Bouton CTA -->
            <div style="text-align: center; margin: 40px 0;">
              <a href="${cta}" style="background: #2DAC6A; color: white; padding: 16px 40px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; display: inline-block; box-shadow: 0 4px 12px rgba(45, 172, 106, 0.3);">
                Accepter l'invitation
              </a>
            </div>

            <p style="font-size: 16px; margin-bottom: 10px;">Une question ? Notre équipe est à votre disposition pour vous accompagner.</p>
            
            <p style="font-size: 16px; margin-bottom: 0;">
              Cordialement,<br>
              <strong style="color: #2DAC6A;">L'équipe InTerLUD+</strong>
            </p>
          </div>
          
          <!-- Pied de page -->
          <div style="text-align: center; padding: 20px; background: #F5F5F5; border-radius: 0 0 8px 8px;">
            <p style="font-size: 12px; color: #768776; margin: 0;">
              © ${new Date().getFullYear()} InTerLUD+ - Plateforme de pilotage territorial
            </p>
          </div>
      </div>
      `;

    await brevo.sendEmail(bodyHTML, {
      subject: `Invitation à rejoindre ${obj.collectivity.name} sur InTerLUD+`,
      sender: { name: 'InTerLUD+', email: 'interlud@selego.co' },
      to: [{ email: obj.email }],
    });

    const user = await UserObject.create(obj);
    return res.status(200).send({ data: user, ok: true });
  } catch (error) {
    console.log('ERROR', error);
    if (error.code === 11000) return res.status(409).send({ ok: false, code: ERROR_CODES.USER_ALREADY_REGISTERED });
    capture(error);
    return res.status(500).send({ ok: false, code: ERROR_CODES.SERVER_ERROR });
  }
});

router.post('/send-invite/:id', passport.authenticate(['admin'], { session: false }), async (req, res) => {
  try {
    const user = await UserObject.findById(req.params.id);
    if (!user) return res.status(404).send({ ok: false, code: ERROR_CODES.USER_NOT_FOUND });

    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 1000 * 60 * 60 * 24 * 365); // 1 an

    user.invitation_token = token;
    user.invitation_token_expires = expires;
    user.invitation_sent_at = new Date();
    await user.save();

    const collectivityName = user.collectivities?.[0]?.name || 'InTerLUD+';
    let cta = `${config.APP_URL}/auth/invite?token=${token}`;

    const bodyHTML = `
        <div style="font-family: 'Source Sans Pro', Arial, sans-serif; line-height: 1.6; color: #123314; max-width: 600px; margin: 0 auto; background: #ffffff;">
          <!-- Bandeau blanc avec les logos -->
          ${emailLogoBanner()}

          <!-- En-tête avec dégradé vert Interlud (background-color de repli pour Outlook) -->
          <div style="background-color: #2DAC6A; background: linear-gradient(135deg, #2DAC6A 0%, #56BDB8 100%); padding: 40px 30px; text-align: center;">
            <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 600;">Invitation à rejoindre votre collectivité</h1>
          </div>

          <!-- Corps du message -->
          <div style="padding: 40px 30px; background: #F9FFFC; border-radius: 0 0 12px 12px;">
            <p style="font-size: 16px; margin-bottom: 20px;">Bonjour${user.name ? ` ${user.name}` : ''},</p>
            
            <p style="font-size: 16px; margin-bottom: 20px;">
              Vous avez été invité à rejoindre <strong>${collectivityName}</strong>
            </p>
            
            <p style="font-size: 16px; margin-bottom: 30px;">
              InTerLUD+ est une plateforme collaborative qui vous permet de piloter et suivre vos actions territoriales en faveur de la transition écologique et économique.
            </p>

            <!-- Bouton CTA -->
            <div style="text-align: center; margin: 40px 0;">
              <a href="${cta}" style="background: #2DAC6A; color: white; padding: 16px 40px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; display: inline-block; box-shadow: 0 4px 12px rgba(45, 172, 106, 0.3);">
                Accepter l'invitation
              </a>
            </div>

            <p style="font-size: 16px; margin-bottom: 10px;">Une question ? Notre équipe est à votre disposition pour vous accompagner.</p>
            
            <p style="font-size: 16px; margin-bottom: 0;">
              Cordialement,<br>
              <strong style="color: #2DAC6A;">L'équipe InTerLUD+</strong>
            </p>
          </div>
          
          <!-- Pied de page -->
          <div style="text-align: center; padding: 20px; background: #F5F5F5; border-radius: 0 0 8px 8px;">
            <p style="font-size: 12px; color: #768776; margin: 0;">
              © ${new Date().getFullYear()} InTerLUD+ - Plateforme de pilotage territorial
            </p>
          </div>
      </div>
      `;

    await brevo.sendEmail(bodyHTML, {
      subject: `Invitation à rejoindre ${collectivityName} sur InTerLUD+`,
      sender: { name: 'InTerLUD+', email: 'interlud@selego.co' },
      to: [{ email: user.email }],
    });

    return res.status(200).send({ ok: true, data: user });
  } catch (error) {
    console.log('ERROR', error);
    capture(error);
    return res.status(500).send({ ok: false, code: ERROR_CODES.SERVER_ERROR });
  }
});

router.post('/check-invitation-token', async (req, res) => {
  try {
    const { invitation_token } = req.body;
    const user = await UserObject.findOne({ invitation_token });
    if (!user) return res.status(404).send({ ok: false, code: ERROR_CODES.USER_NOT_FOUND });
    // if (new Date(user.invitation_token_expires) < new Date()) return res.status(400).send({ ok: false, code: ERROR_CODES.INVITATION_TOKEN_EXPIRED });
    return res.status(200).send({ ok: true, user });
  } catch (error) {
    capture(error);
    return res.status(500).send({ ok: false, code: ERROR_CODES.SERVER_ERROR });
  }
});

router.post('/invite-accepted', async (req, res) => {
  try {
    const { email, password, name, invitation_token } = req.body;
    const user = await UserObject.findOne({ email, invitation_token });
    if (!user) return res.status(404).send({ ok: false, code: ERROR_CODES.USER_NOT_FOUND });

    if (new Date(user.invitation_token_expires) < new Date()) return res.status(400).send({ ok: false, code: ERROR_CODES.INVITATION_TOKEN_EXPIRED });

    const updateData = { password, name, invitation_token: null, invitation_token_expires: null, invitation_accepted_at: new Date(), last_login_at: new Date() };

    user.set(updateData);
    await user.save();

    const userActionRights = await UserActionRightObject.find({ user_id: user._id });

    const approvedCollectivities = user.collectivities?.filter((c) => c.status === 'approved') || [];
    let collectivity = await Collectivity.findById(approvedCollectivities[0]?.id);
    if (user.role === 'admin') collectivity = await Collectivity.findOne();

    let economicActor = null;
    if (user.role === 'economic_actor') economicActor = await EconomicActor.findById(user.economic_actor_id);

    const token = jwt.sign({ _id: user._id }, config.SECRET, { expiresIn: JWT_MAX_AGE });
    res.cookie('jwt', token, cookieOptions());
    return res.status(200).send({ ok: true, token, user, userActionRights, collectivity, economicActor });
  } catch (error) {
    capture(error);
    return res.status(500).send({ ok: false, code: ERROR_CODES.SERVER_ERROR });
  }
});

router.post('/request-collectivity-access', passport.authenticate(['user', 'applicant'], { session: false }), async (req, res) => {
  try {
    const { collectivityId } = req.body;
    if (!collectivityId) return res.status(400).send({ ok: false, code: ERROR_CODES.INVALID_BODY });

    const collectivity = await Collectivity.findById(collectivityId);
    if (!collectivity) return res.status(404).send({ ok: false, code: ERROR_CODES.NOT_FOUND });

    const user = await UserObject.findById(req.user._id);
    if (!user) return res.status(404).send({ ok: false, code: ERROR_CODES.NOT_FOUND });

    if (user.collectivities?.find((c) => c.id === collectivityId)) return res.status(409).send({ ok: false, code: ERROR_CODES.ALREADY_REQUESTED });

    const adminCollectivity = await UserObject.find({ collectivities: { $elemMatch: { id: collectivityId, role: 'admin' } } });
    const redirectUrl = `${config.APP_URL}/collectivity?collectivityId=${collectivityId}`;

    for (const admin of adminCollectivity) {
      if (admin.notifications_push !== false) {
        await Notification.create({
          message: `${user.name} a demandé à rejoindre la collectivité ${collectivity.name}`,
          user_id: admin._id,
          user_name: admin.name,
          user_email: admin.email,
          redirect: redirectUrl,
        });
      }

      if (admin.notifications_email !== false) {
        const bodyHTML = `
          <div style="font-family: 'Source Sans Pro', Arial, sans-serif; line-height: 1.6; color: #123314; max-width: 600px; margin: 0 auto; background: #ffffff;">
            <div style="background-color: #2DAC6A; padding: 40px 30px; text-align: center; border-radius: 12px 12px 0 0;">
              <h1 style="color: white; margin: 0; font-size: 28px; font-weight: 600;">Demande d'accès</h1>
            </div>

            <div style="padding: 40px 30px; background: #F9FFFC; border-radius: 0 0 12px 12px;">
              <p style="font-size: 16px; margin-bottom: 20px;">Bonjour ${admin.name},</p>

              <p style="font-size: 16px; margin-bottom: 20px;">
                <strong>${user.name}</strong> a demandé à rejoindre la collectivité <strong>${collectivity.name}</strong> sur la plateforme <strong>InTerLUD+</strong>.
              </p>

              <div style="text-align: center; margin: 40px 0;">
                <a href="${redirectUrl}" style="background: #2DAC6A; color: white; padding: 16px 40px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; display: inline-block; box-shadow: 0 4px 12px rgba(45, 172, 106, 0.3);">
                  Gérer les accès
                </a>
              </div>

              <p style="font-size: 16px; margin-bottom: 0;">
                Cordialement,<br>
                <strong style="color: #2DAC6A;">L'équipe InTerLUD+</strong>
              </p>
            </div>

            <div style="text-align: center; padding: 20px; background: #F5F5F5; border-radius: 0 0 8px 8px;">
              <p style="font-size: 12px; color: #768776; margin: 0;">
                © ${new Date().getFullYear()} InTerLUD+ - Plateforme de pilotage territorial
              </p>
            </div>
          </div>
        `;

        await brevo.sendEmail(bodyHTML, {
          subject: "Nouvelle demande d'accès à votre collectivité",
          sender: { name: 'InTerLUD+', email: 'interlud@selego.co' },
          to: [{ email: admin.email }],
        });
      }
    }

    user.collectivities = [...(user.collectivities || []), { id: collectivityId, name: collectivity.name, role: user.role || 'user', status: 'pending' }];
    await user.save();

    res.status(200).send({ ok: true, data: user });
  } catch (error) {
    capture(error);
    res.status(500).send({ ok: false, code: ERROR_CODES.SERVER_ERROR, error });
  }
});

module.exports = router;
