/* eslint-env node */
// SEC-12 : lecture des profils utilisateurs et absence du hash / des jetons dans les réponses /user.
// Lancer : npm test (aucune connexion MongoDB nécessaire, les modèles sont simulés en mémoire).
process.env.SECRET = 'test-secret';
process.env.ENVIRONMENT = 'test';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');

const User = require('../src/models/user');
const UserActionRight = require('../src/models/user_action_right');
const Collectivity = require('../src/models/collectivity');
const EconomicActor = require('../src/models/economic_actor');

const PASSWORD = 'MotDePasse!2026';
const HASH = bcrypt.hashSync(PASSWORD, 4);
const SENSITIVE_FIELDS = ['password', 'password_reset_token', 'password_reset_expires', 'invitation_token', 'invitation_token_expires'];

// ---------- Utilisateurs simulés (vrais documents Mongoose, pour passer par toJSON) ----------
const id = () => new mongoose.Types.ObjectId().toString();
const COL_A = id();
const COL_B = id();
const EA_1 = id();

const makeUser = (key, fields) => {
  const doc = new User({
    _id: id(),
    email: `${key}@test.fr`,
    password: HASH,
    password_reset_token: `reset-${key}`,
    password_reset_expires: new Date(Date.now() + 3600000),
    invitation_token: `invite-${key}`,
    invitation_token_expires: new Date(Date.now() + 3600000),
    ...fields,
  });
  doc.save = async () => doc;
  return doc;
};

const users = {
  admin: makeUser('admin', { name: 'Admin', role: 'admin' }),
  member: makeUser('member', { name: 'Membre A', collectivities: [{ id: COL_A, role: 'user', status: 'approved' }] }),
  member2: makeUser('member2', { name: 'Membre A bis', collectivities: [{ id: COL_A, role: 'user', status: 'approved' }] }),
  pendingA: makeUser('pending', { name: 'Demande A', collectivities: [{ id: COL_A, role: 'user', status: 'pending' }] }),
  adminA: makeUser('admina', { name: 'Admin A', collectivities: [{ id: COL_A, role: 'admin', status: 'approved' }] }),
  adminB: makeUser('adminb', { name: 'Admin B', collectivities: [{ id: COL_B, role: 'admin', status: 'approved' }] }),
  pendingAdminA: makeUser('pendingadmina', { name: 'Admin A en attente', collectivities: [{ id: COL_A, role: 'admin', status: 'pending' }] }),
  memberB: makeUser('memberb', { name: 'Membre B', collectivities: [{ id: COL_B, role: 'user', status: 'approved' }] }),
  ae: makeUser('ae', { name: 'AE', role: 'economic_actor', economic_actor_id: EA_1, collectivities: [{ id: COL_A, role: 'economic_actor', status: 'approved' }] }),
  adminInA: makeUser('admininA', { name: 'Admin plateforme rattaché à A', role: 'admin', collectivities: [{ id: COL_A, role: 'user', status: 'approved' }] }),
};
const all = Object.values(users);

const chain = (rows) => {
  const query = { sort: () => query, skip: () => query, limit: () => query, then: (resolve, reject) => Promise.resolve(rows).then(resolve, reject) };
  return query;
};

User.findOne = async (query) => {
  if (query._id) return all.find((u) => u._id.toString() === String(query._id)) || null;
  if (query.email) return all.find((u) => u.email === query.email) || null;
  if (query.invitation_token) return all.find((u) => u.invitation_token === query.invitation_token) || null;
  return null;
};
User.find = () => chain(all);
User.countDocuments = async () => all.length;
UserActionRight.find = async () => [];
Collectivity.findById = async () => null;
Collectivity.findOne = async () => null;
EconomicActor.findById = async () => null;

// ---------- Serveur de test ----------
let server;
let baseUrl;

