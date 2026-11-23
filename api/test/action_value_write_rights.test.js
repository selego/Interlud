/* eslint-env node */
// Droits d'écriture sur les actions et leurs valeurs : création d'une action, années prévisionnelles et ex-post,
// modification, création et import de valeurs d'indicateurs.
// Lancer : npm test (aucune connexion MongoDB ni Microsoft Graph nécessaire, les modèles et SharePoint sont simulés en mémoire).
process.env.SECRET = 'test-secret';

const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const ExcelJS = require('exceljs');

const User = require('../src/models/user');
const Action = require('../src/models/action');
const Indicator = require('../src/models/indicator');
const IndicatorValue = require('../src/models/indicator_value');
const Log = require('../src/models/log');
const Collectivity = require('../src/models/collectivity');
const EconomicActor = require('../src/models/economic_actor');
const microsoftGraph = require('../src/services/microsoftGraph');
const excelSync = require('../src/services/excelSync');
const excelDefaults = require('../src/services/excelDefaults');
const completion = require('../src/utils/completion');
const sentry = require('../src/services/sentry');

let store;

// Toute écriture (base, journal, SharePoint, file de synchro Excel) est tracée ici
const write = (name) => store.writes.push(name);

// SharePoint et synchro Excel simulés (avant le chargement des contrôleurs, qui les déstructurent)
for (const name of ['updateExcelCellByIndicatorId', 'updateExcelCellsBatch', 'clearWorksheetValues', 'calculateWorkbook', 'closeWorkbookSession', 'importSheetsToExcelFile', 'graphFetch']) {
  microsoftGraph[name] = async () => {
    write(`graph.${name}`);
    return { id: 'site-test', values: [] };
  };
}
microsoftGraph.duplicateExcelFile = async () => {
  write('graph.duplicateExcelFile');
  return `file-${store.writes.length}`;
};
microsoftGraph.createFolder = async () => {
  write('graph.createFolder');
  return 'folder-new';
};
microsoftGraph.createWorkbookSession = async () => 'session-test';
microsoftGraph.readExcelDefaultValues = async () => new Map();
excelSync.enqueueCellUpdate = () => write('sync.enqueueCellUpdate');
excelSync.enqueueAggregation = () => write('sync.enqueueAggregation');
excelSync.writeDraftFlag = async () => write('sync.writeDraftFlag');
excelSync.warmSessionsForAction = () => {};
excelDefaults.refreshDefaultsAfterSync = async () => {};
completion.computeActionCompletion = async () => {};
sentry.capture = (error) => store.errors.push(error);

const COL_A = 'c0000000000000000000000a';
const COL_B = 'c0000000000000000000000b';
const PARENT = 'a00000000000000000000000';
const ACTION_COL = 'a00000000000000000000001';
const ACTION_AE = 'a00000000000000000000002';
const CONFIG_AE = 'a00000000000000000000003';
const ACTION_COL_B = 'a00000000000000000000004';
const IV_COL = 'f00000000000000000000001';
const IV_AE = 'f00000000000000000000002';
const IV_CONFIG_AE = 'f00000000000000000000003';
const IV_COL_B = 'f00000000000000000000004';
// Données générales du même acteur économique dans une autre collectivité
const CONFIG_AE_B = 'a00000000000000000000005';
const IV_CONFIG_AE_B = 'f00000000000000000000005';
const UNKNOWN = 'a00000000000000000000009';

