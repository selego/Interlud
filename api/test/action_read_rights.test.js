/* eslint-env node */
// Lecture d'une action (GET /action/:id) et des routes qui renvoient les données d'une action désignée par son identifiant
// (POST /indicator_value/stats, POST /indicator_value/export_indicator_values_excel) :
// - fiche du catalogue (type global) : lue par tous les comptes connectés ;
// - autre action : admin plateforme, membre approuvé de sa collectivité (quel que soit son rôle dans la collectivité)
//   ou acteur économique propriétaire. Un compte acteur économique ne lit que les actions de son organisation.
// Lancer : npm test (aucune connexion MongoDB ni Microsoft Graph nécessaire, les modèles sont simulés en mémoire).
process.env.SECRET = 'test-secret';

const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');

const User = require('../src/models/user');
const Action = require('../src/models/action');
const Indicator = require('../src/models/indicator');
const IndicatorValue = require('../src/models/indicator_value');
const excelSync = require('../src/services/excelSync');

let warmed;

// Pré-ouverture des sessions SharePoint simulée (avant le chargement du contrôleur, qui la déstructure)
excelSync.warmSessionsForAction = (action) => warmed.push(action._id);

const ACTION_COL = 'a00000000000000000000001';
const ACTION_AE = 'a00000000000000000000002';
const ACTION_GLOBAL = 'a00000000000000000000003';
const ACTION_GLOBAL_CLOSED = 'a00000000000000000000004';
const CONFIG_COL = 'a00000000000000000000005';
const CONFIG_AE = 'a00000000000000000000006';
const UNKNOWN = 'a00000000000000000000009';

const users = {
  admin: { _id: 'u-admin', name: 'Admin', role: 'admin', collectivities: [] },
  memberA: { _id: 'u-member-a', name: 'Membre A', role: 'user', collectivities: [{ id: 'col-a', role: 'user', status: 'approved' }] },
  adminA: { _id: 'u-admin-a', name: 'Admin A', role: 'user', collectivities: [{ id: 'col-a', role: 'admin', status: 'approved' }] },
  aeRoleMemberA: { _id: 'u-ae-role-a', name: 'Adhésion acteur économique', role: 'user', collectivities: [{ id: 'col-a', role: 'economic_actor', status: 'approved' }] },
  pendingA: { _id: 'u-pending-a', name: 'Membre A en attente', role: 'user', collectivities: [{ id: 'col-a', role: 'admin', status: 'pending' }] },
  rejectedA: { _id: 'u-rejected-a', name: 'Membre A refusé', role: 'user', collectivities: [{ id: 'col-a', role: 'admin', status: 'rejected' }] },
  memberB: { _id: 'u-member-b', name: 'Membre B', role: 'user', collectivities: [{ id: 'col-b', role: 'admin', status: 'approved' }] },
  noCollectivity: { _id: 'u-none', name: 'Sans collectivité', role: 'user', collectivities: [] },
  aeOwner: { _id: 'u-ae-1', name: 'AE 1', role: 'economic_actor', economic_actor_id: 'ea-1', collectivities: [{ id: 'col-a', role: 'economic_actor', status: 'approved' }] },
  aeOther: { _id: 'u-ae-2', name: 'AE 2', role: 'economic_actor', economic_actor_id: 'ea-2', collectivities: [{ id: 'col-a', role: 'economic_actor', status: 'approved' }] },
};

const actions = [
  { _id: ACTION_COL, name: 'Action collectivité A', type: 'custom', owner: 'collectivity', collectivity_id: 'col-a', exel_files_prev: [], excel_files_expost: [] },
  { _id: ACTION_AE, name: 'Action acteur 1', type: 'reference', owner: 'economic_actor', collectivity_id: 'col-a', economic_actor_id: 'ea-1', exel_files_prev: [], excel_files_expost: [] },
  { _id: ACTION_GLOBAL, name: 'Fiche du catalogue', type: 'global', exel_files_prev: [], excel_files_expost: [] },
  { _id: ACTION_GLOBAL_CLOSED, name: 'Fiche fermée aux acteurs', type: 'global', visible_for_economic_actors: false, exel_files_prev: [], excel_files_expost: [] },
  { _id: CONFIG_COL, name: 'Parc types', type: 'config', owner: 'collectivity', collectivity_id: 'col-a', exel_files_prev: [], excel_files_expost: [] },
  { _id: CONFIG_AE, name: 'Parc types', type: 'config', owner: 'economic_actor', collectivity_id: 'col-a', economic_actor_id: 'ea-1', exel_files_prev: [], excel_files_expost: [] },
];

