/* eslint-env node */
// Suppression d'une action : mêmes droits que sa modification (admin plateforme, membre approuvé de la collectivité
// hors rôle acteur économique, ou acteur économique propriétaire).
// Lancer : npm test (aucune connexion MongoDB ni Microsoft Graph nécessaire, les modèles sont simulés en mémoire).
process.env.SECRET = 'test-secret';

const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

const User = require('../src/models/user');
const Action = require('../src/models/action');
const IndicatorValue = require('../src/models/indicator_value');
const Log = require('../src/models/log');
const Collectivity = require('../src/models/collectivity');
const EconomicActor = require('../src/models/economic_actor');
const microsoftGraph = require('../src/services/microsoftGraph');

let store;

// SharePoint simulé (avant le chargement du contrôleur, qui le déstructure) : on garde la trace des appels
microsoftGraph.graphFetch = async (endpoint, options = {}) => {
  store.graphCalls.push({ endpoint, method: options.method || 'GET' });
  return { id: 'site-test', values: [] };
};

const ACTION_COL = 'aaaaaaaaaaaaaaaaaaaaaaa1';
const ACTION_AE = 'aaaaaaaaaaaaaaaaaaaaaaa2';
const ACTION_GLOBAL = 'aaaaaaaaaaaaaaaaaaaaaaa3';
const ACTION_UNKNOWN = 'aaaaaaaaaaaaaaaaaaaaaaa9';

const users = {
  admin: { _id: 'u-admin', name: 'Admin', role: 'admin', collectivities: [] },
  memberA: { _id: 'u-member-a', name: 'Membre A', role: 'user', collectivities: [{ id: 'col-a', role: 'user', status: 'approved' }] },
  adminA: { _id: 'u-admin-a', name: 'Admin A', role: 'user', collectivities: [{ id: 'col-a', role: 'admin', status: 'approved' }] },
  pendingA: { _id: 'u-pending-a', name: 'Membre A en attente', role: 'user', collectivities: [{ id: 'col-a', role: 'admin', status: 'pending' }] },
  rejectedA: { _id: 'u-rejected-a', name: 'Membre A refusé', role: 'user', collectivities: [{ id: 'col-a', role: 'admin', status: 'rejected' }] },
  aeRoleMemberA: { _id: 'u-ae-role-a', name: 'Adhésion acteur économique', role: 'user', collectivities: [{ id: 'col-a', role: 'economic_actor', status: 'approved' }] },
  memberB: { _id: 'u-member-b', name: 'Membre B', role: 'user', collectivities: [{ id: 'col-b', role: 'admin', status: 'approved' }] },
  aeOwner: { _id: 'u-ae-1', name: 'AE 1', role: 'economic_actor', economic_actor_id: 'ea-1', collectivities: [{ id: 'col-a', role: 'economic_actor', status: 'approved' }] },
  aeOther: { _id: 'u-ae-2', name: 'AE 2', role: 'economic_actor', economic_actor_id: 'ea-2', collectivities: [{ id: 'col-a', role: 'economic_actor', status: 'approved' }] },
  noCollectivity: { _id: 'u-none', name: 'Sans collectivité', role: 'user', collectivities: [] },
};

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
Action.findById = async (id) => store.actions.find((a) => a._id === id) || null;
// Comme Mongoose, un identifiant mal formé lève une erreur de conversion
Action.findOne = async (query) => {
  if (!mongoose.isValidObjectId(query._id)) throw new Error('Cast to ObjectId failed');
  return store.actions.find((a) => a._id === query._id) || null;
};
Action.find = async () => [];
Action.deleteOne = async (query) => {
  store.actions = store.actions.filter((a) => a._id !== query._id);
};
IndicatorValue.deleteMany = async (query) => {
  store.values = store.values.filter((v) => v.action_id !== query.action_id);
};
IndicatorValue.updateMany = async () => ({});
Log.create = async (body) => {
  store.logs.push(body);
  return body;
};
Log.insertMany = async (logs) => {
  store.logs.push(...logs);
  return logs;
};
Collectivity.findById = async () => null;
EconomicActor.findById = async () => null;

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
  app.use('/action', require('../src/controllers/action'));
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => server.close());

beforeEach(() => {
  store = {
    actions: [
      makeDoc({ _id: ACTION_COL, name: 'Action collectivité A', type: 'custom', owner: 'collectivity', collectivity_id: 'col-a', exel_files_prev: [{ excel_file_id: 'file-1', year_prev: 2030 }], excel_files_expost: [] }),
      makeDoc({ _id: ACTION_AE, name: 'Action acteur 1', type: 'custom', owner: 'economic_actor', collectivity_id: 'col-a', economic_actor_id: 'ea-1', exel_files_prev: [{ excel_file_id: 'file-2', year_prev: 2030 }], excel_files_expost: [] }),
      makeDoc({ _id: ACTION_GLOBAL, name: 'Fiche du catalogue', type: 'global', owner: 'collectivity', exel_files_prev: [], excel_files_expost: [] }),
    ],
    values: [
      { _id: 'iv-1', action_id: ACTION_COL },
      { _id: 'iv-2', action_id: ACTION_AE },
    ],
    logs: [],
    graphCalls: [],
  };
});

const assertNothingDeleted = () => {
  assert.equal(store.actions.length, 3);
  assert.equal(store.values.length, 2);
  assert.deepEqual(store.logs, []);
  assert.deepEqual(store.graphCalls, []);
};

