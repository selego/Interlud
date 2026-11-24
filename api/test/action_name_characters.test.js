/* eslint-env node */
// Nom d'une action repris dans le nom de ses fichiers Excel sur SharePoint : les caractères refusés par SharePoint
// ou par la recherche du fichier copié sont refusés à la saisie (400), avant tout appel à Microsoft Graph.
// Le nom d'une organisation, saisi librement, est nettoyé dans le nom du fichier.
// Lancer : npm test (aucune connexion MongoDB ni Microsoft Graph nécessaire, les modèles sont simulés en mémoire).
process.env.SECRET = 'test-secret';

const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');

const User = require('../src/models/user');
const Action = require('../src/models/action');
const IndicatorValue = require('../src/models/indicator_value');
const Indicator = require('../src/models/indicator');
const Collectivity = require('../src/models/collectivity');
const Log = require('../src/models/log');
const microsoftGraph = require('../src/services/microsoftGraph');
const completion = require('../src/utils/completion');
const excelDefaults = require('../src/services/excelDefaults');
const excelSync = require('../src/services/excelSync');
const ERROR_CODES = require('../src/utils/errorCodes');

const COL_A = 'cccccccccccccccccccccccc';
const PARENT = 'aaaaaaaaaaaaaaaaaaaaaaa1';
const ACTION_A = 'aaaaaaaaaaaaaaaaaaaaaaa2';
const ACTION_OLD = 'aaaaaaaaaaaaaaaaaaaaaaa3';

const users = {
  member: { _id: 'u-member', name: 'Membre A', role: 'user', collectivities: [{ id: COL_A, role: 'admin', status: 'approved' }] },
  admin: { _id: 'u-admin', name: 'Admin', role: 'admin', collectivities: [] },
  aeEmpty: { _id: 'u-ae-empty', name: 'AE 2', role: 'economic_actor', economic_actor_id: 'ea-2', economic_actor_name: '&&&', collectivities: [{ id: COL_A, role: 'economic_actor', status: 'approved' }] },
  ae: { _id: 'u-ae', name: 'AE', role: 'economic_actor', economic_actor_id: 'ea-1', economic_actor_name: "TEST Fret & Logistique / Quai #3 de l'Ouest", collectivities: [{ id: COL_A, role: 'economic_actor', status: 'approved' }] },
};

let store;

// SharePoint simulé (avant le chargement du contrôleur, qui le déstructure) : comme SharePoint, un nom de fichier
// contenant un caractère refusé fait échouer la copie.
microsoftGraph.duplicateExcelFile = async (name) => {
  store.graphCalls.push(name);
  if (/["*:<>?/\\|#%&]/.test(name)) throw new Error('Invalid file name');
  return `file-${store.graphCalls.length}`;
};
microsoftGraph.createWorkbookSession = async () => 'session';
microsoftGraph.closeWorkbookSession = async () => {};
microsoftGraph.clearWorksheetValues = async () => {};
microsoftGraph.updateExcelCellsBatch = async () => {};
microsoftGraph.updateExcelCellByIndicatorId = async () => {};
microsoftGraph.calculateWorkbook = async () => {};
microsoftGraph.readExcelDefaultValues = async () => new Map();
microsoftGraph.createFolder = async () => 'folder';
completion.computeActionCompletion = async () => {};
excelDefaults.refreshDefaultsAfterSync = async () => {};
excelSync.writeDraftFlag = async () => {};
excelSync.warmSessionsForAction = async () => {};

const makeDoc = (data) => {
  const doc = { ...data };
  Object.defineProperties(doc, {
    set: { value: (body) => Object.assign(doc, body) },
    save: { value: async () => doc },
  });
  return doc;
};

let nextId = 0;
User.findOne = async (query) => Object.values(users).find((u) => u._id === query._id) || null;
Action.findById = async (id) => store.actions.find((a) => String(a._id) === String(id)) || null;
Action.find = async () => [];
Action.findOne = async () => null;
Action.create = async (body) => {
  const doc = makeDoc({ _id: `new-${++nextId}`, ...body });
  store.actions.push(doc);
  return doc;
};
Collectivity.findById = async (id) => (String(id) === COL_A ? makeDoc({ _id: COL_A, name: 'Territoire A', sharepoint_folder_id: 'folder-a' }) : null);
Indicator.find = async () => [];
IndicatorValue.find = async () => [];
IndicatorValue.insertMany = async () => [];
IndicatorValue.findOneAndUpdate = async () => null;
IndicatorValue.findOne = async () => null;
Log.create = async (body) => body;
Log.insertMany = async (logs) => logs;

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
    graphCalls: [],
    actions: [
      makeDoc({ _id: PARENT, type: 'global', owner: 'collectivity', name: 'Fiche', excel_worksheetname: 'B3' }),
      makeDoc({ _id: ACTION_A, type: 'custom', owner: 'collectivity', name: 'Mon action', collectivity_id: COL_A }),
      // Action nommée avant le contrôle des caractères
      makeDoc({ _id: ACTION_OLD, type: 'custom', owner: 'collectivity', name: 'Port #2', collectivity_id: COL_A, budget_costs: 10, exel_files_prev: [{ year_prev: 2030, excel_file_id: 'f-prev' }], excel_files_expost: [] }),
    ],
  };
});

