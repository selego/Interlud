/* eslint-env node */
// Tests de la limitation des tentatives sur les routes publiques d'authentification (audit SEC-06).
// Lancer : npm test (aucune connexion MongoDB nécessaire, les modèles sont simulés en mémoire, aucun e-mail envoyé).
process.env.SECRET = 'test-secret';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const cookieParser = require('cookie-parser');

const User = require('../src/models/user');
const Collectivity = require('../src/models/collectivity');
const UserActionRight = require('../src/models/user_action_right');
const brevo = require('../src/services/brevo');
const ERROR_CODES = require('../src/utils/errorCodes');
const { mountRateLimits, RATE_LIMITS } = require('../src/services/rateLimit');

// Compte existant : en environnement de développement (celui des tests), le mot de passe n'est pas vérifié,
// la connexion réussit donc toujours. Toute autre adresse est inconnue : la connexion échoue.
const KNOWN_EMAIL = 'agent@collectivite.fr';
User.findOne = async (query) => {
  if (query.email !== KNOWN_EMAIL) return null;
  return { _id: 'u-1', email: KNOWN_EMAIL, role: 'user', collectivities: [], set: () => {}, save: async () => {} };
};
Collectivity.findById = async () => null;
UserActionRight.find = async () => [];
// Aucun e-mail envoyé (formulaire de contact)
brevo.sendEmail = async () => {};

const TOO_MANY = { ok: false, code: ERROR_CODES.TOO_MANY_REQUESTS };

let server;
let baseUrl;
let ipCounter = 0;
// Chaque test utilise ses propres IP clientes (transmises par le proxy) pour ne pas partager de compteur.
const newIp = () => `203.0.113.${++ipCounter}`;

const post = async (path, body, ip) => {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
};

