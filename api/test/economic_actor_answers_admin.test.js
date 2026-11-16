/* eslint-env node */
// Tests de la lecture des réponses au questionnaire AE par l'admin plateforme (POST /economic_actor_answer/admin/search).
// Lancer : npm test (aucune connexion MongoDB nécessaire, les modèles sont simulés en mémoire).
process.env.SECRET = 'test-secret';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');

const User = require('../src/models/user');
const EconomicActor = require('../src/models/economic_actor');
const EconomicActorQuestion = require('../src/models/economic_actor_question');
const EconomicActorAnswer = require('../src/models/economic_actor_answer');

// ---------- Modèles simulés ----------
const users = {
  admin: { _id: 'u-admin', name: 'Admin', role: 'admin', password: 'hash-secret' },
  collectivity: { _id: 'u-col', name: 'Agent EPCI', role: 'user' },
  ae1: { _id: 'u-ae1', name: 'AE 1', role: 'economic_actor', economic_actor_id: 'ea-1', economic_actor_name: 'Transports Un' },
};

const questions = [
  { _id: 'q-num', label: 'Nombre de véhicules', type: 'number', value_unit: 'véhicules', active: true, order: 1 },
  { _id: 'q-text', label: 'Commentaire', type: 'text', active: true, order: 2 },
  { _id: 'q-radio', label: 'Type de flotte', type: 'radio', active: true, order: 3 },
  { _id: 'q-check', label: 'Énergies utilisées', type: 'checkbox', active: false, order: 4 },
];

const updatedAt = new Date('2026-11-10T10:00:00Z');
const answers = [
  { _id: 'a-1', economic_actor_id: 'ea-2', economic_actor_name: 'Ancien nom', question_id: 'q-num', value: { number: 0 }, updatedAt, last_modif_by_id: 'u-ae2', last_modif_by_name: 'AE 2' },
  { _id: 'a-2', economic_actor_id: 'ea-1', question_id: 'q-check', value: { checkbox: ['Diesel', 'Électrique'] }, updatedAt },
  { _id: 'a-3', economic_actor_id: 'ea-1', question_id: 'q-num', value: { number: 12 }, updatedAt },
  { _id: 'a-4', economic_actor_id: 'ea-1', question_id: 'q-text', value: { text: 'Livraisons de nuit' }, updatedAt },
  { _id: 'a-5', economic_actor_id: 'ea-1', question_id: 'q-radio', value: { radio: 'Louée' }, updatedAt },
];

const actors = [
  { _id: 'ea-1', name: 'Transports Un' },
  { _id: 'ea-2', name: 'Livraisons Deux' },
];

User.findOne = async (query) => Object.values(users).find((u) => u._id === query._id) || null;
EconomicActorAnswer.find = async (query) => answers.filter((a) => !query.question_id || a.question_id === query.question_id);
EconomicActorQuestion.find = async () => questions;
EconomicActor.find = async (query) => actors.filter((a) => query._id.$in.includes(a._id));

// ---------- Serveur de test ----------
let server;
let baseUrl;

const call = async (path, who, body = {}) => {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(who ? { Authorization: `JWT ${jwt.sign({ _id: users[who]._id }, process.env.SECRET)}` } : {}) },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch (e) {
    json = null;
  }
  return { status: response.status, body: json, text };
};

before(async () => {
  const app = express();
  app.set('env', 'test');
  app.use(cookieParser());
  app.use(express.json());
  require('../src/services/passport')(app);
  app.use('/economic_actor_answer', require('../src/controllers/economic_actor_answer'));
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => server.close());

test("l'admin lit toutes les réponses, formatées et triées par acteur puis par question", async () => {
  const res = await call('/economic_actor_answer/admin/search', 'admin');
  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
  assert.deepEqual(
    res.body.data.map((row) => [row.economic_actor_name, row.question_label, row.value, row.value_unit]),
    [
      ['Livraisons Deux', 'Nombre de véhicules', '0', 'véhicules'],
      ['Transports Un', 'Nombre de véhicules', '12', 'véhicules'],
      ['Transports Un', 'Commentaire', 'Livraisons de nuit', ''],
      ['Transports Un', 'Type de flotte', 'Louée', ''],
      ['Transports Un', 'Énergies utilisées', 'Diesel, Électrique', ''],
    ],
  );
  const inactive = res.body.data.find((row) => row.question_id === 'q-check');
  assert.equal(inactive.question_active, false);
  assert.equal(inactive.question_type, 'checkbox');
  assert.equal(inactive.updatedAt, updatedAt.toISOString());
});

test('filtre par question', async () => {
  const res = await call('/economic_actor_answer/admin/search', 'admin', { question_id: 'q-num' });
  assert.deepEqual(
    res.body.data.map((row) => [row.economic_actor_name, row.value]),
    [
      ['Livraisons Deux', '0'],
      ['Transports Un', '12'],
    ],
  );
});

test("aucune donnée de compte utilisateur n'est renvoyée", async () => {
  const res = await call('/economic_actor_answer/admin/search', 'admin');
  assert.doesNotMatch(res.text, /hash-secret|password|last_modif_by|u-ae2/);
});

test("un AE, un utilisateur de collectivité ou un visiteur sans token n'y a pas accès", async () => {
  for (const who of ['ae1', 'collectivity', null]) {
    const res = await call('/economic_actor_answer/admin/search', who);
    assert.ok([401, 403].includes(res.status), `${who} : ${res.status}`);
    assert.ok(!res.body?.data);
  }
});