const createBody = (name) => ({ name, action_parent_id: PARENT, year_init: 2024, year_prev: 2030, collectivity_id: COL_A, type: 'custom' });

for (const name of ['Port #2', 'Quai 3 / Est', 'Fret & Logistique', 'Taux 50%', 'A:B', 'Pourquoi ?']) {
  test(`création refusée pour le nom « ${name} », sans appel à SharePoint`, async () => {
    const res = await call('POST', '/action', 'member', createBody(name));
    assert.equal(res.status, 400);
    assert.equal(res.body.code, ERROR_CODES.ACTION_NAME_INVALID_CHARACTERS);
    assert.deepEqual(store.graphCalls, []);
  });
}

test('nom avec accents, apostrophe, tirets et parenthèses : accepté, repris tel quel dans le nom du fichier', async () => {
  const res = await call('POST', '/action', 'member', createBody("Plateforme d'été (zone Nord-Est) – éco"));
  assert.equal(res.status, 200);
  assert.deepEqual(store.graphCalls, ["Plateforme d'été (zone Nord-Est) – éco_Prev2030.xlsx"]);
});

test("organisation dont le nom existant contient des caractères refusés : création réussie, nom du fichier nettoyé", async () => {
  const res = await call('POST', '/action', 'ae', createBody('Mon action AE'));
  assert.equal(res.status, 200);
  assert.deepEqual(store.graphCalls, ['TEST Fret Logistique Quai 3 de l Ouest_Mon action AE_Prev2030.xlsx']);
});

test('renommage refusé avec un caractère refusé, accepté sinon', async () => {
  const refused = await call('PUT', `/action/${ACTION_A}`, 'member', { name: 'Port #2' });
  assert.equal(refused.status, 400);
  assert.equal(refused.body.code, ERROR_CODES.ACTION_NAME_INVALID_CHARACTERS);
  assert.equal(store.actions.find((a) => a._id === ACTION_A).name, 'Mon action');

  const accepted = await call('PUT', `/action/${ACTION_A}`, 'member', { name: "Port d'Est (2)" });
  assert.equal(accepted.status, 200);
  assert.equal(store.actions.find((a) => a._id === ACTION_A).name, "Port d'Est (2)");
});

test('action au nom ancien : modifier un autre champ en renvoyant toute l\'action est accepté', async () => {
  const { _id, ...current } = store.actions.find((a) => a._id === ACTION_OLD);
  const res = await call('PUT', `/action/${ACTION_OLD}`, 'member', { ...current, budget_costs: 20 });
  assert.equal(res.status, 200);
  const action = store.actions.find((a) => a._id === ACTION_OLD);
  assert.equal(action.budget_costs, 20);
  assert.equal(action.name, 'Port #2');
});

test('action au nom ancien : renommage vers un nom valide accepté, vers un autre nom invalide refusé', async () => {
  const refused = await call('PUT', `/action/${ACTION_OLD}`, 'member', { name: 'Port #3' });
  assert.equal(refused.status, 400);
  assert.equal(refused.body.code, ERROR_CODES.ACTION_NAME_INVALID_CHARACTERS);
  assert.equal(store.actions.find((a) => a._id === ACTION_OLD).name, 'Port #2');

  const accepted = await call('PUT', `/action/${ACTION_OLD}`, 'member', { name: 'Port 2' });
  assert.equal(accepted.status, 200);
  assert.equal(store.actions.find((a) => a._id === ACTION_OLD).name, 'Port 2');
});

test('renommage : espaces de début et de fin retirés, nom vide refusé', async () => {
  const empty = await call('PUT', `/action/${ACTION_A}`, 'member', { name: '   ' });
  assert.equal(empty.status, 400);
  assert.equal(empty.body.code, ERROR_CODES.INVALID_BODY);

  const res = await call('PUT', `/action/${ACTION_A}`, 'member', { name: '  Nouveau nom  ' });
  assert.equal(res.status, 200);
  assert.equal(store.actions.find((a) => a._id === ACTION_A).name, 'Nouveau nom');
});