const assertDeleted = (actionId, fileId) => {
  assert.equal(store.actions.some((a) => a._id === actionId), false);
  assert.equal(store.values.some((v) => v.action_id === actionId), false);
  assert.equal(store.actions.length, 2);
  assert.equal(store.values.length, 1);
  assert.ok(store.graphCalls.some((c) => c.method === 'DELETE' && c.endpoint.endsWith(`/drive/items/${fileId}`)));
  assert.equal(store.logs.length, 1);
  assert.equal(store.logs[0].operation, 'delete');
};

describe("DELETE /action/:id — action d'une collectivité", () => {
  for (const who of ['admin', 'memberA', 'adminA']) {
    test(`autorisé pour ${who}`, async () => {
      const res = await call('DELETE', `/action/${ACTION_COL}`, who);
      assert.equal(res.status, 200);
      assert.deepEqual(res.body, { ok: true });
      assertDeleted(ACTION_COL, 'file-1');
    });
  }

  for (const who of ['memberB', 'pendingA', 'rejectedA', 'aeRoleMemberA', 'noCollectivity', 'aeOwner', 'aeOther']) {
    test(`refusé pour ${who}, rien n'est supprimé`, async () => {
      const res = await call('DELETE', `/action/${ACTION_COL}`, who);
      assert.equal(res.status, 403);
      assert.deepEqual(res.body, { ok: false, code: 'Accès refusé' });
      assertNothingDeleted();
    });
  }

  test('refusé sans authentification', async () => {
    assert.equal((await call('DELETE', `/action/${ACTION_COL}`, null)).status, 401);
    assertNothingDeleted();
  });
});

describe("DELETE /action/:id — action d'un acteur économique", () => {
  for (const who of ['admin', 'aeOwner', 'memberA']) {
    test(`autorisé pour ${who}`, async () => {
      const res = await call('DELETE', `/action/${ACTION_AE}`, who);
      assert.equal(res.status, 200);
      assertDeleted(ACTION_AE, 'file-2');
    });
  }

  for (const who of ['aeOther', 'memberB', 'noCollectivity']) {
    test(`refusé pour ${who}, rien n'est supprimé`, async () => {
      const res = await call('DELETE', `/action/${ACTION_AE}`, who);
      assert.equal(res.status, 403);
      assert.deepEqual(res.body, { ok: false, code: 'Accès refusé' });
      assertNothingDeleted();
    });
  }
});

describe('DELETE /action/:id — fiche sans collectivité', () => {
  test('autorisé pour un admin', async () => {
    assert.equal((await call('DELETE', `/action/${ACTION_GLOBAL}`, 'admin')).status, 200);
    assert.equal(store.actions.some((a) => a._id === ACTION_GLOBAL), false);
  });

  for (const who of ['memberA', 'adminA', 'aeOwner', 'noCollectivity']) {
    test(`refusé pour ${who}, rien n'est supprimé`, async () => {
      const res = await call('DELETE', `/action/${ACTION_GLOBAL}`, who);
      assert.equal(res.status, 403);
      assertNothingDeleted();
    });
  }
});

describe('DELETE /action/:id — action introuvable', () => {
  for (const who of ['admin', 'memberA']) {
    test(`404 pour une action inexistante (${who})`, async () => {
      const res = await call('DELETE', `/action/${ACTION_UNKNOWN}`, who);
      assert.equal(res.status, 404);
      assert.deepEqual(res.body, { ok: false, code: 'Ressource non trouvée' });
      assertNothingDeleted();
    });
  }

  test('404 pour un identifiant mal formé', async () => {
    const res = await call('DELETE', '/action/pas-un-id', 'admin');
    assert.equal(res.status, 404);
    assert.deepEqual(res.body, { ok: false, code: 'Ressource non trouvée' });
    assertNothingDeleted();
  });
});

// La modification partage la même règle : elle ne doit pas avoir changé
describe('PUT /action/:id — droits inchangés', () => {
  for (const who of ['admin', 'memberA', 'adminA']) {
    test(`autorisé pour ${who}`, async () => {
      const res = await call('PUT', `/action/${ACTION_COL}`, who, { name: 'Renommée' });
      assert.equal(res.status, 200);
      assert.equal(store.actions.find((a) => a._id === ACTION_COL).name, 'Renommée');
    });
  }

  for (const who of ['memberB', 'pendingA', 'rejectedA', 'aeRoleMemberA', 'noCollectivity', 'aeOwner', 'aeOther']) {
    test(`refusé pour ${who}`, async () => {
      const res = await call('PUT', `/action/${ACTION_COL}`, who, { name: 'Intruse' });
      assert.equal(res.status, 403);
      assert.equal(store.actions.find((a) => a._id === ACTION_COL).name, 'Action collectivité A');
    });
  }

  test("l'acteur économique propriétaire modifie son action, pas un autre acteur", async () => {
    assert.equal((await call('PUT', `/action/${ACTION_AE}`, 'aeOwner', { name: 'Renommée' })).status, 200);
    assert.equal((await call('PUT', `/action/${ACTION_AE}`, 'aeOther', { name: 'Intruse' })).status, 403);
    assert.equal(store.actions.find((a) => a._id === ACTION_AE).name, 'Renommée');
  });
});