User.findOne = async (query) => Object.values(users).find((u) => u._id === query._id) || null;
Action.findById = async (id) => actions.find((a) => a._id === id) || null;
Action.find = async () => [];
Indicator.find = async () => [];
IndicatorValue.find = async () => [];

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
  app.use('/indicator_value', require('../src/controllers/indicator_value'));
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => server.close());

beforeEach(() => {
  warmed = [];
});

// Comptes autorisés / refusés par action
const CASES = [
  { label: "action d'une collectivité", id: ACTION_COL, allowed: ['admin', 'memberA', 'adminA', 'aeRoleMemberA'], forbidden: ['aeOwner', 'aeOther', 'memberB', 'pendingA', 'rejectedA', 'noCollectivity'] },
  { label: "action d'un acteur économique", id: ACTION_AE, allowed: ['admin', 'aeOwner', 'memberA', 'adminA', 'aeRoleMemberA'], forbidden: ['aeOther', 'memberB', 'pendingA', 'noCollectivity'] },
  { label: 'fiche du catalogue', id: ACTION_GLOBAL, allowed: Object.keys(users), forbidden: [] },
  { label: 'fiche du catalogue fermée aux acteurs économiques', id: ACTION_GLOBAL_CLOSED, allowed: Object.keys(users), forbidden: [] },
  { label: "données générales d'une collectivité", id: CONFIG_COL, allowed: ['admin', 'memberA', 'adminA', 'aeRoleMemberA'], forbidden: ['aeOwner', 'aeOther', 'memberB', 'pendingA', 'noCollectivity'] },
  { label: "données générales d'un acteur économique", id: CONFIG_AE, allowed: ['admin', 'aeOwner', 'memberA'], forbidden: ['aeOther', 'memberB', 'noCollectivity'] },
];

for (const c of CASES) {
  describe(`GET /action/:id — ${c.label}`, () => {
    for (const who of c.allowed) {
      test(`autorisé pour ${who}`, async () => {
        const res = await call('GET', `/action/${c.id}`, who);
        assert.equal(res.status, 200);
        assert.equal(res.body.ok, true);
        assert.equal(res.body.data._id, c.id);
        assert.deepEqual(warmed, [c.id]);
      });
    }

    for (const who of c.forbidden) {
      test(`refusé pour ${who}, sans pré-ouverture des fichiers`, async () => {
        const res = await call('GET', `/action/${c.id}`, who);
        assert.equal(res.status, 403);
        assert.deepEqual(res.body, { ok: false, code: 'Accès refusé' });
        assert.deepEqual(warmed, []);
      });
    }
  });
}

describe('GET /action/:id — cas limites', () => {
  test('refusé sans authentification', async () => {
    assert.equal((await call('GET', `/action/${ACTION_COL}`, null)).status, 401);
    assert.deepEqual(warmed, []);
  });

  test('404 pour une action inexistante', async () => {
    const res = await call('GET', `/action/${UNKNOWN}`, 'memberA');
    assert.equal(res.status, 404);
    assert.deepEqual(res.body, { ok: false, code: 'Ressource non trouvée' });
  });
});

for (const route of [
  { path: '/indicator_value/stats', body: (id) => ({ action_id: id }) },
  { path: '/indicator_value/export_indicator_values_excel', body: (id) => ({ action_id: id }) },
]) {
  describe(`POST ${route.path} — même règle que la lecture de l'action`, () => {
    for (const c of CASES) {
      for (const who of c.allowed) {
        test(`${c.label} : autorisé pour ${who}`, async () => {
          assert.equal((await call('POST', route.path, who, route.body(c.id))).status, 200);
        });
      }
      for (const who of c.forbidden) {
        test(`${c.label} : refusé pour ${who}`, async () => {
          const res = await call('POST', route.path, who, route.body(c.id));
          assert.equal(res.status, 403);
          assert.deepEqual(res.body, { ok: false, code: 'Accès refusé' });
        });
      }
    }
  });
}
