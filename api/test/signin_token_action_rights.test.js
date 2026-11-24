/* eslint-env node */
// Session rétablie (GET /user/signin_token) : les droits par action de l'utilisateur sont renvoyés,
// comme à la connexion, et seulement les siens.
// Lancer : npm test (aucune connexion MongoDB nécessaire, les modèles sont simulés en mémoire).
process.env.SECRET = 'test-secret';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');

const User = require('../src/models/user');
const UserActionRight = require('../src/models/user_action_right');

// ---------- Données simulées ----------
const user = {
  _id: 'u-1',
  email: 'membre@exemple.fr',
  role: 'user',
  collectivities: [],
  set() {},
  save: async () => {},
  toJSON() {
    return { _id: this._id, email: this.email, role: this.role };
  },
};

const rights = [
  { _id: 'r-1', user_id: 'u-1', action_id: 'a-1', right: 'read' },
  { _id: 'r-2', user_id: 'u-2', action_id: 'a-1', right: 'write' },
  { _id: 'r-3', user_id: 'u-1', action_id: 'a-2', right: 'write' },
];

User.findOne = async (query) => (query._id === user._id ? user : null);
UserActionRight.find = async (query) => rights.filter((r) => r.user_id === query.user_id);

// ---------- Serveur de test ----------
let server;
let baseUrl;

before(async () => {
  const app = express();
  app.use(cookieParser());
  app.use(express.json());
  require('../src/services/passport')(app);
  app.use('/user', require('../src/controllers/user'));
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => server.close());

describe('Session rétablie : droits par action', () => {
  test("signin_token renvoie les droits par action de l'utilisateur connecté, et seulement les siens", async () => {
    const response = await fetch(`${baseUrl}/user/signin_token`, {
      headers: { Authorization: `JWT ${jwt.sign({ _id: user._id }, process.env.SECRET)}` },
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.ok, true);
    assert.deepEqual(body.userActionRights.map((r) => r._id), ['r-1', 'r-3']);
  });
});
