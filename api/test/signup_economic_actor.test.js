/* eslint-env node */
// Inscription en autonomie d'un acteur économique depuis « Créer un compte » :
// création de l'organisation, rôle, CGU, et mêmes règles de validation que pour un acteur public.
// Lancer : npm test (aucune connexion MongoDB nécessaire, les modèles sont simulés en mémoire).
process.env.SECRET = 'test-secret';
process.env.ENVIRONMENT = 'production';

const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const cookieParser = require('cookie-parser');

const User = require('../src/models/user');
const EconomicActor = require('../src/models/economic_actor');
const ERROR_CODES = require('../src/utils/errorCodes');

const PASSWORD = 'MotDePasse-Correct-123!';

// ---------- Modèles simulés ----------
let createdUser;
let createdActors;
let userCreateError;

User.findOne = async () => null;
User.create = async (payload) => {
  if (userCreateError) throw userCreateError;
  createdUser = { _id: 'u-ae', ...payload };
  return createdUser;
};
EconomicActor.create = async (payload) => {
  const actor = { _id: `ea-${createdActors.length + 1}`, ...payload };
  createdActors.push(actor);
  return actor;
};
EconomicActor.deleteOne = async ({ _id }) => {
  createdActors = createdActors.filter((actor) => actor._id !== _id);
};

// ---------- Serveur de test ----------
let server;
let baseUrl;

const signup = async (body) => {
  const response = await fetch(`${baseUrl}/user/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
};

const validBody = (overrides = {}) => ({
  email: 'Contact@Transporteur.fr ',
  password: PASSWORD,
  name: 'Camille Martin',
  role: 'economic_actor',
  economic_actor_name: '  Transports Exemple  ',
  rgpd_accepted: true,
  ...overrides,
});

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
  createdUser = null;
  createdActors = [];
  userCreateError = null;
});

test("crée le compte acteur économique, son organisation et enregistre les CGU", async () => {
  const res = await signup(validBody());
  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
  assert.ok(res.body.token, 'le front doit recevoir un jeton pour être connecté');

  assert.equal(createdActors.length, 1);
  assert.equal(createdActors[0].name, 'Transports Exemple');

  assert.equal(createdUser.role, 'economic_actor');
  assert.equal(createdUser.email, 'contact@transporteur.fr');
  assert.equal(createdUser.economic_actor_id, 'ea-1');
  assert.equal(createdUser.economic_actor_name, 'Transports Exemple');
  assert.ok(createdUser.rgpd_accepted_at instanceof Date);
  assert.equal(createdUser.collectivities, undefined, 'aucun territoire : il doit en demander un');
});

test('refuse un acteur économique sans nom de structure', async () => {
  for (const economic_actor_name of [undefined, '', '   ', 42, 'x'.repeat(101)]) {
    const res = await signup(validBody({ economic_actor_name }));
    assert.equal(res.status, 400, `nom ${JSON.stringify(economic_actor_name)} accepté`);
    assert.equal(res.body.ok, false);
    assert.equal(res.body.code, ERROR_CODES.INVALID_BODY);
  }
  assert.equal(createdActors.length, 0);
  assert.equal(createdUser, null);
});

test('applique les règles de mot de passe et ne crée aucune organisation sinon', async () => {
  for (const password of ['court', 'motdepasse-sans-majuscule-1!']) {
    const res = await signup(validBody({ password }));
    assert.equal(res.status, 400, `mot de passe ${JSON.stringify(password)} accepté`);
    assert.equal(res.body.code, ERROR_CODES.PASSWORDS_NOT_MATCH);
  }
  for (const password of [undefined, '', 123456789012]) {
    const res = await signup(validBody({ password }));
    assert.equal(res.status, 400, `mot de passe ${JSON.stringify(password)} accepté`);
    assert.equal(res.body.code, ERROR_CODES.EMAIL_AND_PASSWORD_REQUIRED);
  }
  assert.equal(createdActors.length, 0);
  assert.equal(createdUser, null);
});

test("refuse un e-mail absent ou qui n'est pas du texte", async () => {
  for (const email of [undefined, '', '   ', 42, ['a@b.fr'], { $ne: null }]) {
    const res = await signup(validBody({ email }));
    assert.equal(res.status, 400, `e-mail ${JSON.stringify(email)} accepté`);
  }
  assert.equal(createdActors.length, 0);
  assert.equal(createdUser, null);
});

test("refuse un nom d'utilisateur qui n'est pas du texte", async () => {
  for (const name of [42, ['a'], { a: 1 }]) {
    const res = await signup(validBody({ name }));
    assert.equal(res.status, 400, `nom ${JSON.stringify(name)} accepté`);
  }
  assert.equal(createdActors.length, 0);
  assert.equal(createdUser, null);
});

test("ne laisse pas d'organisation sans membre si la création du compte échoue", async () => {
  userCreateError = Object.assign(new Error('E11000 duplicate key'), { code: 11000 });
  const res = await signup(validBody());
  assert.equal(res.status, 409);
  assert.equal(res.body.code, ERROR_CODES.USER_ALREADY_REGISTERED);
  assert.equal(createdActors.length, 0);

  userCreateError = new Error('panne');
  const other = await signup(validBody());
  assert.equal(other.status, 500);
  assert.equal(createdActors.length, 0);
});

test("un acteur public n'a pas besoin de nom de structure et ne crée pas d'organisation", async () => {
  const res = await signup(validBody({ role: 'user', economic_actor_name: undefined }));
  assert.equal(res.status, 200);
  assert.equal(createdUser.role, 'user');
  assert.equal(createdActors.length, 0);
});

test('le rôle admin ne peut pas être obtenu par inscription', async () => {
  const res = await signup(validBody({ role: 'admin' }));
  assert.equal(res.status, 200);
  assert.equal(createdUser.role, 'user');
});
