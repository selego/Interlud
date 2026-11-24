/* eslint-env node */
// Les acteurs économiques ne voient pas le tableau de bord collectif (accueil, synthèse, comparaison, export) : ces routes
// leur renvoient 403 et restent accessibles à un membre de collectivité et à l'admin.
// Exception (décision du 24/11) : ils voient les résultats de leurs propres actions (tableau de bord de l'action et de la
// fiche du catalogue qui regroupe leurs remplissages), jamais ceux d'une autre organisation ni de la collectivité.
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
const EconomicActor = require('../src/models/economic_actor');
const { ACTION_GAINS_RANGES } = require('../src/services/aggregationReader');

// Microsoft Graph simulé : on note le classeur d'agrégation lu, sans aucun appel externe
const graph = require('../src/services/microsoftGraph');
const graphCalls = [];
graph.getSiteId = async () => 'site';
graph.graphFetchWithSession = async (fileId) => {
  graphCalls.push(fileId);
  return { values: [] };
};

const users = {
  admin: { _id: 'u-admin', name: 'Admin', role: 'admin', collectivities: [] },
  // Admin global qui a aussi le rôle 'economic_actor' dans col-a : l'admin voit toujours les résultats
  adminAeInCol: { _id: 'u-admin-ae', name: 'Admin AE', role: 'admin', collectivities: [{ role: 'economic_actor', id: 'col-a', status: 'approved' }] },
  member: { _id: 'u-member', name: 'Membre A', role: 'user', collectivities: [{ id: 'col-a', role: 'user', status: 'approved' }] },
  ae: { _id: 'u-ae', name: 'AE', role: 'economic_actor', economic_actor_id: 'ea-1', collectivities: [{ id: 'col-a', role: 'user', status: 'approved' }] },
  // Rôle global 'user', mais acteur économique dans col-a (rôle attribué par collectivité) et simple membre de col-b
  // Ancien membre d'une organisation : rôle global 'user', identifiant d'organisation resté sur le compte
  formerAe: { _id: 'u-former-ae', name: 'Ancien AE', role: 'user', economic_actor_id: 'ea-1', collectivities: [{ id: 'col-a', role: 'economic_actor', status: 'approved' }] },
  // Compte acteur économique en attente d'approbation dans col-a
  aePending: { _id: 'u-ae-pending', name: 'AE en attente', role: 'economic_actor', economic_actor_id: 'ea-1', collectivities: [{ id: 'col-a', role: 'user', status: 'pending' }] },
  aeInCol: {
    _id: 'u-ae-col',
    name: 'AE par collectivité',
    role: 'user',
    collectivities: [
      { id: 'col-a', role: 'economic_actor', status: 'approved' },
      { id: 'col-b', role: 'user', status: 'approved' },
    ],
  },
};

// Feuille Excel inconnue : une fois les droits vérifiés, les routes d'action répondent par une erreur métier (200),
// sans appel à Microsoft Graph
const actions = [
  { _id: 'act-ae1', type: 'custom', owner: 'economic_actor', economic_actor_id: 'ea-1', collectivity_id: 'col-a', excel_worksheetname: 'INCONNUE' },
  { _id: 'act-ae2', type: 'custom', owner: 'economic_actor', economic_actor_id: 'ea-2', collectivity_id: 'col-a', excel_worksheetname: 'INCONNUE' },
  { _id: 'act-col', type: 'custom', owner: 'collectivity', collectivity_id: 'col-a', excel_worksheetname: 'INCONNUE' },
  { _id: 'act-global', type: 'global', excel_worksheetname: 'INCONNUE' },
  // Fiche du catalogue avec une feuille Excel connue : la route va jusqu'à la lecture du classeur et la recherche des actions
  { _id: 'act-global-known', type: 'global', excel_worksheetname: Object.keys(ACTION_GAINS_RANGES)[0] },
];
const economicActors = [{ _id: 'ea-1', collectivities: [{ id: 'col-a', aggregation_excel_file_id: 'file-ea-1' }] }];
EconomicActor.findById = async (id) => economicActors.find((e) => e._id === id) || null;

User.findOne = async (query) => Object.values(users).find((u) => u._id === query._id) || null;
Action.findById = async (id) => actions.find((a) => a._id === id) || null;
// Aucune action : les routes collectives s'arrêtent avant tout appel à Microsoft Graph
const findQueries = [];
Action.find = (query) => {
  findQueries.push(query);
  const result = Promise.resolve([]);
  result.sort = () => result;
  return result;
};
// Aucun classeur d'agrégation configuré : /excel/home_aggregation s'arrête avant tout appel à Microsoft Graph
Collectivity.findById = async () => null;

// Tableau de bord collectif. Corps vides : pour un utilisateur autorisé, chaque route répond par une erreur de validation
// (200), sans appel externe
const RESULT_ROUTES = ['/excel/home_aggregation', '/excel/compare_actions', '/excel/export', '/dashboard/synthese'];

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
      const res = await call(path, 'ae', { collectivity_id: 'col-a', collectivity: { _id: 'col-a' }, action_ids: ['act-ae1'], fileId: 'f-1' });
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

    test("un admin ayant le rôle 'economic_actor' dans la collectivité ciblée y a accès", async () => {
      const res = await call(path, 'adminAeInCol', { collectivity_id: 'col-a', collectivity: { _id: 'col-a' } });
      assert.equal(res.status, 200);
    });

    test('un utilisateur acteur économique dans la collectivité ciblée est refusé (403 FORBIDDEN)', async () => {
      const res = await call(path, 'aeInCol', { collectivity_id: 'col-a', collectivity: { _id: 'col-a' } });
      assert.equal(res.status, 403);
      assert.equal(res.body.code, 'Accès refusé');
    });

    // /excel/export ne reçoit qu'un fileId : sans collectivité ciblée, il reste refusé (cf. test dédié ci-dessous)
    if (path !== '/excel/export') {
      test('le même utilisateur y a accès sur une collectivité où il est simple membre', async () => {
        const res = await call(path, 'aeInCol', { collectivity_id: 'col-b', collectivity: { _id: 'col-b' } });
        assert.equal(res.status, 200);
      });
    }
  });
}

