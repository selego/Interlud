/* eslint-env node */
// Un acteur économique rejoint une collectivité sans validation : son organisation y est rattachée
// immédiatement (fichier d'agrégation + tous ses membres). Un acteur public reste en attente d'approbation.
// Lancer : npm test (aucune connexion MongoDB ni Microsoft Graph nécessaire, les modèles sont simulés en mémoire).
process.env.SECRET = 'test-secret';

const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');

const User = require('../src/models/user');
const Collectivity = require('../src/models/collectivity');
const EconomicActor = require('../src/models/economic_actor');
const Notification = require('../src/models/notification');
const brevo = require('../src/services/brevo');
const microsoftGraph = require('../src/services/microsoftGraph');

const COL_A = '64b000000000000000000001';
const COL_B = '64b000000000000000000002';
const UNKNOWN_COL = '64b0000000000000000000ff';

// ---------- Modèles simulés ----------
let users;
let actors;
let duplicateCalls;
let notifications;
let emails;

const makeUser = (data) => {
  const doc = { collectivities: [], ...data };
  doc.save = async () => doc;
  return doc;
};

beforeEach(() => {
  users = [
    makeUser({ _id: 'u-ae', name: 'AE', role: 'economic_actor', economic_actor_id: 'ea-1' }),
    makeUser({ _id: 'u-ae-collegue', name: 'Collègue', role: 'economic_actor', economic_actor_id: 'ea-1' }),
    makeUser({ _id: 'u-ae-autre', name: 'Autre AE', role: 'economic_actor', economic_actor_id: 'ea-2' }),
    makeUser({ _id: 'u-ae-sans-org', name: 'AE sans organisation', role: 'economic_actor', economic_actor_id: '' }),
    makeUser({ _id: 'u-public', name: 'Acteur public', role: 'user' }),
    makeUser({ _id: 'u-admin-col', name: 'Admin collectivité', role: 'user', email: 'admin@exemple.fr', collectivities: [{ id: COL_A, role: 'admin', status: 'approved' }] }),
  ];
  actors = [
    { _id: 'ea-1', name: 'Transporteur', collectivities: [] },
    { _id: 'ea-2', name: 'Autre', collectivities: [] },
  ];
  duplicateCalls = [];
  notifications = [];
  emails = [];
});

const collectivities = [
  { _id: COL_A, name: 'Territoire A', sharepoint_folder_id: 'folder-a' },
  { _id: COL_B, name: 'Territoire B', sharepoint_folder_id: 'folder-b' },
];

User.findOne = async (query) => users.find((u) => u._id === query._id) || null;
User.findById = async (id) => users.find((u) => u._id === id) || null;
User.find = async (query) => {
  if (query.collectivities) return users.filter((u) => u.collectivities.some((c) => c.id === query.collectivities.$elemMatch.id && c.role === query.collectivities.$elemMatch.role));
  return users.filter((u) => u.economic_actor_id === query.economic_actor_id && (!query.role || u.role === query.role));
};
Collectivity.findById = async (id) => collectivities.find((c) => c._id === id) || null;
EconomicActor.findById = async (id) => actors.find((a) => a._id === id) || null;
EconomicActor.updateOne = async (filter, update) => {
  const actor = actors.find((a) => a._id === filter._id);
  if (!actor || actor.collectivities.some((c) => c.id === filter['collectivities.id'].$ne)) return { modifiedCount: 0 };
  actor.collectivities.push(update.$push.collectivities);
  return { modifiedCount: 1 };
};
Notification.create = async (payload) => notifications.push(payload);
brevo.sendEmail = async (html, options) => emails.push(options);
microsoftGraph.duplicateExcelFile = async (name, folderId, templateId) => {
  duplicateCalls.push({ name, folderId, templateId });
  return `agg-${duplicateCalls.length}`;
};

// ---------- Serveur de test ----------
let server;
let baseUrl;

const requestAccess = async (who, collectivityId) => {
  const response = await fetch(`${baseUrl}/user/request-collectivity-access`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `JWT ${jwt.sign({ _id: who }, process.env.SECRET)}` },
    body: JSON.stringify({ collectivityId }),
  });
  return { status: response.status, body: await response.json() };
};

const entryOf = (userId, collectivityId) => users.find((u) => u._id === userId).collectivities.find((c) => c.id === collectivityId);

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

