/**
 * Valide la stratégie "cache de sessions workbook" : une session persistante sur le fichier
 * d'agrégation reste-t-elle utilisable après inactivité, et à quel coût de lecture ?
 * Lectures uniquement, aucune écriture.
 *
 * Usage (depuis api/) : node script/bench_session_reuse.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const config = require('../src/config');
const Collectivity = require('../src/models/collectivity');
const { graphFetch, getSiteId, createWorkbookSession, closeWorkbookSession } = require('../src/services/microsoftGraph');

const t = async (label, fn) => {
  const start = Date.now();
  try {
    const out = await fn();
    console.log(`  ${label.padEnd(65)} ${String(Date.now() - start).padStart(6)} ms`);
    return out;
  } catch (e) {
    console.log(`  ${label.padEnd(65)} ${String(Date.now() - start).padStart(6)} ms  ❌ ${e.message}`);
    return null;
  }
};
const sleep = (s) => new Promise((r) => setTimeout(r, s * 1000));

(async () => {
  await mongoose.connect(config.MONGODB_ENDPOINT);
  const collectivity = await Collectivity.findOne({ name: 'Bordeaux Métropole' });
  const aggId = collectivity.aggregation_excel_file_id;
  const siteId = await getSiteId();
  const read = (sh) => graphFetch(`/sites/${siteId}/drive/items/${aggId}/workbook/worksheets/${encodeURIComponent('3. Émissions par action')}/range(address='A21:AQ574')`, sh ? { headers: { 'workbook-session-id': sh } } : {});

  console.log('--- Création session (classeur possiblement déjà chaud suite au bench précédent) ---');
  const s1 = await t('createWorkbookSession', () => createWorkbookSession(aggId));
  await t('lecture A21:AQ574 (session, t+0)', () => read(s1));
  await t('lecture A21:AQ574 (session, t+0, 2e)', () => read(s1));

  console.log('\n--- Attente 60 s (inactivité) ---');
  await sleep(60);
  await t('lecture A21:AQ574 (même session, t+60s)', () => read(s1));

  console.log('\n--- Attente 180 s (inactivité) ---');
  await sleep(180);
  await t('lecture A21:AQ574 (même session, t+240s)', () => read(s1));

  console.log('\n--- Attente 360 s (inactivité, au-delà des ~5 min doc MS) ---');
  await sleep(360);
  await t('lecture A21:AQ574 (même session, t+600s)', () => read(s1));

  await t('closeWorkbookSession', () => closeWorkbookSession(aggId, s1));

  console.log('\n--- Re-création de session sur classeur chaud ---');
  const s2 = await t('createWorkbookSession (classeur chaud)', () => createWorkbookSession(aggId));
  await t('lecture A21:AQ574 (nouvelle session)', () => read(s2));
  await t('closeWorkbookSession', () => closeWorkbookSession(aggId, s2));

  await mongoose.disconnect();
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