const users = {
  admin: { _id: 'u-admin', name: 'Admin', role: 'admin', collectivities: [] },
  memberA: { _id: 'u-member-a', name: 'Membre A', role: 'user', collectivities: [{ id: COL_A, role: 'user', status: 'approved' }] },
  adminA: { _id: 'u-admin-a', name: 'Admin A', role: 'user', collectivities: [{ id: COL_A, role: 'admin', status: 'approved' }] },
  pendingA: { _id: 'u-pending-a', name: 'Admin A en attente', role: 'user', collectivities: [{ id: COL_A, role: 'admin', status: 'pending' }] },
  adminB: { _id: 'u-admin-b', name: 'Admin B', role: 'user', collectivities: [{ id: COL_B, role: 'admin', status: 'approved' }] },
  noCollectivity: { _id: 'u-none', name: 'Sans collectivité', role: 'user', collectivities: [] },
  aeOwner: { _id: 'u-ae-1', name: 'AE 1', role: 'economic_actor', economic_actor_id: 'ea-1', economic_actor_name: 'Acteur 1', collectivities: [{ id: COL_A, role: 'economic_actor', status: 'approved' }] },
  // Second compte de la même organisation (invité par le premier)
  aeInvited: { _id: 'u-ae-1b', name: 'AE 1 invité', role: 'economic_actor', economic_actor_id: 'ea-1', economic_actor_name: 'Acteur 1', collectivities: [{ id: COL_A, role: 'economic_actor', status: 'approved' }] },
  aeOther: { _id: 'u-ae-2', name: 'AE 2', role: 'economic_actor', economic_actor_id: 'ea-2', economic_actor_name: 'Acteur 2', collectivities: [{ id: COL_A, role: 'economic_actor', status: 'approved' }] },
  aePending: { _id: 'u-ae-3', name: 'AE 3 en attente', role: 'economic_actor', economic_actor_id: 'ea-3', economic_actor_name: 'Acteur 3', collectivities: [{ id: COL_A, role: 'economic_actor', status: 'pending' }] },
};

// Document simulé : expose les méthodes Mongoose utilisées par les contrôleurs
const makeDoc = (data) => {
  const doc = { ...data };
  Object.defineProperties(doc, {
    set: { value: (body) => Object.assign(doc, body) },
    save: {
      value: async () => {
        write('save');
        return doc;
      },
    },
  });
  return doc;
};

// Filtre simplifié : égalité sur les champs simples, $in et $ne ; les autres opérateurs sont ignorés
const matches = (doc, query) =>
  Object.entries(query).every(([key, expected]) => {
    if (key.startsWith('$') || key.includes('.')) return true;
    if (expected && typeof expected === 'object' && !mongoose.isValidObjectId(expected)) {
      if (Array.isArray(expected.$in)) return expected.$in.map(String).includes(String(doc[key]));
      if ('$ne' in expected) return String(doc[key]) !== String(expected.$ne);
      return true;
    }
    return String(doc[key]) === String(expected);
  });

const chain = (rows) => {
  const query = {
    sort: () => query,
    skip: () => query,
    limit: () => query,
    lean: () => query,
    then: (resolve, reject) => Promise.resolve(rows).then(resolve, reject),
  };
  return query;
};

// Comme Mongoose, un identifiant mal formé lève une erreur de conversion
const byId = (key) => async (id) => {
  if (typeof id !== 'string' || !mongoose.isValidObjectId(id)) throw new Error('Cast to ObjectId failed');
  return store[key].find((d) => d._id === String(id)) || null;
};

const mockCollection = (Model, key) => {
  Model.findById = byId(key);
  Model.findOne = async (query) => store[key].find((d) => matches(d, query)) || null;
  Model.find = (query = {}) => chain(store[key].filter((d) => matches(d, query)));
  Model.countDocuments = async (query = {}) => store[key].filter((d) => matches(d, query)).length;
  Model.create = async (body) => {
    write(`${key}.create`);
    const doc = makeDoc({ ...body, _id: new mongoose.Types.ObjectId().toString() });
    store[key].push(doc);
    return doc;
  };
  Model.insertMany = async (docs) => {
    write(`${key}.insertMany`);
    store[key].push(...docs.map((d) => makeDoc({ ...d, _id: new mongoose.Types.ObjectId().toString() })));
    return docs;
  };
  Model.updateMany = async (query, update) => {
    write(`${key}.updateMany`);
    for (const doc of store[key].filter((d) => matches(d, query))) Object.assign(doc, update.$set);
    return {};
  };
  Model.updateOne = async () => write(`${key}.updateOne`);
  Model.findOneAndUpdate = async () => null;
  Model.bulkWrite = async (ops) => {
    write(`${key}.bulkWrite`);
    for (const op of ops) {
      const doc = store[key].find((d) => d._id === String(op.updateOne.filter._id));
      for (const [path, value] of Object.entries(op.updateOne.update.$set)) {
        if (path.startsWith('value.')) doc.value = { ...doc.value, [path.slice(6)]: value };
      }
    }
    return {};
  };
  Model.deleteMany = async (query) => {
    write(`${key}.deleteMany`);
    store[key] = store[key].filter((d) => !matches(d, query));
    return {};
  };
  Model.deleteOne = async (query) => {
    write(`${key}.deleteOne`);
    store[key] = store[key].filter((d) => !matches(d, query));
    return {};
  };
};

