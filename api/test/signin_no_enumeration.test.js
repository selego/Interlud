/* eslint-env node */
// SEC-09 : la connexion et « mot de passe oublié » ne doivent pas révéler si un compte existe.
// Lancer : npm test (aucune connexion MongoDB nécessaire, les modèles sont simulés en mémoire).
process.env.SECRET = 'test-secret';
process.env.ENVIRONMENT = 'production';

const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');

const User = require('../src/models/user');
const UserActionRight = require('../src/models/user_action_right');
const Collectivity = require('../src/models/collectivity');
const EconomicActor = require('../src/models/economic_actor');
const brevo = require('../src/services/brevo');
const ERROR_CODES = require('../src/utils/errorCodes');

const PASSWORD = 'MotDePasse-Correct-123!';
const PASSWORD_HASH = bcrypt.hashSync(PASSWORD, 4);

// ---------- Modèles simulés ----------
let users;
let sentEmails;
let compareCalls;

const makeUser = () => {
  const doc = {
    _id: 'u-1',
    name: 'Utilisatrice',
    email: 'existe@exemple.fr',
    role: 'user',
    password: PASSWORD_HASH,
    collectivities: [],
    comparePassword(p) {
      return bcrypt.compare(p, this.password);
    },
    set(values) {
      Object.assign(this, values);
    },
    save: async () => doc,
    toJSON() {
      return { _id: this._id, name: this.name, email: this.email, role: this.role };
    },
  };
  return doc;
};

User.findOne = async (query) => users.find((u) => u.email === query.email) || null;
UserActionRight.find = async () => [];
Collectivity.findById = async () => null;
Collectivity.findOne = async () => null;
EconomicActor.findById = async () => null;
brevo.sendEmail = async (html, options) => {
  sentEmails.push(options);
};

// Compte les comparaisons bcrypt (atténuation de l'attaque temporelle)
const originalCompare = bcrypt.compare;
bcrypt.compare = (...args) => {
  compareCalls += 1;
  return originalCompare(...args);
};

// ---------- Serveur de test ----------
let server;
let baseUrl;

const post = async (path, body) => {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
};

before(async () => {
  const app = express();
  app.use(cookieParser());
  app.use(express.json());
  require('../src/services/passport')(app);
  app.use('/user', require('../src/controllers/user'));
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => server.close());

beforeEach(() => {
  users = [makeUser()];
  sentEmails = [];
  compareCalls = 0;
});

describe('POST /user/signin', () => {
  test('e-mail inconnu et mauvais mot de passe donnent exactement la même réponse', async () => {
    const unknown = await post('/user/signin', { email: 'inconnu@exemple.fr', password: 'peu-importe' });
    const wrong = await post('/user/signin', { email: 'existe@exemple.fr', password: 'mauvais' });

    assert.equal(unknown.status, 401);
    assert.deepEqual(unknown, wrong);
    assert.deepEqual(unknown.body, { ok: false, code: ERROR_CODES.EMAIL_OR_PASSWORD_INVALID });
    assert.equal(ERROR_CODES.EMAIL_OR_PASSWORD_INVALID, 'E-mail ou mot de passe invalide');
  });

  test('un e-mail inconnu déclenche quand même une comparaison bcrypt', async () => {
    await post('/user/signin', { email: 'inconnu@exemple.fr', password: 'peu-importe' });
    assert.equal(compareCalls, 1);
  });

  test('le bon mot de passe connecte toujours', async () => {
    const res = await post('/user/signin', { email: 'existe@exemple.fr', password: PASSWORD });
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.ok(res.body.token);
  });
});

describe('POST /user/forgot_password', () => {
  test('même réponse que le compte existe ou non', async () => {
    const unknown = await post('/user/forgot_password', { email: 'inconnu@exemple.fr' });
    const known = await post('/user/forgot_password', { email: 'existe@exemple.fr' });

    assert.equal(unknown.status, 200);
    assert.deepEqual(unknown, known);
    assert.deepEqual(known.body, { ok: true });
  });

  test("le mail n'est envoyé que si le compte existe", async () => {
    await post('/user/forgot_password', { email: 'inconnu@exemple.fr' });
    assert.equal(sentEmails.length, 0);

    await post('/user/forgot_password', { email: 'existe@exemple.fr' });
    assert.equal(sentEmails.length, 1);
    assert.deepEqual(sentEmails[0].to, [{ email: 'existe@exemple.fr' }]);
    assert.ok(users[0].password_reset_token);
  });
});
