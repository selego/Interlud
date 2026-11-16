const express = require('express');
const { rateLimit } = require('express-rate-limit');
const ERROR_CODES = require('../utils/errorCodes');

// Limitation des tentatives sur les routes publiques d'authentification (audit Adacis SEC-06).
// Stockage en mémoire : une seule instance tourne sur Clever Cloud ; les compteurs repartent de zéro à chaque redémarrage.
// Les seuils sont comptés par IP (req.ip, cf. `trust proxy` dans index.js), sauf mention contraire.
// La connexion SSO (GET /user/sso/joptimiz) n'est volontairement pas limitée : le mot de passe est vérifié par Joptimiz.

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const RATE_LIMITS = {
  // Connexion : 10 échecs / 15 min. Les connexions réussies ne sont pas comptées, pour ne pas bloquer
  // plusieurs agents d'une même collectivité derrière la même IP.
  SIGNIN: { windowMs: 15 * MINUTE, limit: 10 },
  // Création de compte : 10 / heure.
  SIGNUP: { windowMs: HOUR, limit: 10 },
  // Mot de passe oublié (envoie un e-mail) : 5 / heure par IP et 3 / jour par adresse e-mail.
  FORGOT_PASSWORD: { windowMs: HOUR, limit: 5 },
  FORGOT_PASSWORD_PER_EMAIL: { windowMs: DAY, limit: 3 },
  // Nouveau mot de passe avec le jeton reçu par e-mail : 10 / 15 min.
  FORGOT_PASSWORD_RESET: { windowMs: 15 * MINUTE, limit: 10 },
  // Invitation (vérification du jeton + acceptation, compteur commun) : 20 / 15 min.
  INVITATION: { windowMs: 15 * MINUTE, limit: 20 },
  // Formulaire de contact (envoie un e-mail) : 10 / heure.
  CONTACT: { windowMs: HOUR, limit: 10 },
};

const limiter = (options) =>
  rateLimit({
    ...options,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    statusCode: 429,
    message: { ok: false, code: ERROR_CODES.TOO_MANY_REQUESTS },
  });

const normalizeEmail = (email) => (typeof email === 'string' ? email.trim().toLowerCase() : '');

// À monter après cors et le parseur JSON (le limiteur par e-mail lit req.body), avant les routeurs.
// Les limiteurs sont déclarés dans des express.Router() montés par app.use sur le même préfixe que les contrôleurs :
// le routage est ainsi identique (ex. POST /user//signin atteint le contrôleur, il passe donc aussi par le limiteur).
const mountRateLimits = (app) => {
  const invitation = limiter(RATE_LIMITS.INVITATION);

  const user = express.Router();
  user.post('/signin', limiter({ ...RATE_LIMITS.SIGNIN, skipSuccessfulRequests: true }));
  user.post('/signup', limiter(RATE_LIMITS.SIGNUP));
  user.post('/forgot_password', limiter(RATE_LIMITS.FORGOT_PASSWORD));
  user.post(
    '/forgot_password',
    limiter({
      ...RATE_LIMITS.FORGOT_PASSWORD_PER_EMAIL,
      // Sans adresse exploitable, pas de compteur par e-mail (évite une clé "" partagée par tous) ; la limite par IP s'applique.
      skip: (req) => !normalizeEmail(req.body?.email),
      keyGenerator: (req) => normalizeEmail(req.body.email),
    }),
  );
  user.post('/forgot_password_reset', limiter(RATE_LIMITS.FORGOT_PASSWORD_RESET));
  user.post('/check-invitation-token', invitation);
  user.post('/invite-accepted', invitation);
  app.use('/user', user);

  const contact = express.Router();
  contact.post('/', limiter(RATE_LIMITS.CONTACT));
  app.use('/contact', contact);
};

module.exports = { mountRateLimits, RATE_LIMITS };