User.findOne = async (query) => Object.values(users).find((u) => u._id === query._id) || null;
mockCollection(Action, 'actions');
mockCollection(IndicatorValue, 'values');
mockCollection(Collectivity, 'collectivities');
mockCollection(EconomicActor, 'actors');
mockCollection(Log, 'logs');
Indicator.findById = async () => ({ _id: 'ind-1', name: 'Indicateur 1', excel_indicator_id: 'X1', value_unit: '' });
// Seul l'import recherche les indicateurs par identifiant Excel ; les autres recherches ne renvoient rien
Indicator.find = (query = {}) => chain(query.excel_indicator_id ? [{ _id: 'ind-1', name: 'Indicateur 1', excel_indicator_id: 'X1', value_unit: '' }] : []);

let server;
let baseUrl;
let importFile;

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
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Remplissage - Sit. Init.');
  sheet.addRow(['', '', '', '', 'ID', 'Valeur']);
  sheet.addRow(['', '', '', '', 'X1', 42]);
  importFile = Buffer.from(await workbook.xlsx.writeBuffer()).toString('base64');

  const app = express();
  app.set('env', 'test');
  app.use(cookieParser());
  app.use(express.json({ limit: '5mb' }));
  require('../src/services/passport')(app);
  app.use('/action', require('../src/controllers/action'));
  app.use('/indicator_value', require('../src/controllers/indicator_value'));
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => server.close());

const value = (data) => makeDoc({ indicator_id: 'ind-1', indicator_type: 'number', situation: 'init', year: 2024, value: { number: 1 }, ...data });

beforeEach(() => {
  store = {
    actions: [
      makeDoc({ _id: PARENT, name: 'Fiche catalogue', type: 'global', excel_worksheetname: 'Fiche1' }),
      makeDoc({ _id: ACTION_COL, name: 'Action collectivité A', type: 'reference', owner: 'collectivity', collectivity_id: COL_A, action_parent_id: PARENT, year_init: 2024, exel_files_prev: [{ excel_file_id: 'file-col-prev', year_prev: 2030, year_ref: 2030 }], excel_files_expost: [{ excel_file_id: 'file-col-expost', year_expost: 2031, year_ref: 2031 }] }),
      makeDoc({ _id: ACTION_AE, name: 'Action acteur 1', type: 'reference', owner: 'economic_actor', economic_actor_id: 'ea-1', economic_actor_name: 'Acteur 1', collectivity_id: COL_A, action_parent_id: PARENT, year_init: 2024, exel_files_prev: [{ excel_file_id: 'file-ae-prev', year_prev: 2030, year_ref: 2030 }], excel_files_expost: [{ excel_file_id: 'file-ae-expost', year_expost: 2031, year_ref: 2031 }] }),
      makeDoc({ _id: CONFIG_AE, name: 'Données de base', type: 'config', owner: 'economic_actor', economic_actor_id: 'ea-1', collectivity_id: COL_A }),
      makeDoc({ _id: CONFIG_AE_B, name: 'Données de base', type: 'config', owner: 'economic_actor', economic_actor_id: 'ea-1', collectivity_id: COL_B }),
      makeDoc({ _id: ACTION_COL_B, name: 'Action collectivité B', type: 'reference', owner: 'collectivity', collectivity_id: COL_B, action_parent_id: PARENT, year_init: 2024, exel_files_prev: [{ excel_file_id: 'file-b-prev', year_prev: 2030, year_ref: 2030 }], excel_files_expost: [] }),
    ],
    values: [
      value({ _id: IV_COL, action_id: ACTION_COL, collectivity_id: COL_A, owner: 'collectivity' }),
      value({ _id: IV_AE, action_id: ACTION_AE, collectivity_id: COL_A, owner: 'economic_actor', economic_actor_id: 'ea-1' }),
      value({ _id: IV_CONFIG_AE, action_id: CONFIG_AE, collectivity_id: COL_A, owner: 'economic_actor', economic_actor_id: 'ea-1' }),
      value({ _id: IV_COL_B, action_id: ACTION_COL_B, collectivity_id: COL_B, owner: 'collectivity' }),
      value({ _id: IV_CONFIG_AE_B, action_id: CONFIG_AE_B, collectivity_id: COL_B, owner: 'economic_actor', economic_actor_id: 'ea-1' }),
    ],
    collectivities: [makeDoc({ _id: COL_A, name: 'Collectivité A', sharepoint_folder_id: 'folder-a' }), makeDoc({ _id: COL_B, name: 'Collectivité B', sharepoint_folder_id: 'folder-b' })],
    actors: [makeDoc({ _id: 'ea-1', name: 'Acteur 1', collectivities: [{ id: COL_A, name: 'Collectivité A' }, { id: COL_B, name: 'Collectivité B' }] })],
    logs: [],
    writes: [],
    errors: [],
  };
  // Les acteurs économiques ont un identifiant libre dans ce jeu de données
  EconomicActor.findById = async (id) => store.actors.find((a) => a._id === id) || null;
});