test('création : espaces de début et de fin retirés du nom et du nom du fichier', async () => {
  const res = await call('POST', '/action', 'member', createBody('  Mon action  '));
  assert.equal(res.status, 200);
  assert.equal(res.body.data.name, 'Mon action');
  assert.deepEqual(store.graphCalls, ['Mon action_Prev2030.xlsx']);
});

test('création : nom vide après nettoyage refusé comme un nom manquant', async () => {
  const res = await call('POST', '/action', 'member', createBody('   '));
  assert.equal(res.status, 400);
  assert.equal(res.body.code, ERROR_CODES.INVALID_BODY);
  assert.deepEqual(store.graphCalls, []);
});

test('création : nom de plus de 150 caractères refusé, 150 accepté', async () => {
  const tooLong = await call('POST', '/action', 'member', createBody('a'.repeat(151)));
  assert.equal(tooLong.status, 400);
  assert.equal(tooLong.body.code, ERROR_CODES.ACTION_NAME_TOO_LONG);
  assert.deepEqual(store.graphCalls, []);

  const max = await call('POST', '/action', 'member', createBody('a'.repeat(150)));
  assert.equal(max.status, 200);
});

for (const name of ['Ligne 1\nLigne 2', 'Avec\ttabulation']) {
  test(`création refusée pour un nom avec caractère de contrôle (${JSON.stringify(name)})`, async () => {
    const res = await call('POST', '/action', 'member', createBody(name));
    assert.equal(res.status, 400);
    assert.equal(res.body.code, ERROR_CODES.ACTION_NAME_INVALID_CHARACTERS);
    assert.deepEqual(store.graphCalls, []);
  });
}

test('création par un administrateur : même contrôle du nom', async () => {
  const refused = await call('POST', '/action', 'admin', createBody('Port #2'));
  assert.equal(refused.status, 400);
  assert.equal(refused.body.code, ERROR_CODES.ACTION_NAME_INVALID_CHARACTERS);
  assert.deepEqual(store.graphCalls, []);

  const accepted = await call('POST', '/action', 'admin', createBody('Livraisons + stockage'));
  assert.equal(accepted.status, 200);
  assert.deepEqual(store.graphCalls, ['Livraisons + stockage_Prev2030.xlsx']);
});

test("organisation dont le nom nettoyé est vide : le nom du fichier commence par « Organisation »", async () => {
  const res = await call('POST', '/action', 'aeEmpty', createBody('Mon action AE'));
  assert.equal(res.status, 200);
  assert.deepEqual(store.graphCalls, ['Organisation_Mon action AE_Prev2030.xlsx']);
});

for (const [route, body] of [
  ['/action/add_year_previsionnel', { action_id: ACTION_OLD, year_prev: 2035 }],
  ['/action/add_year_expost', { action_id: ACTION_OLD, year_expost: 2035 }],
]) {
  test(`${route} : action au nom ancien refusée (400) avant tout appel à SharePoint`, async () => {
    const res = await call('POST', route, 'member', body);
    assert.equal(res.status, 400);
    assert.equal(res.body.code, ERROR_CODES.ACTION_NAME_INVALID_CHARACTERS);
    assert.deepEqual(store.graphCalls, []);
  });

  test(`${route} : après renommage, le fichier est créé avec le nouveau nom`, async () => {
    store.actions.find((a) => a._id === ACTION_OLD).name = 'Port 2';
    await call('POST', route, 'member', body);
    assert.deepEqual(store.graphCalls, [route.endsWith('previsionnel') ? 'Port 2_Prev2035.xlsx' : 'Port 2_Expost2035.xlsx']);
  });
}

test('recherche du fichier copié : le nom est encodé dans le filtre, apostrophe doublée', () => {
  for (const name of ['Livraisons + stockage_Prev2030.xlsx', "L'atelier_Prev2030.xlsx", 'A=B;C_Prev2030.xlsx', 'Fret & Logistique.xlsx']) {
    const path = microsoftGraph.childByNamePath('site', 'folder', name);
    const url = new URL(`https://graph.microsoft.com/v1.0${path}`);
    assert.equal(url.pathname, '/v1.0/sites/site/drive/items/folder/children');
    assert.deepEqual([...url.searchParams.keys()], ['$filter']);
    assert.equal(url.searchParams.get('$filter'), `name eq '${name.replace(/'/g, "''")}'`);
  }
});
