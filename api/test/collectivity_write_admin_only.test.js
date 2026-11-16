/* eslint-env node */
// Création, modification et suppression de collectivité : création et suppression réservées aux admins,
// modification ouverte aux admins de la collectivité (approuvés).
// Lancer : npm test (aucune connexion MongoDB ni Microsoft Graph nécessaire, les modèles sont simulés en mémoire).
process.env.SECRET = 'test-secret';

const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');

const User = require('../src/models/user');
const Collectivity = require('../src/models/collectivity');
const microsoftGraph = require('../src/services/microsoftGraph');

// Services SharePoint simulés (avant le chargement du contrôleur, qui les déstructure)
microsoftGraph.createFolder = async () => 'folder-test';
microsoftGraph.duplicateExcelFile = async () => 'file-test';

const users = {
  admin: { _id: 'u-admin', name: 'Admin', role: 'admin', collectivities: [] },
  member: { _id: 'u-member', name: 'Membre A', role: 'user', collectivities: [{ id: 'col-a', role: 'user', status: 'approved' }] },
  adminA: { _id: 'u-admin-a', name: 'Admin A', role: 'user', collectivities: [{ id: 'col-a', role: 'admin', status: 'approved' }] },
  pendingAdminA: { _id: 'u-pending-a', name: 'Admin A en attente', role: 'user', collectivities: [{ id: 'col-a', role: 'admin', status: 'pending' }] },
  adminB: { _id: 'u-admin-b', name: 'Admin B', role: 'user', collectivities: [{ id: 'col-b', role: 'admin', status: 'approved' }] },
  ae: { _id: 'u-ae', name: 'AE', role: 'economic_actor', economic_actor_id: 'ea-1', collectivities: [] },
};

let store;
let nextId;

// Document simulé : expose les méthodes Mongoose utilisées par le contrôleur
const makeDoc = (data) => {
  const doc = { ...data };
  Object.defineProperties(doc, {
    set: { value: (body) => Object.assign(doc, body) },
    save: { value: async () => doc },
  });
  return doc;
};

User.findOne = async (query) => Object.values(users).find((u) => u._id === query._id) || null;
Collectivity.findById = async (id) => store.collectivities.find((c) => c._id === id) || null;
Collectivity.findOne = async (query) => store.collectivities.find((c) => c.name === query.name) || null;
Collectivity.create = async (body) => {
  const doc = makeDoc({ ...body, _id: `col-${nextId++}` });
  store.collectivities.push(doc);
  return doc;
};
Collectivity.findByIdAndDelete = async (id) => {
  const doc = store.collectivities.find((c) => c._id === id);
  store.collectivities = store.collectivities.filter((c) => c._id !== id);
  return doc || null;
};

let server;
let baseUrl;

const call = async (method, path, who, body) => {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(who ? { Authorization: `JWT ${jwt.sign({ _id: users[who]._id }, process.env.SECRET)}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch (e) {
    json = null;
  }
  return { status: response.status, body: json };
};

before(async () => {
  const app = express();
  app.set('env', 'test');
  app.use(cookieParser());
  app.use(express.json());
  require('../src/services/passport')(app);
  app.use('/collectivity', require('../src/controllers/collectivity'));
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => server.close());

beforeEach(() => {
  nextId = 1;
  store = {
    collectivities: [makeDoc({ _id: 'col-a', name: 'Collectivité A' }), makeDoc({ _id: 'col-b', name: 'Collectivité B' })],
  };
});

describe('POST /collectivity', () => {
  test('un admin crée une collectivité', async () => {
    const res = await call('POST', '/collectivity', 'admin', { name: 'Nouvelle' });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.name, 'Nouvelle');
    assert.ok(store.collectivities.some((c) => c.name === 'Nouvelle'));
  });

  for (const who of ['member', 'adminA', 'ae']) {
    test(`refusé pour ${who}`, async () => {
      const res = await call('POST', '/collectivity', who, { name: 'Intruse' });
      assert.equal(res.status, 403);
      assert.deepEqual(res.body, { ok: false, code: 'Accès refusé' });
      assert.equal(store.collectivities.some((c) => c.name === 'Intruse'), false);
    });
  }

  test('refusé sans authentification', async () => {
    assert.equal((await call('POST', '/collectivity', null, { name: 'Intruse' })).status, 401);
  });
});

describe('DELETE /collectivity/:id', () => {
  test('un admin supprime une collectivité', async () => {
    assert.equal((await call('DELETE', '/collectivity/col-a', 'admin')).status, 200);
    assert.equal(store.collectivities.some((c) => c._id === 'col-a'), false);
  });

  for (const who of ['member', 'adminA', 'ae']) {
    test(`refusé pour ${who}`, async () => {
      const res = await call('DELETE', '/collectivity/col-a', who);
      assert.equal(res.status, 403);
      assert.deepEqual(res.body, { ok: false, code: 'Accès refusé' });
      assert.ok(store.collectivities.some((c) => c._id === 'col-a'));
    });
  }

  test('refusé sans authentification', async () => {
    assert.equal((await call('DELETE', '/collectivity/col-a', null)).status, 401);
  });
});

describe('PUT /collectivity/:id', () => {
  test('un admin modifie une collectivité', async () => {
    const res = await call('PUT', '/collectivity/col-a', 'admin', { name: 'Renommée' });
    assert.equal(res.status, 200);
    assert.equal(store.collectivities.find((c) => c._id === 'col-a').name, 'Renommée');
  });

  test('un admin approuvé de la collectivité la modifie', async () => {
    const res = await call('PUT', '/collectivity/col-a', 'adminA', { name: 'Renommée par A' });
    assert.equal(res.status, 200);
    assert.equal(store.collectivities.find((c) => c._id === 'col-a').name, 'Renommée par A');
  });

  for (const who of ['member', 'pendingAdminA', 'adminB', 'ae']) {
    test(`refusé pour ${who}`, async () => {
      const res = await call('PUT', '/collectivity/col-a', who, { name: 'Intruse' });
      assert.equal(res.status, 403);
      assert.equal(store.collectivities.find((c) => c._id === 'col-a').name, 'Collectivité A');
    });
  }
});
