/* eslint-env node */
// Historique des valeurs : version du master Excel, ancienne valeur conservée quand un champ est vidé,
// source « valeur par défaut ».
// Lancer : npm test (aucune connexion MongoDB ni Microsoft Graph nécessaire : le stockage est simulé en mémoire,
// mais les logs et les valeurs passent par les vrais schémas Mongoose).
process.env.SECRET = 'test-secret';

const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const ExcelJS = require('exceljs');

const User = require('../src/models/user');
const Action = require('../src/models/action');
const Indicator = require('../src/models/indicator');
const IndicatorValue = require('../src/models/indicator_value');
const Log = require('../src/models/log');
const Collectivity = require('../src/models/collectivity');
const microsoftGraph = require('../src/services/microsoftGraph');
const excelSync = require('../src/services/excelSync');
const completion = require('../src/utils/completion');
const sentry = require('../src/services/sentry');

let store;

// SharePoint et synchro Excel simulés (avant le chargement du contrôleur, qui les déstructure)
microsoftGraph.updateExcelCellByIndicatorId = async () => {};
microsoftGraph.importSheetsToExcelFile = async () => {};
excelSync.enqueueCellUpdate = () => {};
excelSync.enqueueAggregation = () => {};
completion.computeActionCompletion = async () => {};
sentry.capture = (error) => store.errors.push(error);

const COL = 'c0000000000000000000000a';
const ACTION = 'a00000000000000000000001';
const IV_NUMBER = 'f00000000000000000000001';
const IV_NUMBER_TWIN = 'f00000000000000000000002';
const IV_TEXT = 'f00000000000000000000003';
const admin = { _id: 'u-admin', name: 'Admin', email: 'admin@test.fr', role: 'admin', collectivities: [] };

const chain = (rows) => ({ then: (resolve, reject) => Promise.resolve(rows).then(resolve, reject) });
const same = (doc, query, keys) => keys.every((key) => !(key in query) || String(doc[key]) === String(query[key]));

User.findOne = async () => admin;
Action.findById = async () => store.action;
Action.find = () => chain([]);
Collectivity.findById = async () => ({ _id: COL, name: 'Collectivité A' });
Indicator.findById = async (id) => ({ _id: id, name: `Indicateur ${id}`, excel_indicator_id: 'X1', value_unit: '' });
Indicator.find = () => chain([{ _id: 'ind-number', name: 'Indicateur ind-number', excel_indicator_id: 'X1', value_unit: '' }]);
IndicatorValue.findById = async (id) => store.values.find((v) => String(v._id) === String(id)) || null;
IndicatorValue.find = (query = {}) =>
  chain(
    store.values.filter((v) => {
      if (query._id?.$ne && String(v._id) === String(query._id.$ne)) return false;
      if (query.indicator_id?.$in && !query.indicator_id.$in.includes(v.indicator_id)) return false;
      return same(v, query, ['situation', 'year', 'action_id'].filter((key) => typeof query[key] !== 'object')) && (typeof query.indicator_id !== 'string' || v.indicator_id === query.indicator_id);
    }),
  );
IndicatorValue.updateMany = async () => ({});
IndicatorValue.bulkWrite = async () => ({});
// Les logs passent par le vrai schéma : une clé absente du schéma est perdue, une source hors enum est refusée
Log.insertMany = async (docs) => {
  for (const data of docs) {
    const doc = new Log(data);
    const error = doc.validateSync();
    if (error) throw error;
    store.logs.push(doc.toObject());
  }
};

// Vraie valeur Mongoose (schéma réel), seule l'écriture en base est neutralisée
const value = (data) => {
  const doc = new IndicatorValue({ action_id: ACTION, collectivity_id: COL, owner: 'collectivity', situation: 'init', year: 2024, ...data });
  doc.save = async () => doc;
  return doc;
};

let server;
let baseUrl;

const call = async (method, path, body) => {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `JWT ${jwt.sign({ _id: admin._id }, process.env.SECRET)}` },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
};

const valueLogs = (id) => store.logs.filter((log) => log.field === 'value' && String(log.indicator_value_id) === id);

