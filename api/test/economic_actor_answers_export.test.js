/* eslint-env node */
// Tests de l'export Excel des réponses au questionnaire AE par l'admin plateforme (POST /economic_actor_answer/admin/export).
// Lancer : npm test (aucune connexion MongoDB nécessaire, les modèles sont simulés en mémoire).
process.env.SECRET = 'test-secret';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const ExcelJS = require('exceljs');

const User = require('../src/models/user');
const EconomicActor = require('../src/models/economic_actor');
const EconomicActorQuestion = require('../src/models/economic_actor_question');
const EconomicActorAnswer = require('../src/models/economic_actor_answer');

// ---------- Modèles simulés ----------
const users = {
  admin: { _id: 'u-admin', name: 'Admin', role: 'admin' },
  collectivity: { _id: 'u-col', name: 'Agent EPCI', role: 'user' },
  ae1: { _id: 'u-ae1', name: 'AE 1', role: 'economic_actor', economic_actor_id: 'ea-1', economic_actor_name: 'Transports Un' },
};

const questions = [
  { _id: 'q-text', label: 'Commentaire', type: 'text', active: true, required: false, order: 2 },
  { _id: 'q-num', label: 'Nombre de véhicules', type: 'number', value_unit: 'véhicules', active: true, required: true, order: 1 },
  { _id: 'q-radio', label: 'Type de flotte', type: 'radio', value_possibilities: ['Propre', 'Louée'], active: true, order: 3 },
  { _id: 'q-check', label: 'Énergies utilisées', type: 'checkbox', value_possibilities: ['Diesel', 'Électrique', 'GNV'], active: false, order: 4 },
];

const updatedAt = new Date('2026-11-10T10:00:00Z');
const answers = [
  { economic_actor_id: 'ea-1', question_id: 'q-num', value: { number: 12 }, updatedAt, last_modif_by_name: 'AE 1' },
  { economic_actor_id: 'ea-1', question_id: 'q-text', value: { text: '=1+1' }, updatedAt, last_modif_by_name: 'AE 1' },
  { economic_actor_id: 'ea-1', question_id: 'q-radio', value: { radio: 'Louée' }, updatedAt },
  { economic_actor_id: 'ea-1', question_id: 'q-check', value: { checkbox: ['Diesel', 'Électrique'] }, updatedAt },
  { economic_actor_id: 'ea-2', question_id: 'q-num', value: { number: 0 }, updatedAt },
  { economic_actor_id: 'ea-2', question_id: 'q-radio', value: { radio: '' }, updatedAt },
];

const actors = [
  { _id: 'ea-1', name: 'Transports Un', collectivities: [{ id: 'c-1', name: 'CA Nord' }, { id: 'c-2', name: 'CC Sud' }] },
  { _id: 'ea-2', name: 'Livraisons Deux', collectivities: [{ id: 'c-1', name: 'CA Nord' }] },
  { _id: 'ea-3', name: 'Ateliers Trois', collectivities: [] },
];

User.findOne = async (query) => Object.values(users).find((u) => u._id === query._id) || null;
EconomicActorAnswer.find = async () => answers;
EconomicActorQuestion.find = async () => questions;
EconomicActor.find = async () => actors;

// ---------- Serveur de test ----------
let server;
let baseUrl;

const call = async (who) => {
  const response = await fetch(`${baseUrl}/economic_actor_answer/admin/export`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(who ? { Authorization: `JWT ${jwt.sign({ _id: users[who]._id }, process.env.SECRET)}` } : {}) },
    body: '{}',
  });
  return { status: response.status, headers: response.headers, buffer: Buffer.from(await response.arrayBuffer()) };
};

const rowsOf = (sheet) => {
  const rows = [];
  sheet.eachRow((row) => rows.push(Array.from(row.values.slice(1))));
  return rows;
};