test("POST /excel/export : un admin acteur économique dans une collectivité y a accès", async () => {
  const res = await call('/excel/export', 'adminAeInCol', {});
  assert.equal(res.status, 200);
});

test("POST /excel/export : refusé à un utilisateur acteur économique dans au moins une collectivité (fichier sans collectivité connue)", async () => {
  const res = await call('/excel/export', 'aeInCol', { fileId: 'f-1' });
  assert.equal(res.status, 403);
});

const assertForbidden = (res) => {
  assert.equal(res.status, 403);
  assert.equal(res.body.ok, false);
  assert.equal(res.body.code, 'Accès refusé');
};
// Réponse après le contrôle des droits : erreur métier sur la feuille Excel inconnue, sans résultat
const assertAllowed = (res) => {
  assert.equal(res.status, 200);
  assert.match(res.body.data?.error || '', /not found in gains configuration/);
};
const actionBody = (id) => ({ collectivity: { _id: 'col-a' }, action: { _id: id } });

describe("Résultats des actions d'un acteur économique", () => {
  for (const path of ['/excel/action_aggregation', '/excel/parent_action_aggregation']) {
    test(`POST ${path} : un acteur économique lit les résultats de sa propre action`, async () => {
      assertAllowed(await call(path, 'ae', actionBody('act-ae1')));
    });

    test(`POST ${path} : refusé sur l'action d'une autre organisation`, async () => {
      assertForbidden(await call(path, 'ae', actionBody('act-ae2')));
    });

    test(`POST ${path} : refusé sur une action de la collectivité`, async () => {
      assertForbidden(await call(path, 'ae', actionBody('act-col')));
    });

    test(`POST ${path} : le propriétaire déclaré dans le corps de la requête n'est pas pris en compte`, async () => {
      assertForbidden(await call(path, 'ae', { collectivity: { _id: 'col-a' }, action: { _id: 'act-col', owner: 'economic_actor', economic_actor_id: 'ea-1' } }));
    });

    test(`POST ${path} : un membre de la collectivité et l'admin y ont toujours accès`, async () => {
      assertAllowed(await call(path, 'member', actionBody('act-col')));
      assertAllowed(await call(path, 'admin', actionBody('act-ae2')));
    });

    test(`POST ${path} : un compte acteur économique par collectivité, sans organisation, reste refusé`, async () => {
      assertForbidden(await call(path, 'aeInCol', actionBody('act-ae1')));
      assertForbidden(await call(path, 'aeInCol', actionBody('act-global')));
    });
  }

  // Fiche du catalogue : la route lit le fichier d'agrégation de son organisation et ne renvoie que ses actions
  test('POST /excel/parent_action_aggregation : un acteur économique lit la fiche qui regroupe ses remplissages', async () => {
    assertAllowed(await call('/excel/parent_action_aggregation', 'ae', actionBody('act-global')));
  });

  test("POST /excel/action_aggregation : refusé sur sa propre action s'il n'est pas rattaché à la collectivité ciblée", async () => {
    assertForbidden(await call('/excel/action_aggregation', 'ae', { collectivity: { _id: 'col-b' }, action: { _id: 'act-ae1' } }));
  });

  test("POST /excel/parent_action_aggregation : la fiche ne lit que le classeur et les actions de son organisation", async () => {
    graphCalls.length = 0;
    findQueries.length = 0;
    const res = await call('/excel/parent_action_aggregation', 'ae', { collectivity: { _id: 'col-a' }, action: { _id: 'act-global-known', owner: 'collectivity', economic_actor_id: 'ea-2' } });
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.deepEqual([...new Set(graphCalls)], ['file-ea-1']);
    assert.equal(findQueries.length, 1);
    assert.equal(findQueries[0].owner, 'economic_actor');
    assert.equal(findQueries[0].economic_actor_id, 'ea-1');
    assert.equal(findQueries[0].collectivity_id, 'col-a');
  });

  test("POST /excel/parent_action_aggregation : 404 si son organisation n'est pas rattachée à la collectivité", async () => {
    economicActors[0].collectivities = [];
    const res = await call('/excel/parent_action_aggregation', 'ae', actionBody('act-global-known'));
    economicActors[0].collectivities = [{ id: 'col-a', aggregation_excel_file_id: 'file-ea-1' }];
    assert.equal(res.status, 404);
  });

  for (const path of ['/excel/action_aggregation', '/excel/parent_action_aggregation']) {
    test(`POST ${path} : un ancien membre d'organisation (rôle global utilisateur) reste refusé`, async () => {
      assertForbidden(await call(path, 'formerAe', actionBody('act-ae1')));
      assertForbidden(await call(path, 'formerAe', actionBody('act-global')));
    });

    test(`POST ${path} : un acteur économique non approuvé dans la collectivité est refusé`, async () => {
      assertForbidden(await call(path, 'aePending', actionBody('act-ae1')));
    });

    test(`POST ${path} : un identifiant de collectivité sous forme d'objet est refusé`, async () => {
      assertForbidden(await call(path, 'ae', { collectivity: { _id: { $ne: null } }, action: { _id: 'act-ae1' } }));
    });
  }

  test('POST /dashboard/synthese : la synthèse du territoire reste refusée', async () => {
    assertForbidden(await call('/dashboard/synthese', 'ae', { collectivity_id: 'col-a' }));
  });
});
