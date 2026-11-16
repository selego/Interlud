/* eslint-env node */
// Tests de la durée de session (audit SEC-10) : JWT et cookie valables 7 jours.
// Lancer : npm test (aucune connexion MongoDB nécessaire, les modèles sont simulés en mémoire).
process.env.SECRET = 'test-secret';
process.env.ENVIRONMENT = 'production';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');

const User = require('../src/models/user');
const UserActionRight = require('../src/models/user_action_right');
const Collectivity = require('../src/models/collectivity');

const SEPT_JOURS = 7 * 24 * 60 * 60;

// ---------- Utilisateur simulé ----------
const user = {
  _id: 'u-1',
  email: 'membre@exemple.fr',
  role: 'user',
  collectivities: [],
  // Un compte avec mot de passe (sans hash, la connexion le traite comme un compte SSO)
  password: 'hash-simulé',
  comparePassword: async (p) => p === 'bon-mot-de-passe',
  set() {},
  save: async () => {},
  toJSON() {
    return { _id: this._id, email: this.email, role: this.role };
  },
};

User.findOne = async (query) => (query.email === user.email || query._id === user._id ? user : null);
UserActionRight.find = async () => [];
Collectivity.findById = async () => null;
Collectivity.findOne = async () => null;

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

const verifierSession = (response, token) => {
  const payload = jwt.verify(token, process.env.SECRET);
  assert.equal(payload.exp - payload.iat, SEPT_JOURS);

  const cookie = response.headers.get('set-cookie');
  assert.match(cookie, /^jwt=/);
  assert.match(cookie, new RegExp(`Max-Age=${SEPT_JOURS}(;|$)`));
  const expires = Date.parse(cookie.match(/Expires=([^;]+)/)[1]);
  assert.ok(Math.abs(expires - (Date.now() + SEPT_JOURS * 1000)) < 5000);
};

describe('Durée de session (SEC-10)', () => {
  test('signin : JWT et cookie expirent à 7 jours', async () => {
    const response = await fetch(`${baseUrl}/user/signin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: user.email, password: 'bon-mot-de-passe' }),
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    verifierSession(response, body.token);
  });

  test('signin_token : le jeton renouvelé expire aussi à 7 jours', async () => {
    const response = await fetch(`${baseUrl}/user/signin_token`, {
      headers: { Authorization: `JWT ${jwt.sign({ _id: user._id }, process.env.SECRET)}` },
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    verifierSession(response, body.token);
  });

  test('un jeton expiré est refusé (401)', async () => {
    const expired = jwt.sign({ _id: user._id, iat: Math.floor(Date.now() / 1000) - SEPT_JOURS - 10 }, process.env.SECRET, { expiresIn: '7d' });
    const response = await fetch(`${baseUrl}/user/signin_token`, { headers: { Authorization: `JWT ${expired}` } });
    assert.equal(response.status, 401);
  });
});