const snapshot = () => JSON.stringify({ actions: store.actions, values: store.values, logs: store.logs });

// Appel refusé : code attendu et aucune écriture (base, journal, SharePoint, file de synchro)
const assertRefused = async (method, path, who, body, status = 403) => {
  const stateBefore = snapshot();
  const res = await call(method, path, who, body);
  assert.equal(res.status, status);
  if (status === 403) assert.equal(res.body.code, 'Accès refusé');
  assert.deepEqual(store.writes, []);
  assert.equal(snapshot(), stateBefore);
  assert.deepEqual(store.errors, []);
};

const assertAllowed = async (method, path, who, body) => {
  const res = await call(method, path, who, body);
  assert.deepEqual(store.errors, []);
  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
  return res;
};

const STRANGERS = ['adminB', 'pendingA', 'noCollectivity', 'aeOther', 'aePending'];
const COLLECTIVITY_WRITERS = ['admin', 'memberA', 'adminA'];
const ACTOR_WRITERS = ['admin', 'aeOwner', 'aeInvited', 'memberA', 'adminA'];

// ---------- Création d'une action ----------
const newAction = (extra = {}) => ({ name: 'Nouvelle action', action_parent_id: PARENT, collectivity_id: COL_A, collectivity_name: 'Collectivité A', year_init: 2024, year_prev: 2030, type: 'reference', ...extra });
const createdActions = () => store.actions.filter((a) => a.name === 'Nouvelle action');

describe('POST /action — création', () => {
  for (const who of ['admin', 'adminA']) {
    test(`autorisée pour ${who}, au nom de la collectivité`, async () => {
      await assertAllowed('POST', '/action', who, newAction());
      assert.equal(createdActions().length, 1);
      assert.equal(createdActions()[0].collectivity_id, COL_A);
      assert.equal(createdActions()[0].economic_actor_id, undefined);
    });
  }

  for (const who of ['aeOwner', 'aeInvited']) {
    test(`autorisée pour ${who}, toujours au nom de sa propre organisation`, async () => {
      await assertAllowed('POST', '/action', who, newAction({ owner: 'economic_actor', economic_actor_id: 'ea-2', economic_actor_name: 'Acteur 2' }));
      assert.equal(createdActions().length, 1);
      assert.equal(createdActions()[0].owner, 'economic_actor');
      assert.equal(createdActions()[0].economic_actor_id, 'ea-1');
    });
  }

  for (const who of ['memberA', 'adminB', 'pendingA', 'noCollectivity', 'aePending']) {
    test(`refusée pour ${who}, rien n'est créé`, async () => {
      await assertRefused('POST', '/action', who, newAction());
    });
  }

  test("refusée pour un acteur économique dans une collectivité à laquelle il n'est pas rattaché", async () => {
    await assertRefused('POST', '/action', 'aeOwner', newAction({ collectivity_id: COL_B }));
  });

  test('refusée sans authentification', async () => {
    await assertRefused('POST', '/action', null, newAction(), 401);
  });

  test('404 pour une collectivité inconnue ou mal formée (admin plateforme)', async () => {
    await assertRefused('POST', '/action', 'admin', newAction({ collectivity_id: UNKNOWN }), 404);
    await assertRefused('POST', '/action', 'admin', newAction({ collectivity_id: 'pas-un-id' }), 404);
    await assertRefused('POST', '/action', 'admin', newAction({ collectivity_id: { $ne: null } }), 404);
  });
});

