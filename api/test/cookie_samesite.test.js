/* eslint-env node */
// SEC-11 : le cookie de session `jwt` doit être posé en SameSite=Lax (et non None) hors développement.
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

// ---------- Utilisateur simulé ----------
const user = {
  _id: 'u-1',
  email: 'membre@test.local',
  role: 'user',
  collectivities: [],
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

const jwtCookie = (response) => response.headers.getSetCookie().find((c) => c.startsWith('jwt='));

describe('SEC-11 : cookie jwt en SameSite=Lax', () => {
  test('connexion : Set-Cookie jwt avec SameSite=Lax, Secure et HttpOnly', async () => {
    const response = await fetch(`${baseUrl}/user/signin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: user.email, password: 'bon-mot-de-passe' }),
    });
    assert.equal(response.status, 200);
    const cookie = jwtCookie(response);
    assert.ok(cookie, 'cookie jwt absent');
    assert.match(cookie, /;\s*SameSite=Lax/i);
    assert.doesNotMatch(cookie, /SameSite=None/i);
    assert.match(cookie, /;\s*Secure/i);
    assert.match(cookie, /;\s*HttpOnly/i);
  });

  test('le cookie seul suffit à authentifier un appel (rechargement de page)', async () => {
    const token = jwt.sign({ _id: user._id }, process.env.SECRET);
    const response = await fetch(`${baseUrl}/user/signin_token`, { headers: { Cookie: `jwt=${token}`, Authorization: 'JWT ' } });
    assert.equal(response.status, 200);
    assert.match(jwtCookie(response), /;\s*SameSite=Lax/i);
  });

  test('déconnexion : le cookie est effacé avec les mêmes attributs', async () => {
    const response = await fetch(`${baseUrl}/user/logout`, { method: 'POST' });
    assert.equal(response.status, 200);
    const cookie = jwtCookie(response);
    assert.match(cookie, /;\s*SameSite=Lax/i);
    // Le cookie doit être réellement expiré, pas reposé vide pour un an.
    assert.match(cookie, /Expires=Thu, 01 Jan 1970 00:00:00 GMT/);
    assert.doesNotMatch(cookie, /Max-Age=[1-9]/);
  });
});
