/* eslint-env node */
// Le rattachement d'une organisation à une collectivité et la suppression d'une organisation sont réservés à l'administrateur.
// Lancer : npm test (aucune connexion MongoDB ni Microsoft Graph nécessaire, les modèles sont simulés en mémoire).
process.env.SECRET = 'test-secret';

const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

const User = require('../src/models/user');
const Collectivity = require('../src/models/collectivity');
const EconomicActor = require('../src/models/economic_actor');
const Action = require('../src/models/action');
const IndicatorValue = require('../src/models/indicator_value');
const microsoftGraph = require('../src/services/microsoftGraph');

const COL_A = '64b000000000000000000001';
const UNKNOWN_COL = '64b0000000000000000000ff';
const EA_1 = '64e000000000000000000001';
const EA_2 = '64e000000000000000000002';
const UNKNOWN_EA = '64e0000000000000000000ff';

// ---------- Utilisateurs simulés ----------
const users = {
  admin: { _id: 'u-admin', name: 'Admin', role: 'admin', collectivities: [] },
  member: { _id: 'u-member', name: 'Membre A', role: 'user', collectivities: [{ id: COL_A, role: 'user', status: 'approved' }] },
  adminA: { _id: 'u-admin-a', name: 'Admin A', role: 'user', collectivities: [{ id: COL_A, role: 'admin', status: 'approved' }] },
  ae: { _id: 'u-ae', name: 'AE', role: 'economic_actor', economic_actor_id: EA_1, collectivities: [{ id: COL_A, role: 'economic_actor', status: 'approved' }] },
};

// ---------- Modèles simulés ----------
let actors;
let actions;
let values;
let duplicateCalls;

const collectivities = [{ _id: COL_A, name: 'Territoire A', sharepoint_folder_id: 'folder-a' }];

// Comme Mongoose : un identifiant mal formé lève une CastError
const castId = (id) => {
  if (!mongoose.isValidObjectId(id)) throw new Error(`CastError: ${id}`);
  return id;
};

User.findOne = async (query) => Object.values(users).find((u) => u._id === query._id) || null;
Collectivity.findById = async (id) => collectivities.find((c) => c._id === castId(id)) || null;
EconomicActor.findById = async (id) => actors.find((a) => a._id === castId(id)) || null;
EconomicActor.findByIdAndDelete = async (id) => {
  const actor = actors.find((a) => a._id === castId(id)) || null;
  actors = actors.filter((a) => a._id !== id);
  return actor;
};
Action.deleteMany = async (query) => {
  actions = actions.filter((a) => a.economic_actor_id !== query.economic_actor_id);
};
IndicatorValue.deleteMany = async (query) => {
  values = values.filter((v) => v.economic_actor_id !== query.economic_actor_id);
};
// À définir avant le chargement du contrôleur, qui importe la fonction à son chargement
microsoftGraph.duplicateExcelFile = async (name, folderId, templateId) => {
  duplicateCalls.push({ name, folderId, templateId });
  return 'fichier-agregation';
};

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
  app.use('/economic_actor', require('../src/controllers/economic_actor'));
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => server.close());

beforeEach(() => {
  const makeActor = (data) => {
    const doc = { collectivities: [], ...data };
    doc.save = async () => doc;
    return doc;
  };
  actors = [makeActor({ _id: EA_1, name: 'Transporteur' }), makeActor({ _id: EA_2, name: 'Autre' })];
  actions = [
    { _id: 'act-1', economic_actor_id: EA_1 },
    { _id: 'act-2', economic_actor_id: EA_2 },
  ];
  values = [
    { _id: 'val-1', economic_actor_id: EA_1 },
    { _id: 'val-2', economic_actor_id: EA_2 },
  ];
  duplicateCalls = [];
});

const attach = (who, actorId = EA_1, collectivityId = COL_A) => call('PUT', `/economic_actor/${actorId}/add_collectivity`, who, { collectivity_id: collectivityId, collectivity_name: 'Territoire A' });

// ---------- Rattachement à une collectivité ----------
test('rattachement : un admin rattache une organisation à une collectivité', async () => {
  const res = await attach('admin');
  assert.equal(res.status, 200);
  assert.equal(duplicateCalls.length, 1);
  assert.equal(duplicateCalls[0].folderId, 'folder-a');
  assert.equal(actors[0].collectivities.length, 1);
  assert.equal(actors[0].collectivities[0].id, COL_A);
  assert.equal(actors[0].collectivities[0].aggregation_excel_file_id, 'fichier-agregation');
});

test("rattachement : un utilisateur de collectivité ou un acteur économique est refusé, rien n'est modifié", async () => {
  for (const who of ['member', 'adminA', 'ae']) {
    for (const actorId of [EA_1, EA_2]) assert.equal((await attach(who, actorId)).status, 401);
  }
  assert.equal(duplicateCalls.length, 0);
  assert.deepEqual(actors.map((a) => a.collectivities), [[], []]);
});

test('rattachement : sans token, refusé', async () => {
  assert.equal((await attach(null)).status, 401);
  assert.equal(duplicateCalls.length, 0);
  assert.deepEqual(actors[0].collectivities, []);
});

test('rattachement : organisation ou collectivité inconnue ou mal formée, 404 sans fichier créé', async () => {
  assert.equal((await attach('admin', UNKNOWN_EA)).status, 404);
  assert.equal((await attach('admin', 'pas-un-id')).status, 404);
  assert.equal((await attach('admin', EA_1, UNKNOWN_COL)).status, 404);
  assert.equal((await attach('admin', EA_1, 'pas-un-id')).status, 404);
  assert.equal((await attach('admin', EA_1, { $ne: null })).status, 404);
  assert.equal(duplicateCalls.length, 0);
  assert.deepEqual(actors[0].collectivities, []);
});

// ---------- Suppression ----------
test('suppression : un admin supprime une organisation, ses actions et ses valeurs', async () => {
  const res = await call('DELETE', `/economic_actor/${EA_1}`, 'admin');
  assert.equal(res.status, 200);
  assert.deepEqual(actors.map((a) => a._id), [EA_2]);
  assert.deepEqual(actions.map((a) => a._id), ['act-2']);
  assert.deepEqual(values.map((v) => v._id), ['val-2']);
});

test("suppression : un utilisateur de collectivité ou un acteur économique est refusé, rien n'est supprimé", async () => {
  for (const who of ['member', 'adminA', 'ae']) {
    for (const actorId of [EA_1, EA_2]) assert.equal((await call('DELETE', `/economic_actor/${actorId}`, who)).status, 401);
  }
  assert.equal(actors.length, 2);
  assert.equal(actions.length, 2);
  assert.equal(values.length, 2);
});

test('suppression : sans token, refusé', async () => {
  assert.equal((await call('DELETE', `/economic_actor/${EA_1}`, null)).status, 401);
  assert.equal(actors.length, 2);
});

test('suppression : organisation inconnue ou mal formée, 404 sans rien supprimer', async () => {
  assert.equal((await call('DELETE', `/economic_actor/${UNKNOWN_EA}`, 'admin')).status, 404);
  assert.equal((await call('DELETE', '/economic_actor/pas-un-id', 'admin')).status, 404);
  assert.equal(actors.length, 2);
  assert.equal(actions.length, 2);
  assert.equal(values.length, 2);
});

// ---------- Routes voisines inchangées ----------
test('la lecture reste ouverte aux utilisateurs connectés', async () => {
  for (const who of ['member', 'ae', 'admin']) {
    const res = await call('GET', `/economic_actor/${EA_1}`, who);
    assert.equal(res.status, 200);
    assert.equal(res.body.data._id, EA_1);
  }
});
