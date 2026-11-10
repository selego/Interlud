/* eslint-env node */
// Tests du questionnaire acteurs économiques : droits, isolation entre acteurs, validation, absence d'appel Graph/Excel.
// Lancer : npm test (aucune connexion MongoDB nécessaire, les modèles sont simulés en mémoire).
process.env.SECRET = 'test-secret';

const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');

const User = require('../src/models/user');
const EconomicActorQuestion = require('../src/models/economic_actor_question');
const EconomicActorAnswer = require('../src/models/economic_actor_answer');
const EconomicActorForm = require('../src/models/economic_actor_form');

const CONTROLLERS = ['../src/controllers/economic_actor_question', '../src/controllers/economic_actor_answer', '../src/controllers/economic_actor_form'];

// ---------- Modèles simulés ----------
const users = {
  admin: { _id: 'u-admin', name: 'Admin', role: 'admin' },
  collectivity: { _id: 'u-col', name: 'Agent EPCI', role: 'user' },
  ae1: { _id: 'u-ae1', name: 'AE 1', role: 'economic_actor', economic_actor_id: 'ea-1', economic_actor_name: 'Transports Un' },
  ae2: { _id: 'u-ae2', name: 'AE 2', role: 'economic_actor', economic_actor_id: 'ea-2', economic_actor_name: 'Livraisons Deux' },
};

let store;
let nextId;

const makeDoc = (data) => ({
  ...data,
  set(values) {
    Object.assign(this, values);
  },
  async save() {},
});

const matches = (doc, query) => Object.entries(query).every(([key, value]) => (value && typeof value === 'object' ? true : doc[key] === value));

const chain = (rows) => {
  const query = {
    sort: () => query,
    skip: () => query,
    limit: () => query,
    then: (resolve, reject) => Promise.resolve(rows).then(resolve, reject),
  };
  return query;
};

User.findOne = async (query) => Object.values(users).find((u) => u._id === query._id) || null;

EconomicActorQuestion.countDocuments = async (query) => store.questions.filter((q) => matches(q, query)).length;
EconomicActorQuestion.find = (query) => chain(store.questions.filter((q) => matches(q, query)));
EconomicActorQuestion.findById = async (id) => store.questions.find((q) => q._id === id) || null;
EconomicActorQuestion.create = async (body) => {
  const doc = makeDoc({ type: 'text', value_possibilities: [], active: true, ...body, _id: `q-${nextId++}` });
  store.questions.push(doc);
  return doc;
};

EconomicActorAnswer.find = async (query) => store.answers.filter((a) => matches(a, query));
EconomicActorAnswer.findOneAndUpdate = async (filter, update) => {
  let answer = store.answers.find((a) => matches(a, filter));
  if (!answer) {
    answer = makeDoc({ ...filter, _id: `a-${nextId++}` });
    store.answers.push(answer);
  }
  Object.assign(answer, update);
  return answer;
};

EconomicActorForm.findOne = async () => store.form;
EconomicActorForm.findOneAndUpdate = async (filter, update) => {
  store.form = makeDoc({ ...(store.form || {}), ...update });
  return store.form;
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
  app.use('/economic_actor_question', require(CONTROLLERS[0]));
  app.use('/economic_actor_answer', require(CONTROLLERS[1]));
  app.use('/economic_actor_form', require(CONTROLLERS[2]));
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => server.close());

beforeEach(() => {
  nextId = 1;
  store = {
    form: null,
    questions: [
      makeDoc({ _id: 'q-text', label: 'Nombre de véhicules', type: 'number', value_possibilities: [], active: true, order: 1 }),
      makeDoc({ _id: 'q-radio', label: 'Type de flotte', type: 'radio', value_possibilities: ['Propre', 'Louée'], active: true, order: 2 }),
      makeDoc({ _id: 'q-off', label: 'Ancienne question', type: 'text', value_possibilities: [], active: false, order: 3 }),
    ],
    answers: [],
  };
});

// ---------- Administration des questions ----------
describe('Administration des questions', () => {
  test('un admin crée puis modifie une question', async () => {
    const created = await call('POST', '/economic_actor_question', 'admin', { label: 'Tonnage annuel', type: 'number', value_unit: 't' });
    assert.equal(created.status, 200);
    assert.equal(created.body.data.label, 'Tonnage annuel');

    const updated = await call('PUT', `/economic_actor_question/${created.body.data._id}`, 'admin', { label: 'Tonnage annuel livré', actions: [{ id: 'g-c1', name: 'C1' }] });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.data.label, 'Tonnage annuel livré');
    assert.deepEqual(updated.body.data.actions, [{ id: 'g-c1', name: 'C1' }]);
  });

  test('libellé obligatoire', async () => {
    assert.equal((await call('POST', '/economic_actor_question', 'admin', { type: 'text' })).status, 400);
    assert.equal((await call('PUT', '/economic_actor_question/q-text', 'admin', { label: '' })).status, 400);
  });

  test('un AE ou un utilisateur de collectivité ne peut ni créer ni modifier', async () => {
    for (const who of ['ae1', 'collectivity']) {
      assert.equal((await call('POST', '/economic_actor_question', who, { label: 'X' })).status, 401);
      assert.equal((await call('PUT', '/economic_actor_question/q-text', who, { label: 'X' })).status, 401);
      assert.equal((await call('GET', '/economic_actor_question/q-text', who)).status, 401);
    }
    assert.equal(store.questions.length, 3);
    assert.equal(store.questions[0].label, 'Nombre de véhicules');
  });

  test('sans token : refusé', async () => {
    assert.equal((await call('POST', '/economic_actor_question/search', null, {})).status, 401);
  });

  test("l'admin voit les questions inactives, l'AE seulement les actives", async () => {
    const asAdmin = await call('POST', '/economic_actor_question/search', 'admin', {});
    assert.equal(asAdmin.body.data.length, 3);
    const asAe = await call('POST', '/economic_actor_question/search', 'ae1', { active: false });
    assert.deepEqual(
      asAe.body.data.map((q) => q._id),
      ['q-text', 'q-radio'],
    );
  });
});