before(async () => {
  const app = express();
  app.set('env', 'test');
  app.use(cookieParser());
  app.use(express.json({ limit: '5mb' }));
  require('../src/services/passport')(app);
  app.use('/indicator_value', require('../src/controllers/indicator_value'));
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => server.close());

beforeEach(() => {
  const action = { _id: ACTION, name: 'Action A', type: 'reference', owner: 'collectivity', collectivity_id: COL, exel_files_prev: [], excel_files_expost: [], save: async () => action };
  store = {
    action,
    values: [
      value({ _id: IV_NUMBER, indicator_id: 'ind-number', indicator_type: 'number', value: { number: 12 } }),
      value({ _id: IV_NUMBER_TWIN, indicator_id: 'ind-number', indicator_type: 'number', value: { number: 12 } }),
      value({ _id: IV_TEXT, indicator_id: 'ind-text', indicator_type: 'text', value: { text: 'Ancien texte' } }),
    ],
    logs: [],
    errors: [],
  };
});

describe('Version du master dans les logs de valeur', () => {
  test('saisie : le log porte la version du master, sa propagation aussi', async () => {
    const res = await call('PUT', `/indicator_value/${IV_NUMBER}`, { source: 'manual', value: { number: 30 } });
    assert.equal(res.status, 200);
    assert.deepEqual(store.errors, []);

    const [log] = valueLogs(IV_NUMBER);
    assert.equal(log.master_version, microsoftGraph.masterExcelVersion);
    assert.equal(log.source, 'manual');
    assert.equal(log.previous_value.number, 12);
    assert.equal(log.new_value.number, 30);

    const [syncLog] = valueLogs(IV_NUMBER_TWIN);
    assert.equal(syncLog.source, 'synchronization');
    assert.equal(syncLog.master_version, microsoftGraph.masterExcelVersion);
  });

  test('import Excel : le log porte la version du master et garde la valeur écrasée par une cellule illisible', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Remplissage - Sit. Init.');
    sheet.addRow(['', '', '', '', 'ID', 'Valeur']);
    sheet.addRow(['', '', '', '', 'X1', 'n/a']);
    const fileBase64 = Buffer.from(await workbook.xlsx.writeBuffer()).toString('base64');

    const res = await call('POST', '/indicator_value/importIndicatorValues', { fileBase64, collectivity: { _id: COL }, action_id: ACTION });
    assert.equal(res.status, 200);
    assert.deepEqual(store.errors, []);

    const [log] = valueLogs(IV_NUMBER);
    assert.equal(log.source, 'import_excel');
    assert.equal(log.master_version, microsoftGraph.masterExcelVersion);
    assert.equal(log.type_value, 'number');
    assert.equal(log.previous_value.number, 12);
    assert.equal(log.new_value.number, null);
  });
});

describe("Champ vidé : l'ancienne valeur reste dans le log", () => {
  test('champ numérique', async () => {
    const res = await call('PUT', `/indicator_value/${IV_NUMBER}`, { source: 'manual', value: { number: null } });
    assert.equal(res.status, 200);
    assert.deepEqual(store.errors, []);

    const [log] = valueLogs(IV_NUMBER);
    assert.equal(log.type_value, 'number');
    assert.equal(log.previous_value.number, 12);
    assert.equal(log.new_value.number, null);

    // La propagation à la valeur jumelle garde elle aussi l'ancienne valeur
    const [syncLog] = valueLogs(IV_NUMBER_TWIN);
    assert.equal(syncLog.type_value, 'number');
    assert.equal(syncLog.previous_value.number, 12);
  });

  test('champ numérique : « Restaurer » (requête envoyée par l’écran Historique) remet la valeur', async () => {
    await call('PUT', `/indicator_value/${IV_NUMBER}`, { source: 'manual', value: { number: null } });
    const [log] = valueLogs(IV_NUMBER);

    const res = await call('PUT', `/indicator_value/${IV_NUMBER}`, { value: { [log.type_value]: log.previous_value?.[log.type_value] }, source: 'restore' });
    assert.equal(res.status, 200);
    assert.equal(store.values[0].value.number, 12);
  });

  test('champ texte', async () => {
    const res = await call('PUT', `/indicator_value/${IV_TEXT}`, { source: 'manual', value: { text: null } });
    assert.equal(res.status, 200);
    assert.deepEqual(store.errors, []);

    const [log] = valueLogs(IV_TEXT);
    assert.equal(log.type_value, 'string');
    assert.equal(log.previous_value.string, 'Ancien texte');
    assert.equal(log.new_value.string, null);
  });
});

describe('Source « valeur par défaut »', () => {
  test('« Appliquer cette valeur » : la source default_value est enregistrée dans le log et sur la valeur', async () => {
    const res = await call('PUT', `/indicator_value/${IV_NUMBER}`, { source: 'default_value', value: { number: 99 } });
    assert.equal(res.status, 200);
    assert.deepEqual(store.errors, []);

    const [log] = valueLogs(IV_NUMBER);
    assert.equal(log.source, 'default_value');
    assert.equal(log.new_value.number, 99);
    assert.equal(store.values[0].value_source, 'default_value');
    assert.equal(store.values[0].validateSync(), undefined);
  });
});