// ---------- Années prévisionnelles et ex-post ----------
const YEAR_ROUTES = [
  { path: '/action/add_year_previsionnel', body: { year_prev: 2035 }, check: (action) => assert.ok(action.exel_files_prev.some((f) => f.year_prev === 2035)) },
  { path: '/action/add_year_expost', body: { year_expost: 2036 }, check: (action) => assert.ok(action.excel_files_expost.some((f) => f.year_expost === 2036)) },
  { path: '/action/remove_year_previsionnel', body: { year_prev: 2030 }, check: (action) => assert.equal(action.exel_files_prev.length, 0) },
  { path: '/action/remove_year_expost', body: { year_expost: 2031 }, check: (action) => assert.equal(action.excel_files_expost.length, 0) },
];

for (const route of YEAR_ROUTES) {
  describe(`POST ${route.path}`, () => {
    for (const who of COLLECTIVITY_WRITERS) {
      test(`action d'une collectivité : autorisé pour ${who}`, async () => {
        await assertAllowed('POST', route.path, who, { action_id: ACTION_COL, ...route.body });
        route.check(store.actions.find((a) => a._id === ACTION_COL));
      });
    }

    for (const who of [...STRANGERS, 'aeOwner']) {
      test(`action d'une collectivité : refusé pour ${who}, rien n'est écrit`, async () => {
        await assertRefused('POST', route.path, who, { action_id: ACTION_COL, ...route.body });
      });
    }

    for (const who of ACTOR_WRITERS) {
      test(`action d'un acteur économique : autorisé pour ${who}`, async () => {
        await assertAllowed('POST', route.path, who, { action_id: ACTION_AE, ...route.body });
        route.check(store.actions.find((a) => a._id === ACTION_AE));
      });
    }

    for (const who of STRANGERS) {
      test(`action d'un acteur économique : refusé pour ${who}, rien n'est écrit`, async () => {
        await assertRefused('POST', route.path, who, { action_id: ACTION_AE, ...route.body });
      });
    }

    test('401 sans authentification, 404 pour une action inconnue ou un identifiant mal formé', async () => {
      await assertRefused('POST', route.path, null, { action_id: ACTION_COL, ...route.body }, 401);
      await assertRefused('POST', route.path, 'admin', { action_id: UNKNOWN, ...route.body }, 404);
      await assertRefused('POST', route.path, 'admin', { action_id: 'pas-un-id', ...route.body }, 404);
      await assertRefused('POST', route.path, 'memberA', { action_id: { $ne: null }, ...route.body }, 404);
      await assertRefused('POST', route.path, 'memberA', { action_id: 123, ...route.body }, 404);
    });
  });
}

// ---------- Modification d'une valeur ----------
const storedValue = (id) => store.values.find((v) => v._id === id);

