/* eslint-env node */
// Tests du champ « required » (question obligatoire) du questionnaire acteurs économiques.
// Lancer : npm test (aucune connexion MongoDB : les documents sont de vrais documents Mongoose dont save() est simulé).
process.env.SECRET = 'test-secret';

const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');

const User = require('../src/models/user');
const EconomicActorQuestion = require('../src/models/economic_actor_question');
const EconomicActorAnswer = require('../src/models/economic_actor_answer');

const users = {
  admin: { _id: 'u-admin', name: 'Admin', role: 'admin' },
  collectivity: { _id: 'u-col', name: 'Agent EPCI', role: 'user' },
  ae1: { _id: 'u-ae1', name: 'AE 1', role: 'economic_actor', economic_actor_id: 'ea-1', economic_actor_name: 'Transports Un' },
};

let store;

// Vrai document Mongoose (schéma, valeurs par défaut et conversions appliqués), sans écriture en base.
const makeQuestion = (data) => {
  const doc = new EconomicActorQuestion(data);
  doc.save = async () => doc;
  return doc;
};

User.findOne = async (query) => Object.values(users).find((u) => u._id === query._id) || null;
EconomicActorQuestion.findById = async (id) => store.questions.find((q) => String(q._id) === id) || null;
EconomicActorQuestion.create = async (body) => {
  const doc = makeQuestion(body);
  store.questions.push(doc);
  return doc;
};
EconomicActorAnswer.findOneAndUpdate = async (filter, update) => {
  const answer = { ...filter, ...update };
  store.answers.push(answer);
  return answer;
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
  try {
    return { status: response.status, body: JSON.parse(text) };
  } catch (e) {
    return { status: response.status, body: null };
  }
};

before(async () => {
  const app = express();
  app.set('env', 'test');
  app.use(cookieParser());
  app.use(express.json());
  require('../src/services/passport')(app);
  app.use('/economic_actor_question', require('../src/controllers/economic_actor_question'));
  app.use('/economic_actor_answer', require('../src/controllers/economic_actor_answer'));
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => server.close());

beforeEach(() => {
  store = {
    questions: [makeQuestion({ label: 'Nombre de véhicules', type: 'number' })],
    answers: [],
  };
});

describe('Question obligatoire (required)', () => {
  test('par défaut, une question est facultative', () => {
    assert.equal(store.questions[0].required, false);
  });

  test("l'admin crée une question obligatoire puis la rend facultative", async () => {
    const created = await call('POST', '/economic_actor_question', 'admin', { label: 'Tonnage annuel', required: true });
    assert.equal(created.status, 200);
    assert.equal(created.body.data.required, true);

    const id = created.body.data._id;
    const updated = await call('PUT', `/economic_actor_question/${id}`, 'admin', { required: false });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.data.required, false);

    // Sans le champ dans le corps, la valeur existante est conservée
    await call('PUT', `/economic_actor_question/${id}`, 'admin', { required: true });
    const relabeled = await call('PUT', `/economic_actor_question/${id}`, 'admin', { label: 'Tonnage annuel livré' });
    assert.equal(relabeled.body.data.required, true);
  });

  test('un AE ou un utilisateur de collectivité ne peut ni créer ni modifier required', async () => {
    const id = String(store.questions[0]._id);
    for (const who of ['ae1', 'collectivity']) {
      assert.equal((await call('POST', '/economic_actor_question', who, { label: 'X', required: true })).status, 401);
      assert.equal((await call('PUT', `/economic_actor_question/${id}`, who, { required: true })).status, 401);
    }
    // La route de réponse de l'AE ne touche pas à la question, même si le corps contient required
    assert.equal((await call('PUT', `/economic_actor_answer/mine/${id}`, 'ae1', { value: { number: 3 }, required: true })).status, 200);
    assert.equal(store.questions.length, 1);
    assert.equal(store.questions[0].required, false);
  });

  test("une réponse vide à une question obligatoire reste acceptée (l'AE peut effacer sa saisie)", async () => {
    store.questions[0].required = true;
    const id = String(store.questions[0]._id);
    assert.equal((await call('PUT', `/economic_actor_answer/mine/${id}`, 'ae1', { value: { number: 3 } })).status, 200);
    assert.equal((await call('PUT', `/economic_actor_answer/mine/${id}`, 'ae1', { value: { number: null } })).status, 200);
  });
});
