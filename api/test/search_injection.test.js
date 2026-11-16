/* eslint-env node */
// Tests SEC-04 / SEC-14 (audit Adacis) : saisie échappée dans les recherches $regex, valeurs non textuelles refusées,
// liste fermée pour les champs de tri.
// Lancer : npm test (aucune connexion MongoDB nécessaire, les modèles sont simulés en mémoire).
process.env.SECRET = 'test-secret';

const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');

const User = require('../src/models/user');
const Action = require('../src/models/action');
const Collectivity = require('../src/models/collectivity');
const EconomicActor = require('../src/models/economic_actor');
const EconomicActorQuestion = require('../src/models/economic_actor_question');
const Indicator = require('../src/models/indicator');
const { escapeRegex } = require('../src/utils/search');
const ERROR_CODES = require('../src/utils/errorCodes');

const admin = { _id: 'u-admin', name: 'Admin', role: 'admin', collectivities: [] };

// Dernières requêtes reçues par les modèles simulés
let captured;

const chain = () => {
  const query = {
    sort: (s) => {
      captured.sort = s;
      return query;
    },
    skip: () => query,
    limit: () => query,
    then: (resolve, reject) => Promise.resolve([]).then(resolve, reject),
  };
  return query;
};

for (const Model of [Action, Collectivity, EconomicActor, EconomicActorQuestion, Indicator]) {
  Model.find = (query) => {
    captured.query = query;
    return chain();
  };
  Model.countDocuments = async () => 0;
}
User.findOne = async (query) => (query._id === admin._id ? admin : null);
User.find = (query) => {
  captured.query = query;
  return chain();
};
User.countDocuments = async () => 0;
Action.aggregate = async () => [];

let server;
let baseUrl;

const post = async (path, body) => {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `JWT ${jwt.sign({ _id: admin._id }, process.env.SECRET)}` },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json().catch(() => null) };
};

before(async () => {
  const app = express();
  app.set('env', 'test');
  app.use(cookieParser());
  app.use(express.json());
  require('../src/services/passport')(app);
  app.use('/user', require('../src/controllers/user'));
  app.use('/action', require('../src/controllers/action'));
  app.use('/collectivity', require('../src/controllers/collectivity'));
  app.use('/indicator', require('../src/controllers/indicator'));
  app.use('/economic_actor', require('../src/controllers/economic_actor'));
  app.use('/economic_actor_question', require('../src/controllers/economic_actor_question'));
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => server.close());

beforeEach(() => {
  captured = {};
});

// Chaque route de recherche, avec le champ de saisie et le moyen de retrouver les filtres $regex construits
const routes = [
  { path: '/action/search', field: 'search', regexes: (q) => [q.name] },
  { path: '/collectivity/search', field: 'search', regexes: (q) => [q.name] },
  { path: '/indicator/search', field: 'name', regexes: (q) => [q.name], extra: { page: 0 } },
  { path: '/economic_actor/search', field: 'search', regexes: (q) => q.$or.map((c) => c.name || c.description) },
  { path: '/economic_actor_question/search', field: 'search', regexes: (q) => [q.label] },
  { path: '/user/search', field: 'search', regexes: (q) => q.$or.map((c) => c.name || c.email) },
];

describe('SEC-04 : recherches $regex', () => {
  test('escapeRegex neutralise les métacaractères', () => {
    assert.equal(escapeRegex('a.*(b)|[c]^$?+{1}\\'), 'a\\.\\*\\(b\\)\\|\\[c\\]\\^\\$\\?\\+\\{1\\}\\\\');
    assert.ok(new RegExp(escapeRegex('(a+)+$')).test('x(a+)+$'));
  });

  for (const { path, field, regexes, extra } of routes) {
    test(`${path} : la saisie est échappée`, async () => {
      const res = await post(path, { ...extra, [field]: '.*' });
      assert.equal(res.status, 200);
      for (const r of regexes(captured.query)) assert.deepEqual(r, { $regex: '\\.\\*', $options: 'i' });
    });

    test(`${path} : un objet { $ne: null } est refusé`, async () => {
      const res = await post(path, { ...extra, [field]: { $ne: null } });
      assert.equal(res.status, 400);
      assert.equal(res.body.code, ERROR_CODES.INVALID_BODY);
      assert.equal(captured.query, undefined);
    });

    test(`${path} : un tableau est refusé`, async () => {
      const res = await post(path, { ...extra, [field]: ['a'] });
      assert.equal(res.status, 400);
    });

    test(`${path} : une recherche vide reste acceptée`, async () => {
      const res = await post(path, { ...extra, [field]: '' });
      assert.equal(res.status, 200);
    });
  }
});

describe('SEC-14 : liste fermée pour les tris', () => {
  test('collectivité : un champ hors liste retombe sur createdAt', async () => {
    const res = await post('/collectivity/search', { sortBy: 'sharepoint_folder_id', sortOrder: 'asc' });
    assert.equal(res.status, 200);
    assert.deepEqual(captured.sort, { createdAt: 1 });
  });

  test('collectivité : un objet en sortBy retombe sur createdAt', async () => {
    const res = await post('/collectivity/search', { sortBy: { $gt: '' } });
    assert.equal(res.status, 200);
    assert.deepEqual(captured.sort, { createdAt: -1 });
  });

  test('collectivité : un champ autorisé est conservé', async () => {
    const res = await post('/collectivity/search', { sortBy: 'name', sortOrder: 'asc' });
    assert.equal(res.status, 200);
    assert.deepEqual(captured.sort, { name: 1 });
  });

  test('utilisateurs : les champs sensibles sont ignorés dans le tri', async () => {
    const res = await post('/user/search', { sort: { password: 1, password_reset_token: -1, name: 'desc', email: 1 } });
    assert.equal(res.status, 200);
    assert.deepEqual(captured.sort, { name: -1, email: 1 });
  });

  test('utilisateurs : un tri sous forme de chaîne est ignoré', async () => {
    const res = await post('/user/search', { sort: 'password' });
    assert.equal(res.status, 200);
    assert.deepEqual(captured.sort, {});
  });
});