const call = async (method, path, who, body) => {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(who ? { Authorization: `JWT ${jwt.sign({ _id: users[who]._id.toString() }, process.env.SECRET)}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch (e) {
    json = null;
  }
  return { status: response.status, text, body: json };
};

// Aucun hash ni jeton, où que ce soit dans la réponse
const assertNoSecrets = (res) => {
  assert.ok(!res.text.includes(HASH), 'le hash du mot de passe est renvoyé');
  assert.ok(!/reset-|invite-/.test(res.text), 'un jeton est renvoyé');
  for (const field of SENSITIVE_FIELDS) assert.ok(!res.text.includes(`"${field}"`), `le champ ${field} est renvoyé`);
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

describe('Aucun hash ni jeton dans les réponses /user', () => {
  test('POST /user/signin', async () => {
    const res = await call('POST', '/user/signin', null, { email: 'member@test.fr', password: PASSWORD });
    assert.equal(res.status, 200);
    assert.equal(res.body.user.email, 'member@test.fr');
    assertNoSecrets(res);
  });

  test('GET /user/signin_token', async () => {
    const res = await call('GET', '/user/signin_token', 'member');
    assert.equal(res.status, 200);
    assert.equal(res.body.user.email, 'member@test.fr');
    assertNoSecrets(res);
  });

  test('POST /user/check-invitation-token renvoie email et nom, sans jeton', async () => {
    const res = await call('POST', '/user/check-invitation-token', null, { invitation_token: 'invite-member2' });
    assert.equal(res.status, 200);
    assert.equal(res.body.user.email, 'member2@test.fr');
    assert.equal(res.body.user.name, 'Membre A bis');
    assertNoSecrets(res);
  });

  test('GET /user/:id et POST /user/search (admin plateforme)', async () => {
    assertNoSecrets(await call('GET', `/user/${users.member._id}`, 'admin'));
    const search = await call('POST', '/user/search', 'admin', {});
    assert.equal(search.status, 200);
    assert.equal(search.body.data.length, all.length);
    assertNoSecrets(search);
  });
});

describe('GET /user/:id', () => {
  const allowed = [
    ['un utilisateur lit son propre profil', 'member', 'member'],
    ["l'admin plateforme lit n'importe quel profil", 'admin', 'memberB'],
    ["l'admin de collectivité lit un membre de sa collectivité", 'adminA', 'member'],
    ["l'admin de collectivité lit une demande d'accès en attente", 'adminA', 'pendingA'],
  ];
  for (const [label, who, target] of allowed) {
    test(label, async () => {
      const res = await call('GET', `/user/${users[target]._id}`, who);
      assert.equal(res.status, 200);
      assert.equal(res.body.data._id, users[target]._id.toString());
      assertNoSecrets(res);
    });
  }

  const forbidden = [
    ['un membre ne lit pas le profil d’un autre membre', 'member', 'member2'],
    ["l'admin d'une autre collectivité ne lit pas le profil", 'adminB', 'member'],
    ['un admin de collectivité non approuvé ne lit pas le profil', 'pendingAdminA', 'member'],
    ['un acteur économique ne lit pas un profil tiers', 'ae', 'member'],
    ["un admin de collectivité ne lit pas l'admin plateforme", 'adminA', 'admin'],
    ["un admin de collectivité ne lit pas l'admin plateforme rattaché à sa collectivité", 'adminA', 'adminInA'],
  ];
  for (const [label, who, target] of forbidden) {
    test(label, async () => {
      const res = await call('GET', `/user/${users[target]._id}`, who);
      assert.equal(res.status, 403);
      assert.equal(res.body.data, undefined);
    });
  }

  test('profil inexistant : 404', async () => {
    const res = await call('GET', `/user/${id()}`, 'admin');
    assert.equal(res.status, 404);
  });
});

describe('POST /user/search', () => {
  test('un non-admin sans filtre est refusé', async () => {
    assert.equal((await call('POST', '/user/search', 'member', {})).status, 403);
    assert.equal((await call('POST', '/user/search', 'member', { role: 'admin' })).status, 403);
  });

  test("un membre simple ou un acteur économique rattaché ne liste pas sa collectivité", async () => {
    assert.equal((await call('POST', '/user/search', 'member', { collectivity_id: COL_A })).status, 403);
    assert.equal((await call('POST', '/user/search', 'ae', { collectivity_id: COL_A })).status, 403);
    assert.equal((await call('POST', '/user/search', 'adminA', { collectivity_id: { $ne: COL_B } })).status, 403);
  });

  test('un admin de collectivité liste les membres de sa collectivité', async () => {
    const res = await call('POST', '/user/search', 'adminA', { collectivity_id: COL_A });
    assert.equal(res.status, 200);
    assertNoSecrets(res);
  });

  test("un non-admin ne liste pas une autre collectivité, ni une où il n'est pas approuvé", async () => {
    assert.equal((await call('POST', '/user/search', 'adminA', { collectivity_id: COL_B })).status, 403);
    assert.equal((await call('POST', '/user/search', 'pendingA', { collectivity_id: COL_A })).status, 403);
  });

  test('un acteur économique liste les membres de son organisation uniquement', async () => {
    assert.equal((await call('POST', '/user/search', 'ae', { economic_actor_id: EA_1 })).status, 200);
    assert.equal((await call('POST', '/user/search', 'ae', { economic_actor_id: id() })).status, 403);
    assert.equal((await call('POST', '/user/search', 'member', { economic_actor_id: EA_1 })).status, 403);
  });
});