// ---------- Acteur économique ----------
test("un acteur économique sans territoire rejoint immédiatement la collectivité, avec son organisation", async () => {
  const res = await requestAccess('u-ae', COL_A);

  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
  assert.deepEqual(
    res.body.data.collectivities.map((c) => ({ id: c.id, role: c.role, status: c.status })),
    [{ id: COL_A, role: 'economic_actor', status: 'approved' }]
  );

  // Fichier d'agrégation créé une fois, dans le dossier de la collectivité, comme depuis l'admin
  assert.equal(duplicateCalls.length, 1);
  assert.equal(duplicateCalls[0].name, 'Transporteur - Territoire A - Aggregation_V5.xlsx');
  assert.equal(duplicateCalls[0].folderId, 'folder-a');
  assert.equal(duplicateCalls[0].templateId, microsoftGraph.aggregationTemplateFileId);
  assert.equal(actors[0].collectivities.length, 1);
  assert.equal(actors[0].collectivities[0].id, COL_A);
  assert.equal(actors[0].collectivities[0].aggregation_excel_file_id, 'agg-1');

  // Tous les membres de l'organisation, et seulement eux
  assert.equal(entryOf('u-ae-collegue', COL_A)?.status, 'approved');
  assert.equal(entryOf('u-ae-autre', COL_A), undefined);
  assert.equal(actors[1].collectivities.length, 0);

  // Aucune action requise : pas de demande envoyée aux administrateurs
  assert.equal(notifications.length, 0);
  assert.equal(emails.length, 0);
});

test('un acteur économique refusé auparavant peut redemander et est rattaché', async () => {
  users[0].collectivities = [{ id: COL_A, name: 'Territoire A', role: 'economic_actor', status: 'rejected' }];

  const res = await requestAccess('u-ae', COL_A);

  assert.equal(res.status, 200);
  assert.equal(res.body.data.collectivities.length, 1);
  assert.equal(entryOf('u-ae', COL_A).status, 'approved');
  assert.equal(actors[0].collectivities.length, 1);
  assert.equal(duplicateCalls.length, 1);
});

test("une demande d'acteur économique restée en attente devient effective", async () => {
  users[0].collectivities = [{ id: COL_A, name: 'Territoire A', role: 'economic_actor', status: 'pending' }];

  const res = await requestAccess('u-ae', COL_A);

  assert.equal(res.status, 200);
  assert.equal(entryOf('u-ae', COL_A).status, 'approved');
});

test("organisation déjà rattachée : aucun nouveau fichier d'agrégation, le membre est approuvé", async () => {
  actors[0].collectivities = [{ id: COL_A, name: 'Territoire A', aggregation_excel_file_id: 'agg-existant' }];

  const first = await requestAccess('u-ae', COL_A);
  const second = await requestAccess('u-ae', COL_A);

  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal(duplicateCalls.length, 0);
  assert.equal(actors[0].collectivities.length, 1);
  assert.equal(actors[0].collectivities[0].aggregation_excel_file_id, 'agg-existant');
  assert.equal(users[0].collectivities.filter((c) => c.id === COL_A).length, 1);
});

test('un acteur économique sans organisation est refusé (404)', async () => {
  const res = await requestAccess('u-ae-sans-org', COL_A);
  assert.equal(res.status, 404);
  assert.equal(duplicateCalls.length, 0);
});

// ---------- Validation ----------
test('une collectivité inconnue est refusée (404), sans création de fichier', async () => {
  const res = await requestAccess('u-ae', UNKNOWN_COL);
  assert.equal(res.status, 404);
  assert.equal(duplicateCalls.length, 0);
  assert.equal(actors[0].collectivities.length, 0);
});

test('un identifiant de collectivité invalide est refusé (400)', async () => {
  for (const collectivityId of [undefined, 'pas-un-id', { $ne: null }]) {
    const res = await requestAccess('u-ae', collectivityId);
    assert.equal(res.status, 400);
  }
  assert.equal(duplicateCalls.length, 0);
});

test('sans jeton, la demande est refusée (401)', async () => {
  const response = await fetch(`${baseUrl}/user/request-collectivity-access`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ collectivityId: COL_A }),
  });
  assert.equal(response.status, 401);
});

// ---------- Acteur public : inchangé ----------
test('un acteur public reste en attente de validation et les administrateurs sont prévenus', async () => {
  const res = await requestAccess('u-public', COL_A);

  assert.equal(res.status, 200);
  assert.equal(entryOf('u-public', COL_A).status, 'pending');
  assert.equal(entryOf('u-public', COL_A).role, 'user');
  assert.equal(duplicateCalls.length, 0);
  assert.equal(notifications.length, 1);
  assert.equal(emails.length, 1);

  const again = await requestAccess('u-public', COL_A);
  assert.equal(again.status, 409);
});