before(async () => {
  const app = express();
  // Même configuration que src/index.js : un proxy devant l'app, limiteurs montés après le parseur JSON,
  // puis les vrais contrôleurs sur les mêmes préfixes.
  app.set('trust proxy', 1);
  app.use(cookieParser());
  app.use(express.json());
  mountRateLimits(app);
  app.use('/user', require('../src/controllers/user'));
  app.use('/contact', require('../src/controllers/contact'));
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => server.close());

describe('Limitation des tentatives (SEC-06)', () => {
  test('connexion : N échecs autorisés, puis 429 au format { ok, code }', async () => {
    const ip = newIp();
    for (let i = 0; i < RATE_LIMITS.SIGNIN.limit; i++) {
      const res = await post('/user/signin', { email: 'inconnu@example.com', password: 'x' }, ip);
      assert.equal(res.status, 401);
    }
    const blocked = await post('/user/signin', { email: 'inconnu@example.com', password: 'x' }, ip);
    assert.equal(blocked.status, 429);
    assert.deepEqual(blocked.body, TOO_MANY);

    // Une fois bloquée, l'IP ne peut plus se connecter, même avec un compte valide
    const valid = await post('/user/signin', { email: KNOWN_EMAIL, password: 'x' }, ip);
    assert.equal(valid.status, 429);

    // Les autres IP (clients distincts derrière le proxy) ne sont pas affectées
    const other = await post('/user/signin', { email: 'inconnu@example.com', password: 'x' }, newIp());
    assert.equal(other.status, 401);
  });

  test('connexion : les connexions réussies ne sont pas comptées', async () => {
    const ip = newIp();
    for (let i = 0; i < RATE_LIMITS.SIGNIN.limit + 5; i++) {
      const res = await post('/user/signin', { email: KNOWN_EMAIL, password: 'x' }, ip);
      assert.equal(res.status, 200);
    }
  });

  test('mot de passe oublié : limite par IP', async () => {
    const ip = newIp();
    for (let i = 0; i < RATE_LIMITS.FORGOT_PASSWORD.limit; i++) {
      const res = await post('/user/forgot_password', { email: `inconnu${i}@example.com` }, ip);
      // Même réponse que le compte existe ou non (SEC-09)
      assert.equal(res.status, 200);
    }
    const blocked = await post('/user/forgot_password', { email: 'autre@example.com' }, ip);
    assert.equal(blocked.status, 429);
    assert.deepEqual(blocked.body, TOO_MANY);
  });

  test('mot de passe oublié : limite par adresse e-mail, quelle que soit l’IP', async () => {
    for (let i = 0; i < RATE_LIMITS.FORGOT_PASSWORD_PER_EMAIL.limit; i++) {
      const res = await post('/user/forgot_password', { email: 'cible@example.com' }, newIp());
      // Même réponse que le compte existe ou non (SEC-09)
      assert.equal(res.status, 200);
    }
    const blocked = await post('/user/forgot_password', { email: '  Cible@Example.com ' }, newIp());
    assert.equal(blocked.status, 429);
    assert.deepEqual(blocked.body, TOO_MANY);
  });

  test('invitation : compteur commun à la vérification et à l’acceptation du jeton', async () => {
    const ip = newIp();
    for (let i = 0; i < RATE_LIMITS.INVITATION.limit; i++) {
      const path = i % 2 ? '/user/invite-accepted' : '/user/check-invitation-token';
      const res = await post(path, { invitation_token: `jeton-${i}`, email: 'inconnu@example.com', password: 'MotDePasse-Test1!' }, ip);
      assert.equal(res.status, 404);
    }
    const blocked = await post('/user/check-invitation-token', { invitation_token: 'jeton-x' }, ip);
    assert.equal(blocked.status, 429);
    assert.deepEqual(blocked.body, TOO_MANY);
  });

  test('réinitialisation du mot de passe par jeton : limite par IP', async () => {
    const ip = newIp();
    for (let i = 0; i < RATE_LIMITS.FORGOT_PASSWORD_RESET.limit; i++) {
      const res = await post('/user/forgot_password_reset', { token: `jeton-${i}`, password: 'x' }, ip);
      assert.equal(res.status, 400);
    }
    const blocked = await post('/user/forgot_password_reset', { token: 'jeton-x', password: 'x' }, ip);
    assert.equal(blocked.status, 429);
  });

  test('connexion : le double slash (/user//signin) partage le compteur et ne contourne pas la limite', async () => {
    const ip = newIp();
    for (let i = 0; i < RATE_LIMITS.SIGNIN.limit; i++) {
      const path = i % 2 ? '/user//signin' : '/user/signin';
      const res = await post(path, { email: 'inconnu@example.com', password: 'x' }, ip);
      assert.equal(res.status, 401);
    }
    const blocked = await post('/user//signin', { email: 'inconnu@example.com', password: 'x' }, ip);
    assert.equal(blocked.status, 429);
    assert.deepEqual(blocked.body, TOO_MANY);
  });

  test('contact : limite par IP, y compris via /contact//', async () => {
    const ip = newIp();
    const body = { name: 'Agent', email: 'agent@example.com', subject: 'Sujet', message: 'Message' };
    for (let i = 0; i < RATE_LIMITS.CONTACT.limit; i++) {
      const res = await post('/contact//', body, ip);
      assert.equal(res.status, 200);
    }
    const blocked = await post('/contact//', body, ip);
    assert.equal(blocked.status, 429);
    assert.deepEqual(blocked.body, TOO_MANY);
    assert.equal((await post('/contact', body, ip)).status, 429);
  });

  test('mot de passe oublié : une adresse vide ne crée pas de compteur par e-mail partagé', async () => {
    for (let i = 0; i < RATE_LIMITS.FORGOT_PASSWORD_PER_EMAIL.limit + 2; i++) {
      const res = await post('/user/forgot_password', { email: '   ' }, newIp());
      // Même réponse que le compte existe ou non (SEC-09)
      assert.equal(res.status, 200);
    }
  });
});
