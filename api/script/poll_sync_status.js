/**
 * Chronomètre la synchro Excel différée depuis l'extérieur de l'API : signe un JWT admin local,
 * attend que sync_status passe à pending=true pour les actions données, puis mesure jusqu'au retour à false.
 *
 * Usage (depuis api/, API locale démarrée) : node script/poll_sync_status.js <actionId> [actionId...]
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const config = require('../src/config');
const User = require('../src/models/user');

const actionIds = process.argv.slice(2);
if (!actionIds.length) {
  console.error('Usage : node script/poll_sync_status.js <actionId> [actionId...]');
  process.exit(1);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  await mongoose.connect(config.MONGODB_ENDPOINT);
  const admin = await User.findOne({ role: 'admin' });
  await mongoose.disconnect();
  const token = jwt.sign({ _id: admin._id }, config.SECRET, { expiresIn: '10m' });
  const pending = async (id) => (await (await fetch(`http://localhost:${config.PORT}/indicator_value/sync_status/${id}`, { headers: { Authorization: `JWT ${token}` } })).json()).data.pending;

  // Attente du déclenchement (PUT côté UI) : pending=true sur au moins une action
  const t0 = Date.now();
  while (Date.now() - t0 < 60000) {
    if ((await Promise.all(actionIds.map(pending))).some(Boolean)) break;
    await sleep(300);
  }
  const start = Date.now();
  console.log(`pending=true détecté après ${start - t0}ms d'attente — chronomètre lancé`);
  while (Date.now() - start < 300000) {
    const states = await Promise.all(actionIds.map(pending));
    if (!states.some(Boolean)) {
      console.log(`✅ Synchro terminée pour ${actionIds.length} action(s) en ${Date.now() - start}ms (debounce 2s inclus)`);
      process.exit(0);
    }
    await sleep(500);
  }
  console.log('Timeout');
  process.exit(1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
