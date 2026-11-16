/* eslint-env node */
// Tests de la visibilité des fiches du catalogue (actions type global) pour les acteurs économiques.
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
const Log = require('../src/models/log');

// ---------- Utilisateurs simulés ----------
const users = {
  admin: { _id: 'u-admin', name: 'Admin', role: 'admin', collectivities: [] },
  member: { _id: 'u-member', name: 'Membre A', role: 'user', collectivities: [{ id: 'col-a', role: 'admin', status: 'approved' }] },
  ae: { _id: 'u-ae', name: 'AE', role: 'economic_actor', economic_actor_id: 'ea-1', collectivities: [{ id: 'col-a', role: 'economic_actor', status: 'approved' }] },
};

let store;

// Évalue une requête Mongo simple (égalité, $ne, $in) sur un document en mémoire
const matches = (doc, query) =>
  Object.entries(query).every(([key, cond]) => {
    if (cond && typeof cond === 'object' && '$ne' in cond) return doc[key] !== cond.$ne;
    if (cond && typeof cond === 'object' && '$in' in cond) return cond.$in.includes(doc[key]);
    return doc[key] === cond;
  });

const chain = (rows) => {
  const query = {
    sort: () => query,
    skip: () => query,
    limit: () => query,
    then: (resolve, reject) => Promise.resolve(rows).then(resolve, reject),
  };
  return query;
};

const withMethods = (doc) =>
  Object.assign(doc, {
    set(updates) {
      Object.assign(this, updates);
    },
    async save() {
      return this;
    },
  });

User.findOne = async (query) => Object.values(users).find((u) => u._id === query._id) || null;
Action.findById = async (id) => store.actions.find((a) => a._id === id) || null;
Action.find = (query) => chain(store.actions.filter((a) => matches(a, query)));
Action.countDocuments = async (query) => store.actions.filter((a) => matches(a, query)).length;
// Collectivité introuvable : la création s'arrête en 404 juste après le contrôle de visibilité, avant tout appel SharePoint
Collectivity.findById = async () => null;
Log.insertMany = async () => [];

// ---------- Serveur de test ----------
let server;
let baseUrl;

const call = async (method, path, who, body) => {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `JWT ${jwt.sign({ _id: users[who]._id }, process.env.SECRET)}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, body: await response.json().catch(() => null) };
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
      withMethods({ _id: 'g-b3', type: 'global', owner: 'collectivity', name: 'B3', collectivity_id: 'col-a', visible_for_economic_actors: true }),
      withMethods({ _id: 'g-b2', type: 'global', owner: 'collectivity', name: 'B2', collectivity_id: 'col-a', visible_for_economic_actors: false }),
      // Fiche créée avant l'ajout du champ : considérée comme visible
      withMethods({ _id: 'g-c1', type: 'global', owner: 'collectivity', name: 'C1' }),
      // Action existante de l'AE sur la fiche B2 devenue non visible
      withMethods({ _id: 'ae-b2', type: 'reference', owner: 'economic_actor', economic_actor_id: 'ea-1', collectivity_id: 'col-a', action_parent_id: 'g-b2', name: 'Mon action B2' }),
    ],
  };
});

const createBody = (parentId, extra = {}) => ({ name: 'Nouvelle action', action_parent_id: parentId, year_init: 2024, year_prev: 2030, collectivity_id: 'col-a', ...extra });

describe('Catalogue des fiches (POST /action/search type global)', () => {
  test("un acteur économique ne voit pas les fiches non visibles", async () => {
    const res = await call('POST', '/action/search', 'ae', { type: 'global' });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.data.map((a) => a._id).sort(), ['g-b3', 'g-c1']);
  });

  test('une collectivité voit toutes les fiches', async () => {
    const res = await call('POST', '/action/search', 'member', { type: 'global' });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.data.map((a) => a._id).sort(), ['g-b2', 'g-b3', 'g-c1']);
  });

  test('un acteur économique garde ses actions existantes sur une fiche devenue non visible', async () => {
    const res = await call('POST', '/action/search', 'ae', {});
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.data.map((a) => a._id), ['ae-b2']);
    assert.equal((await call('GET', '/action/ae-b2', 'ae')).status, 200);
  });
});

describe("Création d'action (POST /action)", () => {
  test("un acteur économique ne peut pas créer d'action à partir d'une fiche non visible", async () => {
    const res = await call('POST', '/action', 'ae', createBody('g-b2', { owner: 'economic_actor', economic_actor_id: 'ea-1' }));
    assert.equal(res.status, 403);
    assert.equal(res.body.code, 'Accès refusé');
  });

  test("un acteur économique passe le contrôle sur une fiche visible", async () => {
    const res = await call('POST', '/action', 'ae', createBody('g-b3', { owner: 'economic_actor', economic_actor_id: 'ea-1' }));
    assert.equal(res.status, 404); // collectivité simulée absente : le contrôle de visibilité est passé
  });

  test("une collectivité passe le contrôle sur une fiche non visible pour les acteurs économiques", async () => {
    const res = await call('POST', '/action', 'member', createBody('g-b2'));
    assert.equal(res.status, 404);
  });

  test("un acteur économique qui omet owner ou se déclare collectivité est quand même refusé", async () => {
    assert.equal((await call('POST', '/action', 'ae', createBody('g-b2'))).status, 403);
    assert.equal((await call('POST', '/action', 'ae', createBody('g-b2', { owner: 'collectivity' }))).status, 403);
  });

  test("une collectivité ne peut pas créer pour un acteur économique sur une fiche non visible", async () => {
    const res = await call('POST', '/action', 'member', createBody('g-b2', { owner: 'economic_actor', economic_actor_id: 'ea-1' }));
    assert.equal(res.status, 403);
  });

  test("une fiche existante sans le champ reste utilisable par un acteur économique", async () => {
    assert.equal((await call('POST', '/action', 'ae', createBody('g-c1'))).status, 404);
  });

  test("le parent doit être une fiche du catalogue", async () => {
    // L'action existante ae-b2 porte la feuille B2 mais n'est pas une fiche global
    const res = await call('POST', '/action', 'ae', createBody('ae-b2'));
    assert.equal(res.status, 400);
  });

  test("seul un admin peut créer une action d'un autre type que référence ou personnalisée", async () => {
    assert.equal((await call('POST', '/action', 'ae', createBody('g-b3', { type: 'global' }))).status, 400);
    assert.equal((await call('POST', '/action', 'member', createBody('g-b3', { type: 'global' }))).status, 400);
    assert.equal((await call('POST', '/action', 'member', createBody('g-b3', { type: 'custom' }))).status, 404);
  });
});

describe('Modification du champ (PUT /action/:id)', () => {
  test("seul l'admin plateforme modifie visible_for_economic_actors", async () => {
    const byMember = await call('PUT', '/action/g-b3', 'member', { visible_for_economic_actors: false });
    assert.equal(byMember.status, 200);
    assert.equal(store.actions.find((a) => a._id === 'g-b3').visible_for_economic_actors, true);

    const byAe = await call('PUT', '/action/g-b3', 'ae', { visible_for_economic_actors: false });
    assert.equal(byAe.status, 403);
    assert.equal(store.actions.find((a) => a._id === 'g-b3').visible_for_economic_actors, true);

    const byAdmin = await call('PUT', '/action/g-b3', 'admin', { visible_for_economic_actors: false });
    assert.equal(byAdmin.status, 200);
    assert.equal(store.actions.find((a) => a._id === 'g-b3').visible_for_economic_actors, false);
  });
});