// ---------- Texte explicatif ----------
describe('Texte explicatif', () => {
  test("l'admin le modifie, l'AE le lit mais ne peut pas le modifier", async () => {
    assert.equal((await call('GET', '/economic_actor_form', 'ae1')).body.data.intro_text, '');
    assert.equal((await call('PUT', '/economic_actor_form', 'admin', { intro_text: 'Bienvenue' })).status, 200);
    assert.equal((await call('PUT', '/economic_actor_form', 'ae1', { intro_text: 'Piraté' })).status, 401);
    assert.equal((await call('GET', '/economic_actor_form', 'ae1')).body.data.intro_text, 'Bienvenue');
  });
});

// ---------- Réponses ----------
describe('Réponses des acteurs économiques', () => {
  test('un AE enregistre puis retrouve ses réponses', async () => {
    assert.equal((await call('PUT', '/economic_actor_answer/mine/q-text', 'ae1', { value: { number: 12 } })).status, 200);
    assert.equal((await call('PUT', '/economic_actor_answer/mine/q-radio', 'ae1', { value: { radio: 'Louée' } })).status, 200);
    // Une seconde saisie met à jour la même réponse
    assert.equal((await call('PUT', '/economic_actor_answer/mine/q-text', 'ae1', { value: { number: 15 } })).status, 200);

    const mine = await call('GET', '/economic_actor_answer/mine', 'ae1');
    assert.equal(mine.status, 200);
    assert.equal(mine.body.data.length, 2);
    assert.equal(mine.body.data.find((a) => a.question_id === 'q-text').value.number, 15);
    assert.equal(mine.body.data.find((a) => a.question_id === 'q-radio').value.radio, 'Louée');
  });

  test("isolation : un AE ne voit ni ne modifie les réponses d'un autre, même en forçant economic_actor_id", async () => {
    await call('PUT', '/economic_actor_answer/mine/q-text', 'ae1', { value: { number: 12 } });
    await call('PUT', '/economic_actor_answer/mine/q-text', 'ae2', { value: { number: 99 }, economic_actor_id: 'ea-1' });

    const ae1 = await call('GET', '/economic_actor_answer/mine', 'ae1');
    assert.deepEqual(
      ae1.body.data.map((a) => [a.economic_actor_id, a.value.number]),
      [['ea-1', 12]],
    );
    const ae2 = await call('GET', '/economic_actor_answer/mine', 'ae2');
    assert.deepEqual(
      ae2.body.data.map((a) => [a.economic_actor_id, a.value.number]),
      [['ea-2', 99]],
    );
  });

  test("un utilisateur de collectivité ou un admin n'a pas accès aux routes AE", async () => {
    assert.equal((await call('GET', '/economic_actor_answer/mine', 'collectivity')).status, 403);
    assert.equal((await call('PUT', '/economic_actor_answer/mine/q-text', 'collectivity', { value: { number: 1 } })).status, 403);
    assert.equal((await call('GET', '/economic_actor_answer/mine', 'admin')).status, 401);
    assert.equal(store.answers.length, 0);
  });

  test('question inactive ou inconnue : refusée', async () => {
    assert.equal((await call('PUT', '/economic_actor_answer/mine/q-off', 'ae1', { value: { text: 'x' } })).status, 404);
    assert.equal((await call('PUT', '/economic_actor_answer/mine/q-absente', 'ae1', { value: { text: 'x' } })).status, 404);
    assert.equal(store.answers.length, 0);
  });

  test('valeur du mauvais type ou hors des options : refusée', async () => {
    assert.equal((await call('PUT', '/economic_actor_answer/mine/q-text', 'ae1', { value: { number: 'douze' } })).status, 400);
    assert.equal((await call('PUT', '/economic_actor_answer/mine/q-text', 'ae1', {})).status, 400);
    assert.equal((await call('PUT', '/economic_actor_answer/mine/q-radio', 'ae1', { value: { radio: 'Inventée' } })).status, 400);
    assert.equal(store.answers.length, 0);
  });

  test('une valeur vide efface la réponse sans erreur', async () => {
    assert.equal((await call('PUT', '/economic_actor_answer/mine/q-text', 'ae1', { value: { number: null } })).status, 200);
    assert.equal((await call('PUT', '/economic_actor_answer/mine/q-radio', 'ae1', { value: { radio: '' } })).status, 200);
  });
});

// ---------- Aucun appel Graph / Excel ----------
describe('Indépendance vis-à-vis des fichiers Excel', () => {
  test("les contrôleurs du questionnaire n'importent ni microsoftGraph, ni excelSync, ni excelDefaults", () => {
    const loaded = new Set();
    const walk = (mod) => {
      if (!mod || loaded.has(mod.id)) return;
      loaded.add(mod.id);
      mod.children.forEach(walk);
    };
    for (const path of CONTROLLERS) walk(require.cache[require.resolve(path)]);
    const forbidden = [...loaded].filter((id) => /services[\\/](microsoftGraph|excelSync|excelDefaults|aggregationReader)\.js$/.test(id));
    assert.deepEqual(forbidden, []);
  });
});
