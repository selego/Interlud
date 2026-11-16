/* eslint-env node */
// Les routes de résultats ne renvoient les données d'une collectivité qu'à ses membres approuvés et à l'admin.
// Lancer : npm test (aucune connexion MongoDB ni Microsoft Graph nécessaire, les modèles sont simulés en mémoire).
process.env.SECRET = 'test-secret';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');

const User = require('../src/models/user');
const Action = require('../src/models/action');
const Collectivity = require('../src/models/collectivity');
const microsoftGraph = require('../src/services/microsoftGraph');

// Export simulé (avant le chargement du contrôleur, qui le déstructure) : aucun appel à Microsoft Graph
microsoftGraph.exportExcelFile = async (fileId) => ({ downloadUrl: `https://example.test/${fileId}`, fileName: `${fileId}.xlsx` });

const users = {
  admin: { _id: 'u-admin', name: 'Admin', role: 'admin', collectivities: [] },
  member: { _id: 'u-member', name: 'Membre A', role: 'user', collectivities: [{ id: 'col-a', role: 'user', status: 'approved' }] },
  pending: { _id: 'u-pending', name: 'En attente A', role: 'user', collectivities: [{ id: 'col-a', role: 'user', status: 'pending' }] },
  outsider: { _id: 'u-outsider', name: 'Membre B', role: 'user', collectivities: [{ id: 'col-b', role: 'user', status: 'approved' }] },
};

const actions = [
  { _id: 'act-a', type: 'custom', owner: 'collectivity', collectivity_id: 'col-a', excel_worksheetname: 'INCONNUE', exel_files_prev: [{ excel_file_id: 'file-a' }], excel_files_expost: [] },
  { _id: 'act-b', type: 'custom', owner: 'collectivity', collectivity_id: 'col-b', excel_worksheetname: 'INCONNUE', exel_files_prev: [{ excel_file_id: 'file-b' }], excel_files_expost: [] },
  { _id: 'act-global', type: 'global', excel_worksheetname: 'INCONNUE', exel_files_prev: [], excel_files_expost: [] },
];

User.findOne = async (query) => Object.values(users).find((u) => u._id === query._id) || null;
Action.findById = async (id) => actions.find((a) => a._id === id) || null;
Action.find = async (query) => (query?._id?.$in ? actions.filter((a) => query._id.$in.includes(a._id)) : []);
Action.findOne = async (query) => actions.find((a) => query.$or.some((cond) => [...a.exel_files_prev, ...a.excel_files_expost].some((f) => f.excel_file_id === Object.values(cond)[0]))) || null;
// Aucun classeur d'agrégation configuré : les routes s'arrêtent avant tout appel à Microsoft Graph
Collectivity.findById = async () => null;
const collectivities = [
  { _id: 'col-a', aggregation_excel_file_id: 'agg-a' },
  { _id: 'col-b', aggregation_excel_file_id: 'agg-b' },
];
Collectivity.findOne = async (query) => collectivities.find((c) => c.aggregation_excel_file_id === query.aggregation_excel_file_id) || null;

let server;
let baseUrl;

const call = async (path, who, body) => {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `JWT ${jwt.sign({ _id: users[who]._id }, process.env.SECRET)}` },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json().catch(() => null) };
};

const assertForbidden = (res) => {
  assert.equal(res.status, 403);
  assert.equal(res.body.ok, false);
  assert.equal(res.body.code, 'Accès refusé');
};

before(async () => {
  const app = express();
  app.set('env', 'test');
  app.use(cookieParser());
  app.use(express.json());
  require('../src/services/passport')(app);
  app.use('/excel', require('../src/controllers/excel'));
  app.use('/dashboard', require('../src/controllers/dashboard'));
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => server.close());

// Corps ciblant col-a : un utilisateur autorisé reçoit une erreur métier (200), sans appel externe
const COLLECTIVITY_ROUTES = {
  '/excel/action_aggregation': { collectivity: { _id: 'col-a' }, action: { _id: 'act-a' } },
  '/excel/home_aggregation': { collectivity: { _id: 'col-a' } },
  '/excel/parent_action_aggregation': { collectivity: { _id: 'col-a' }, action: { _id: 'act-global' } },
  '/excel/compare_actions': { collectivity: { _id: 'col-a' }, action_ids: ['act-a'] },
  '/excel/export': { fileId: 'file-a' },
  '/dashboard/synthese': { collectivity_id: 'col-a' },
};

for (const [path, body] of Object.entries(COLLECTIVITY_ROUTES)) {
  describe(`POST ${path}`, () => {
    test('un membre approuvé de la collectivité y a accès', async () => {
      const res = await call(path, 'member', body);
      assert.equal(res.status, 200);
    });

    test("l'admin y a accès", async () => {
      const res = await call(path, 'admin', body);
      assert.equal(res.status, 200);
    });

    test("un membre d'une autre collectivité est refusé (403 FORBIDDEN)", async () => {
      assertForbidden(await call(path, 'outsider', body));
    });

    test('un membre en attente de validation est refusé (403 FORBIDDEN)', async () => {
      assertForbidden(await call(path, 'pending', body));
    });
  });
}

test("POST /excel/action_aggregation : une fiche d'une autre collectivité est refusée, même en ciblant sa propre collectivité", async () => {
  assertForbidden(await call('/excel/action_aggregation', 'member', { collectivity: { _id: 'col-a' }, action: { _id: 'act-b', collectivity_id: 'col-a' } }));
});

test("POST /excel/parent_action_aggregation : une fiche d'une autre collectivité est refusée", async () => {
  assertForbidden(await call('/excel/parent_action_aggregation', 'member', { collectivity: { _id: 'col-a' }, action: { _id: 'act-b' } }));
});

test("POST /excel/compare_actions : une fiche d'une autre collectivité est refusée", async () => {
  assertForbidden(await call('/excel/compare_actions', 'member', { collectivity: { _id: 'col-a' }, action_ids: ['act-a', 'act-b'] }));
});

test("POST /excel/export : le fichier d'une fiche d'une autre collectivité est refusé", async () => {
  assertForbidden(await call('/excel/export', 'member', { fileId: 'file-b' }));
});

test('POST /excel/export : un fichier inconnu est refusé', async () => {
  assertForbidden(await call('/excel/export', 'member', { fileId: 'file-inconnu' }));
});

test("POST /excel/export : le fichier d'agrégation de sa collectivité est accepté, celui d'une autre refusé", async () => {
  assert.equal((await call('/excel/export', 'member', { fileId: 'agg-a' })).status, 200);
  assertForbidden(await call('/excel/export', 'member', { fileId: 'agg-b' }));
});

test('POST /excel/export : un fileId qui n\'est pas une chaîne est rejeté sans export', async () => {
  const res = await call('/excel/export', 'member', { fileId: { $ne: null } });
  assert.equal(res.body.ok, false);
});

test('POST /excel/action_aggregation : déclarer la fiche « global » dans le corps ne contourne pas le contrôle', async () => {
  assertForbidden(await call('/excel/action_aggregation', 'member', { collectivity: { _id: 'col-a' }, action: { _id: 'act-b', type: 'global' } }));
});

test('POST /excel/home_aggregation : la collectivité passée par `id` est contrôlée aussi', async () => {
  assert.equal((await call('/excel/home_aggregation', 'member', { collectivity: { id: 'col-a' } })).status, 200);
  assertForbidden(await call('/excel/home_aggregation', 'member', { collectivity: { id: 'col-b' } }));
});