describe('PUT /indicator_value/:id', () => {
  for (const who of COLLECTIVITY_WRITERS) {
    test(`valeur d'une action de collectivité : autorisé pour ${who}`, async () => {
      await assertAllowed('PUT', `/indicator_value/${IV_COL}`, who, { source: 'manual', value: { number: 7 } });
      assert.equal(storedValue(IV_COL).value.number, 7);
      assert.ok(store.writes.includes('sync.enqueueCellUpdate'));
    });
  }

  for (const who of [...STRANGERS, 'aeOwner']) {
    test(`valeur d'une action de collectivité : refusé pour ${who}, rien n'est écrit`, async () => {
      await assertRefused('PUT', `/indicator_value/${IV_COL}`, who, { source: 'manual', value: { number: 7 } });
    });
  }

  for (const id of [IV_AE, IV_CONFIG_AE]) {
    for (const who of ACTOR_WRITERS) {
      test(`valeur d'un acteur économique (${id === IV_AE ? 'action' : 'données générales'}) : autorisé pour ${who}`, async () => {
        await assertAllowed('PUT', `/indicator_value/${id}`, who, { source: 'manual', value: { number: 7 } });
        assert.equal(storedValue(id).value.number, 7);
      });
    }

    for (const who of STRANGERS) {
      test(`valeur d'un acteur économique (${id === IV_AE ? 'action' : 'données générales'}) : refusé pour ${who}, rien n'est écrit`, async () => {
        await assertRefused('PUT', `/indicator_value/${id}`, who, { source: 'manual', value: { number: 7 } });
      });
    }
  }

  test("le rattachement d'une valeur ne change pas, les valeurs d'une autre collectivité ne sont pas touchées", async () => {
    await assertAllowed('PUT', `/indicator_value/${IV_COL}`, 'memberA', { source: 'manual', value: { number: 7 }, action_id: ACTION_COL_B, collectivity_id: COL_B, owner: 'economic_actor', economic_actor_id: 'ea-2' });
    assert.equal(storedValue(IV_COL).action_id, ACTION_COL);
    assert.equal(storedValue(IV_COL).collectivity_id, COL_A);
    assert.equal(storedValue(IV_COL).owner, 'collectivity');
    assert.equal(storedValue(IV_COL).economic_actor_id, undefined);
    assert.equal(storedValue(IV_COL_B).value.number, 1);
  });

  test("l'indicateur, la situation et l'année d'une valeur ne changent pas", async () => {
    await assertAllowed('PUT', `/indicator_value/${IV_COL}`, 'memberA', { source: 'manual', value: { number: 7 }, indicator_id: 'ind-2', situation: 'prev', year: 2099 });
    assert.equal(storedValue(IV_COL).indicator_id, 'ind-1');
    assert.equal(storedValue(IV_COL).situation, 'init');
    assert.equal(storedValue(IV_COL).year, 2024);
  });

  for (const who of ['admin', 'aeOwner', 'aeInvited']) {
    test(`données générales d'un acteur économique : la saisie de ${who} vaut pour toutes ses collectivités`, async () => {
      await assertAllowed('PUT', `/indicator_value/${IV_CONFIG_AE}`, who, { source: 'manual', value: { number: 7 } });
      assert.equal(storedValue(IV_CONFIG_AE_B).value.number, 7);
    });
  }

  for (const who of ['memberA', 'adminA']) {
    test(`données générales d'un acteur économique : la saisie de ${who} ne sort pas de sa collectivité`, async () => {
      await assertAllowed('PUT', `/indicator_value/${IV_CONFIG_AE}`, who, { source: 'manual', value: { number: 7 } });
      assert.equal(storedValue(IV_CONFIG_AE).value.number, 7);
      assert.equal(storedValue(IV_CONFIG_AE_B).value.number, 1);
    });
  }

  test('401 sans authentification, 404 pour une valeur inconnue ou un identifiant mal formé', async () => {
    await assertRefused('PUT', `/indicator_value/${IV_COL}`, null, { value: { number: 7 } }, 401);
    await assertRefused('PUT', `/indicator_value/${UNKNOWN}`, 'admin', { value: { number: 7 } }, 404);
    await assertRefused('PUT', '/indicator_value/pas-un-id', 'memberA', { value: { number: 7 } }, 404);
  });
});

// ---------- Création d'une valeur ----------
describe('POST /indicator_value', () => {
  for (const who of COLLECTIVITY_WRITERS) {
    test(`autorisé pour ${who} sur une action de sa collectivité`, async () => {
      await assertAllowed('POST', '/indicator_value', who, { action_id: ACTION_COL, collectivity_id: COL_A, name: 'Nouvelle valeur' });
      assert.equal(store.values.filter((v) => v.name === 'Nouvelle valeur').length, 1);
    });
  }

  for (const who of [...STRANGERS, 'aeOwner']) {
    test(`refusé pour ${who}, rien n'est créé`, async () => {
      await assertRefused('POST', '/indicator_value', who, { action_id: ACTION_COL, collectivity_id: COL_A, name: 'Nouvelle valeur' });
    });
  }

  test("l'acteur économique crée une valeur sur sa propre action, pas un autre acteur", async () => {
    await assertRefused('POST', '/indicator_value', 'aeOther', { action_id: ACTION_AE, name: 'Nouvelle valeur' });
    await assertAllowed('POST', '/indicator_value', 'aeOwner', { action_id: ACTION_AE, name: 'Nouvelle valeur' });
  });

  test("la valeur créée est rattachée à la collectivité et au propriétaire de l'action", async () => {
    await assertAllowed('POST', '/indicator_value', 'memberA', { action_id: ACTION_COL, collectivity_id: COL_B, owner: 'economic_actor', economic_actor_id: 'ea-2', name: 'Nouvelle valeur' });
    const created = store.values.find((v) => v.name === 'Nouvelle valeur');
    assert.equal(created.action_id, ACTION_COL);
    assert.equal(created.collectivity_id, COL_A);
    assert.equal(created.owner, 'collectivity');
    assert.equal(created.economic_actor_id, undefined);
  });

  test('401 sans authentification, 400 sans action valide, 404 pour une action inconnue', async () => {
    await assertRefused('POST', '/indicator_value', null, { action_id: ACTION_COL }, 401);
    await assertRefused('POST', '/indicator_value', 'memberA', { name: 'Nouvelle valeur' }, 400);
    await assertRefused('POST', '/indicator_value', 'memberA', { action_id: 'pas-un-id' }, 400);
    await assertRefused('POST', '/indicator_value', 'memberA', { action_id: 123 }, 400);
    await assertRefused('POST', '/indicator_value', 'admin', { action_id: UNKNOWN }, 404);
  });
});