before(async () => {
  const app = express();
  app.set('env', 'test');
  app.use(cookieParser());
  app.use(express.json());
  require('../src/services/passport')(app);
  app.use('/economic_actor_answer', require('../src/controllers/economic_actor_answer'));
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => server.close());

test("un AE, un utilisateur de collectivité ou un visiteur sans token n'obtient pas le fichier", async () => {
  for (const who of ['ae1', 'collectivity', null]) {
    const res = await call(who);
    assert.ok([401, 403].includes(res.status), `${who} : ${res.status}`);
    assert.doesNotMatch(res.headers.get('content-type') || '', /spreadsheetml/);
  }
});

test("l'admin obtient un fichier .xlsx daté avec les trois onglets", async () => {
  const res = await call('admin');
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /spreadsheetml\.sheet/);
  assert.match(res.headers.get('content-disposition'), /reponses_questionnaire_\d{4}-\d{2}-\d{2}\.xlsx/);

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(res.buffer);
  assert.deepEqual(
    workbook.worksheets.map((sheet) => sheet.name),
    ['Réponses', 'Par organisation', 'Questions'],
  );
  for (const sheet of workbook.worksheets) assert.equal(sheet.views[0].state, 'frozen');

  // Format long : une ligne par réponse non vide, organisations triées, questions dans l'ordre paramétré
  const long = rowsOf(workbook.getWorksheet('Réponses'));
  assert.deepEqual(long[0], ['Organisation', 'Territoires', 'Question', 'Type de question', 'Unité', 'Obligatoire', 'Question active', 'Réponse', 'Date de la réponse', 'Auteur']);
  assert.deepEqual(
    long.slice(1).map((row) => row.slice(0, 8)),
    [
      ['Livraisons Deux', 'CA Nord', 'Nombre de véhicules', 'Nombre', 'véhicules', 'oui', 'oui', 0],
      ['Transports Un', 'CA Nord; CC Sud', 'Nombre de véhicules', 'Nombre', 'véhicules', 'oui', 'oui', 12],
      ['Transports Un', 'CA Nord; CC Sud', 'Commentaire', 'Texte libre', undefined, 'non', 'oui', "'=1+1"],
      ['Transports Un', 'CA Nord; CC Sud', 'Type de flotte', 'Choix unique', undefined, 'non', 'oui', 'Louée'],
      ['Transports Un', 'CA Nord; CC Sud', 'Énergies utilisées', 'Choix multiples', undefined, 'non', 'non', 'Diesel; Électrique'],
    ],
  );
  // Un nombre reste un nombre ; la date est une vraie date ; l'auteur est repris
  const longSheet = workbook.getWorksheet('Réponses');
  assert.equal(typeof longSheet.getCell('H3').value, 'number');
  assert.equal(longSheet.getCell('H3').type, ExcelJS.ValueType.Number);
  assert.equal(longSheet.getCell('I3').value.toISOString(), updatedAt.toISOString());
  assert.equal(longSheet.getCell('J3').value, 'AE 1');
  // Une réponse libre commençant par « = » est un texte, jamais une formule
  assert.equal(longSheet.getCell('H4').type, ExcelJS.ValueType.String);

  // Format large : toutes les organisations, y compris sans réponse ; une colonne par question
  const wide = rowsOf(workbook.getWorksheet('Par organisation'));
  assert.deepEqual(wide[0], ['Organisation', 'Territoires', 'Nombre de véhicules (véhicules)', 'Commentaire', 'Type de flotte', 'Énergies utilisées [désactivée]']);
  assert.deepEqual(wide.slice(1), [
    ['Ateliers Trois'],
    ['Livraisons Deux', 'CA Nord', 0],
    ['Transports Un', 'CA Nord; CC Sud', 12, "'=1+1", 'Louée', 'Diesel; Électrique'],
  ]);

  const list = rowsOf(workbook.getWorksheet('Questions'));
  assert.deepEqual(list, [
    ['Ordre', 'Question', 'Type de question', 'Options', 'Unité', 'Obligatoire', 'Active'],
    [1, 'Nombre de véhicules', 'Nombre', undefined, 'véhicules', 'oui', 'oui'],
    [2, 'Commentaire', 'Texte libre', undefined, undefined, 'non', 'oui'],
    [3, 'Type de flotte', 'Choix unique', 'Propre; Louée', undefined, 'non', 'oui'],
    [4, 'Énergies utilisées', 'Choix multiples', 'Diesel; Électrique; GNV', undefined, 'non', 'non'],
  ]);
});
