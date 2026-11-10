/* eslint-env node */
// Tests des en-têtes HTTP de sécurité (helmet) et de leur compatibilité avec le CORS de l'app.
// Lancer : npm test (aucune connexion MongoDB nécessaire).
const { test, describe, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const cors = require('cors');
const { securityHeaders } = require('../src/services/security');

const APP_URL = 'https://app.evalud.green';
const servers = [];

// Même ordre de montage que src/index.js : helmet, puis cors.
const startServer = async (environment) => {
  const app = express();
  app.use(securityHeaders(environment));
  app.use(cors({ credentials: true, origin: [APP_URL] }));
  app.get('/', (req, res) => res.status(200).send({ ok: true }));
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  servers.push(server);
  return `http://127.0.0.1:${server.address().port}`;
};

after(() => servers.forEach((server) => server.close()));

describe('En-têtes de sécurité', () => {
  test('production : nosniff, X-Frame-Options et HSTS', async () => {
    const res = await fetch(`${await startServer('production')}/`);
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(res.headers.get('x-frame-options'), 'DENY');
    assert.equal(res.headers.get('strict-transport-security'), 'max-age=31536000; includeSubDomains');
    assert.equal(res.headers.get('content-security-policy'), null);
    assert.equal(res.headers.get('cross-origin-resource-policy'), 'same-site');
  });

  test('hors production : pas de HSTS', async () => {
    const res = await fetch(`${await startServer('development')}/`);
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.ok(res.headers.get('x-frame-options'));
    assert.equal(res.headers.get('strict-transport-security'), null);
  });

  test("CORS avec cookies conservé pour l'origine de l'app", async () => {
    const base = await startServer('production');
    const res = await fetch(`${base}/`, { headers: { Origin: APP_URL } });
    assert.equal(res.headers.get('access-control-allow-origin'), APP_URL);
    assert.equal(res.headers.get('access-control-allow-credentials'), 'true');

    const preflight = await fetch(`${base}/`, {
      method: 'OPTIONS',
      headers: { Origin: APP_URL, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization,content-type' },
    });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get('access-control-allow-origin'), APP_URL);
    assert.equal(preflight.headers.get('access-control-allow-credentials'), 'true');
  });
});
