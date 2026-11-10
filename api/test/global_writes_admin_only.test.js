/* eslint-env node */
// Tests des droits d'écriture sur les indicateurs, les catégories d'indicateurs et les droits utilisateurs par action.
// Lancer : npm test (aucune connexion MongoDB nécessaire, les modèles sont simulés en mémoire).
process.env.SECRET = 'test-secret';

const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');

const User = require('../src/models/user');
const Indicator = require('../src/models/indicator');
const IndicatorCategory = require('../src/models/indicator_category');
const IndicatorValue = require('../src/models/indicator_value');
const Log = require('../src/models/log');
const UserActionRight = require('../src/models/user_action_right');

// ---------- Utilisateurs simulés ----------
const users = {
  admin: { _id: 'u-admin', name: 'Admin', role: 'admin', collectivities: [] },
  member: { _id: 'u-member', name: 'Membre A', role: 'user', collectivities: [{ id: 'col-a', role: 'user', status: 'approved' }] },
  adminA: { _id: 'u-admin-a', name: 'Admin A', role: 'user', collectivities: [{ id: 'col-a', role: 'admin', status: 'approved' }] },
  adminB: { _id: 'u-admin-b', name: 'Admin B', role: 'user', collectivities: [{ id: 'col-b', role: 'admin', status: 'approved' }] },
  pendingAdminA: { _id: 'u-pending-a', name: 'Admin A en attente', role: 'user', collectivities: [{ id: 'col-a', role: 'admin', status: 'pending' }] },
  ae: { _id: 'u-ae', name: 'AE', role: 'economic_actor', economic_actor_id: 'ea-1', collectivities: [] },
};

let store;
let nextId;

const chain = (rows) => {
  const query = {
    sort: () => query,
    skip: () => query,
    limit: () => query,
    then: (resolve, reject) => Promise.resolve(rows).then(resolve, reject),
  };
  return query;
};

// Simule les méthodes Mongoose utilisées par les contrôleurs sur une collection en mémoire
const mockModel = (Model, key, prefix) => {
  Model.findById = async (id) => store[key].find((d) => d._id === id) || null;
  Model.findOne = async (query) => store[key].find((d) => d._id === query._id) || null;
  Model.countDocuments = async () => store[key].length;
  Model.find = () => chain(store[key]);
  Model.create = async (body) => {
    const doc = { ...body, _id: `${prefix}-${nextId++}` };
    store[key].push(doc);
    return doc;
  };
  Model.findByIdAndUpdate = async (id, body) => {
    const doc = store[key].find((d) => d._id === id);
    if (!doc) return null;
    return Object.assign(doc, body);
  };
  Model.findByIdAndDelete = async (id) => {
    const doc = store[key].find((d) => d._id === id);
    store[key] = store[key].filter((d) => d._id !== id);
    return doc || null;
  };
  Model.deleteOne = async (query) => {
    store[key] = store[key].filter((d) => d._id !== query._id);
  };
};

User.findOne = async (query) => Object.values(users).find((u) => u._id === query._id) || null;
mockModel(Indicator, 'indicators', 'ind');
mockModel(IndicatorCategory, 'categories', 'cat');
mockModel(UserActionRight, 'rights', 'right');
Log.create = async () => ({});
Log.insertMany = async () => [];
IndicatorValue.updateMany = async () => ({});

// ---------- Serveur de test ----------
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
  app.use('/indicator', require('../src/controllers/indicator'));
  app.use('/indicator_category', require('../src/controllers/indicator_category'));
  app.use('/user_action_right', require('../src/controllers/user_action_right'));
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => server.close());

beforeEach(() => {
  nextId = 1;
  store = {
    indicators: [{ _id: 'ind-x', name: 'Indicateur X', value_type: 'number', value_possibilities: [] }],
    categories: [{ _id: 'cat-x', name: 'Catégorie X', type: 'principal' }],
    rights: [
      { _id: 'right-a', user_id: 'u-member', collectivity_id: 'col-a', action_id: 'act-a', can_read: true, can_write: false },
      { _id: 'right-b', user_id: 'u-other', collectivity_id: 'col-b', action_id: 'act-b', can_read: true, can_write: false },
    ],
  };
});

