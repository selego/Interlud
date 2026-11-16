/* eslint-env node */
// SEC-07 : l'API ne doit jamais renvoyer le détail technique d'une erreur (message, objet error) au client.
// Lancer : npm test (aucune connexion MongoDB ni Microsoft Graph nécessaire, tout est simulé en mémoire).
process.env.SECRET = 'test-secret';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');

const ERROR_CODES = require('../src/utils/errorCodes');
const User = require('../src/models/user');
const Action = require('../src/models/action');
const microsoftGraph = require('../src/services/microsoftGraph');
const sentry = require('../src/services/sentry');

const SECRET_DETAIL = 'mongodb://interne:27017 détail technique secret';
const technicalError = () => {
  // Imite une erreur Mongoose : message + propriétés énumérables (sérialisées par JSON.stringify)
  const error = new Error(SECRET_DETAIL);
  error.stringValue = `"${SECRET_DETAIL}"`;
  error.path = '_id';
  return error;
};

const admin = { _id: 'u-admin', name: 'Admin', role: 'admin', collectivities: [] };

// ---------- Simulations ----------
User.findOne = async (query) => {
  if (query._id === 'boom') throw technicalError();
  return query._id === admin._id ? admin : null;
};
Action.findById = async () => {
  throw technicalError();
};
// excel.js déstructure le service au chargement : on le simule avant de charger le contrôleur
microsoftGraph.exportExcelFile = async () => {
  throw technicalError();
};
const captured = [];
sentry.capture = (error) => captured.push(error);

let server;
let baseUrl;

const call = async (method, path, body) => {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `JWT ${jwt.sign({ _id: admin._id }, process.env.SECRET)}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  return { status: response.status, text, body: JSON.parse(text) };
};

before(async () => {
  const app = express();
  app.set('env', 'test');
  app.use(cookieParser());
  app.use(express.json());
  require('../src/services/passport')(app);
  app.use('/user', require('../src/controllers/user'));
  app.use('/excel', require('../src/controllers/excel'));
  app.use('/indicator_value', require('../src/controllers/indicator_value'));
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => server.close());

describe("Les erreurs serveur ne divulguent pas d'informations techniques", () => {
  for (const [method, path, body] of [
    ['GET', '/user/boom'],
    ['POST', '/excel/export', { fileId: 'file-1' }],
    ['POST', '/indicator_value/importIndicatorValues', { fileBase64: 'eA==', collectivity: { _id: 'col-a' }, action_id: 'act-a' }],
  ]) {
    test(`${method} ${path} renvoie un code générique`, async () => {
      const before = captured.length;
      const res = await call(method, path, body);
      assert.equal(res.status, 500);
      assert.deepEqual(res.body, { ok: false, code: ERROR_CODES.SERVER_ERROR });
      assert.ok(!res.text.includes('détail technique'), `fuite dans la réponse : ${res.text}`);
      assert.equal(captured.length, before + 1, "l'erreur doit rester remontée à Sentry");
    });
  }
});
