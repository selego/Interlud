/* eslint-env node */
// Les CGU acceptées dans le formulaire d'inscription (ou d'invitation) doivent être enregistrées
// à la création du compte, sinon la modale CGU réapparaît juste après.
// Lancer : npm test (aucune connexion MongoDB nécessaire, les modèles sont simulés en mémoire).
process.env.SECRET = 'test-secret';
process.env.ENVIRONMENT = 'production';

const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const cookieParser = require('cookie-parser');

const User = require('../src/models/user');
const UserActionRight = require('../src/models/user_action_right');
const Collectivity = require('../src/models/collectivity');
const EconomicActor = require('../src/models/economic_actor');

const PASSWORD = 'MotDePasse-Correct-123!';

// ---------- Modèles simulés ----------
let created;
let invited;

const makeInvitedUser = () => {
  const doc = {
    _id: 'u-invite',
    email: 'invite@exemple.fr',
    role: 'user',
    invitation_token: 'jeton-valide',
    invitation_token_expires: new Date(Date.now() + 3600 * 1000),
    collectivities: [],
    set(values) {
      Object.assign(this, values);
    },
    save: async () => doc,
  };
  return doc;
};

User.findOne = async (query) => {
  if (query.invitation_token) return invited && invited.email === query.email && invited.invitation_token === query.invitation_token ? invited : null;
  return null;
};
User.create = async (payload) => {
  created = { _id: 'u-nouveau', ...payload };
  return created;
};
UserActionRight.find = async () => [];
Collectivity.findById = async () => null;
Collectivity.findOne = async () => null;
EconomicActor.findById = async () => null;
EconomicActor.create = async (payload) => ({ _id: 'ea-1', ...payload });

// ---------- Serveur de test ----------
let server;
let baseUrl;

const post = async (path, body) => {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
};

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

beforeEach(() => {
  created = null;
  invited = makeInvitedUser();
});

describe('POST /user/signup', () => {
  test("enregistre l'acceptation des CGU quand la case est cochée", async () => {
    const before = Date.now();
    const res = await post('/user/signup', { email: 'nouveau@exemple.fr', password: PASSWORD, name: 'Nouvel Utilisateur', role: 'user', rgpd_accepted: true });
    assert.equal(res.status, 200);
    assert.ok(created.rgpd_accepted_at instanceof Date);
    assert.ok(created.rgpd_accepted_at.getTime() >= before);
    assert.ok(res.body.user.rgpd_accepted_at, 'le front doit recevoir la date pour ne pas afficher la modale');
  });

  test("n'enregistre rien sans acceptation explicite", async () => {
    const res = await post('/user/signup', { email: 'nouveau@exemple.fr', password: PASSWORD, name: 'Nouvel Utilisateur', role: 'user' });
    assert.equal(res.status, 200);
    assert.equal(created.rgpd_accepted_at, undefined);
  });

  test('une valeur non booléenne ne vaut pas acceptation', async () => {
    await post('/user/signup', { email: 'nouveau@exemple.fr', password: PASSWORD, name: 'Nouvel Utilisateur', role: 'user', rgpd_accepted: '2000-01-01' });
    assert.equal(created.rgpd_accepted_at, undefined);
  });
});

describe('POST /user/invite-accepted', () => {
  test("enregistre l'acceptation des CGU quand la case est cochée", async () => {
    const before = Date.now();
    const res = await post('/user/invite-accepted', { email: 'invite@exemple.fr', password: PASSWORD, name: 'Invité', invitation_token: 'jeton-valide', rgpd_accepted: true });
    assert.equal(res.status, 200);
    assert.ok(invited.rgpd_accepted_at instanceof Date);
    assert.ok(invited.rgpd_accepted_at.getTime() >= before);
    assert.ok(res.body.user.rgpd_accepted_at, 'le front doit recevoir la date pour ne pas afficher la modale');
  });

  test("n'enregistre rien sans acceptation explicite", async () => {
    const res = await post('/user/invite-accepted', { email: 'invite@exemple.fr', password: PASSWORD, name: 'Invité', invitation_token: 'jeton-valide' });
    assert.equal(res.status, 200);
    assert.equal(invited.rgpd_accepted_at, undefined);
  });
});