// ---------- Indicateurs et catégories ----------
for (const [resource, key, existingId] of [
  ['indicator', 'indicators', 'ind-x'],
  ['indicator_category', 'categories', 'cat-x'],
]) {
  describe(`Écritures sur /${resource}`, () => {
    test('un admin crée, modifie et supprime', async () => {
      const created = await call('POST', `/${resource}`, 'admin', { name: 'Nouveau' });
      assert.equal(created.status, 200);
      assert.equal(created.body.data.name, 'Nouveau');

      const updated = await call('PUT', `/${resource}/${existingId}`, 'admin', { name: 'Renommé', value_type: 'number', value_possibilities: [] });
      assert.equal(updated.status, 200);
      assert.equal(updated.body.data.name, 'Renommé');

      assert.equal((await call('DELETE', `/${resource}/${existingId}`, 'admin')).status, 200);
      assert.equal(store[key].some((d) => d._id === existingId), false);
    });

    test('un utilisateur de collectivité ou un acteur économique ne peut ni créer, ni modifier, ni supprimer', async () => {
      for (const who of ['member', 'adminA', 'ae']) {
        assert.equal((await call('POST', `/${resource}`, who, { name: 'Intrus' })).status, 401);
        assert.equal((await call('PUT', `/${resource}/${existingId}`, who, { name: 'Intrus' })).status, 401);
        assert.equal((await call('DELETE', `/${resource}/${existingId}`, who)).status, 401);
      }
      assert.equal(store[key].length, 1);
      assert.equal(store[key][0].name, resource === 'indicator' ? 'Indicateur X' : 'Catégorie X');
    });

    test('un utilisateur de collectivité ou un acteur économique peut toujours lire et chercher', async () => {
      for (const who of ['member', 'ae', 'admin']) {
        const read = await call('GET', `/${resource}/${existingId}`, who);
        assert.equal(read.status, 200);
        assert.equal(read.body.data._id, existingId);
        const search = await call('POST', `/${resource}/search`, who, {});
        assert.equal(search.status, 200);
        assert.equal(search.body.data.length, 1);
      }
    });

    test('sans token : refusé', async () => {
      assert.equal((await call('POST', `/${resource}`, null, { name: 'X' })).status, 401);
    });
  });
}

// ---------- Droits utilisateurs par action ----------
describe('Écritures sur /user_action_right', () => {
  test('un admin plateforme crée, modifie et supprime un droit de n’importe quelle collectivité', async () => {
    const created = await call('POST', '/user_action_right', 'admin', { user_id: 'u-other', collectivity_id: 'col-b', action_id: 'act-c' });
    assert.equal(created.status, 200);
    assert.equal((await call('PUT', '/user_action_right/right-b', 'admin', { can_write: true, collectivity_id: 'col-a' })).status, 200);
    assert.equal(store.rights.find((r) => r._id === 'right-b').collectivity_id, 'col-a');
    assert.equal((await call('DELETE', '/user_action_right/right-b', 'admin')).status, 200);
  });

  test('un admin de la collectivité gère les droits de sa collectivité', async () => {
    const created = await call('POST', '/user_action_right', 'adminA', { user_id: 'u-member', collectivity_id: 'col-a', action_id: 'act-a2' });
    assert.equal(created.status, 200);

    // Le front renvoie le document complet : mêmes collectivity_id et user_id, accepté
    const updated = await call('PUT', '/user_action_right/right-a', 'adminA', { ...store.rights[0], can_write: true });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.data.can_write, true);

    assert.equal((await call('DELETE', '/user_action_right/right-a', 'adminA')).status, 200);
    assert.equal(store.rights.some((r) => r._id === 'right-a'), false);
  });

  test('un simple membre, un admin en attente ou un acteur économique est refusé', async () => {
    for (const who of ['member', 'pendingAdminA', 'ae']) {
      assert.equal((await call('POST', '/user_action_right', who, { user_id: 'u-member', collectivity_id: 'col-a', action_id: 'act-a' })).status, 403);
      assert.equal((await call('PUT', '/user_action_right/right-a', who, { can_write: true })).status, 403);
      assert.equal((await call('DELETE', '/user_action_right/right-a', who)).status, 403);
    }
    assert.equal(store.rights.length, 2);
    assert.equal(store.rights[0].can_write, false);
  });

  test("un admin d'une autre collectivité est refusé", async () => {
    assert.equal((await call('POST', '/user_action_right', 'adminB', { user_id: 'u-member', collectivity_id: 'col-a', action_id: 'act-a' })).status, 403);
    assert.equal((await call('PUT', '/user_action_right/right-a', 'adminB', { can_write: true })).status, 403);
    assert.equal((await call('DELETE', '/user_action_right/right-a', 'adminB')).status, 403);
    assert.equal(store.rights.length, 2);
    assert.equal(store.rights[0].can_write, false);
  });

  test("un admin de collectivité ne peut pas déplacer un droit vers une autre collectivité ou un autre utilisateur", async () => {
    assert.equal((await call('PUT', '/user_action_right/right-a', 'adminA', { collectivity_id: 'col-b' })).status, 403);
    assert.equal((await call('PUT', '/user_action_right/right-a', 'adminA', { user_id: 'u-other' })).status, 403);
    assert.equal(store.rights[0].collectivity_id, 'col-a');
    assert.equal(store.rights[0].user_id, 'u-member');
  });

  test('collectivity_id obligatoire pour un non-admin, droit inconnu : 404', async () => {
    assert.equal((await call('POST', '/user_action_right', 'adminA', { user_id: 'u-member', action_id: 'act-a' })).status, 400);
    assert.equal((await call('PUT', '/user_action_right/right-absent', 'adminA', { can_write: true })).status, 404);
    assert.equal((await call('DELETE', '/user_action_right/right-absent', 'admin')).status, 404);
  });

  test('la recherche reste ouverte aux utilisateurs connectés', async () => {
    const search = await call('POST', '/user_action_right/search', 'member', { user_id: 'u-member' });
    assert.equal(search.status, 200);
  });
});
