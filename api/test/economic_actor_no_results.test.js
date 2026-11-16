/* eslint-env node */
// Les acteurs économiques ne doivent voir aucun résultat calculé : chaque route de résultats leur renvoie 403,
// et reste accessible à un membre de collectivité et à l'admin.
// Lancer : npm test (aucune connexion MongoDB ni Microsoft Graph nécessaire, les modèles sont simulés en mémoire).
process.env.SECRET = 'test-secret';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');

const User = require('../src/models/user');
const Action = require('../src/models/action');

const users = {
  admin: { _id: 'u-admin', name: 'Admin', role: 'admin', collectivities: [] },
  member: { _id: 'u-member', name: 'Membre A', role: 'user', collectivities: [{ id: 'col-a', role: 'user', status: 'approved' }] },
  ae: { _id: 'u-ae', name: 'AE', role: 'economic_actor', economic_actor_id: 'ea-1', collectivities: [] },
};

User.findOne = async (query) => Object.values(users).find((u) => u._id === query._id) || null;
// Aucune action : les routes Excel s'arrêtent avant tout appel à Microsoft Graph
Action.find = async () => [];

// Corps vides : pour un utilisateur autorisé, chaque route répond par une erreur de validation (200), sans appel externe
const RESULT_ROUTES = ['/excel/action_aggregation', '/excel/home_aggregation', '/excel/parent_action_aggregation', '/excel/compare_actions', '/excel/export', '/dashboard/synthese'];

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

for (const path of RESULT_ROUTES) {
  describe(`POST ${path}`, () => {
    test('un acteur économique est refusé (403 FORBIDDEN)', async () => {
      const res = await call(path, 'ae', { collectivity_id: 'col-a', collectivity: { _id: 'col-a' } });
      assert.equal(res.status, 403);
      assert.equal(res.body.ok, false);
      assert.equal(res.body.code, 'Accès refusé');
    });

    test('un membre de collectivité y a accès', async () => {
      const res = await call(path, 'member', {});
      assert.equal(res.status, 200);
    });

    test("l'admin y a accès", async () => {
      const res = await call(path, 'admin', {});
      assert.equal(res.status, 200);
    });
  });
}