// ---------- Import de valeurs ----------
const importBody = (actionId, collectivityId = COL_A) => ({ fileBase64: importFile, collectivity: { _id: collectivityId }, action_id: actionId });

describe('POST /indicator_value/importIndicatorValues', () => {
  for (const who of COLLECTIVITY_WRITERS) {
    test(`action d'une collectivité : autorisé pour ${who}`, async () => {
      await assertAllowed('POST', '/indicator_value/importIndicatorValues', who, importBody(ACTION_COL));
      assert.equal(storedValue(IV_COL).value.number, 42);
      assert.ok(store.writes.includes('graph.importSheetsToExcelFile'));
    });
  }

  for (const who of [...STRANGERS, 'aeOwner']) {
    test(`action d'une collectivité : refusé pour ${who}, rien n'est écrit`, async () => {
      await assertRefused('POST', '/indicator_value/importIndicatorValues', who, importBody(ACTION_COL));
    });
  }

  for (const who of ['aeOwner', 'aeInvited']) {
    test(`action d'un acteur économique : autorisé pour ${who}, seules ses valeurs changent`, async () => {
      await assertAllowed('POST', '/indicator_value/importIndicatorValues', who, importBody(ACTION_AE));
      assert.equal(storedValue(IV_AE).value.number, 42);
      assert.equal(storedValue(IV_COL).value.number, 1);
      assert.equal(storedValue(IV_COL_B).value.number, 1);
    });
  }

  for (const who of STRANGERS) {
    test(`action d'un acteur économique : refusé pour ${who}, rien n'est écrit`, async () => {
      await assertRefused('POST', '/indicator_value/importIndicatorValues', who, importBody(ACTION_AE));
    });
  }

  test("données générales d'un acteur économique : l'import d'un membre de collectivité ne sort pas de sa collectivité", async () => {
    await assertAllowed('POST', '/indicator_value/importIndicatorValues', 'memberA', importBody(CONFIG_AE));
    assert.equal(storedValue(IV_CONFIG_AE).value.number, 42);
    assert.equal(storedValue(IV_CONFIG_AE_B).value.number, 1);
    assert.equal(storedValue(IV_COL).value.number, 1);
  });

  test("données générales d'un acteur économique : son propre import vaut pour toutes ses collectivités", async () => {
    await assertAllowed('POST', '/indicator_value/importIndicatorValues', 'aeOwner', importBody(CONFIG_AE));
    assert.equal(storedValue(IV_CONFIG_AE_B).value.number, 42);
    assert.equal(storedValue(IV_COL_B).value.number, 1);
  });

  test("refusé si la collectivité transmise n'est pas celle de l'action", async () => {
    await assertRefused('POST', '/indicator_value/importIndicatorValues', 'memberA', importBody(ACTION_COL, COL_B));
  });

  test('401 sans authentification, 404 pour une action inconnue ou un identifiant mal formé', async () => {
    await assertRefused('POST', '/indicator_value/importIndicatorValues', null, importBody(ACTION_COL), 401);
    await assertRefused('POST', '/indicator_value/importIndicatorValues', 'admin', importBody(UNKNOWN), 404);
    await assertRefused('POST', '/indicator_value/importIndicatorValues', 'admin', importBody('pas-un-id'), 404);
    await assertRefused('POST', '/indicator_value/importIndicatorValues', 'memberA', importBody(123), 404);
  });
});
