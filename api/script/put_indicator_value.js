/**
 * Modifie une IndicatorValue via l'API locale (même endpoint que l'UI : PUT /indicator_value/:id),
 * avec un JWT admin signé localement. Sert à tester des indicateurs non exposés dans l'UI.
 *
 * Usage (depuis api/, API locale démarrée) :
 *   node script/put_indicator_value.js <ivId> <valeurJSON>      ex : ... 6a74… 123.5   |  ... 6a74… '"Oui"'  |  ... 6a74… null
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const config = require('../src/config');
const User = require('../src/models/user');
const IndicatorValue = require('../src/models/indicator_value');

const [ivId, rawValue] = process.argv.slice(2);
if (!ivId || rawValue === undefined) {
  console.error('Usage : node script/put_indicator_value.js <ivId> <valeurJSON>');
  process.exit(1);
}

(async () => {
  await mongoose.connect(config.MONGODB_ENDPOINT);
  const admin = await User.findOne({ role: 'admin' });
  const iv = await IndicatorValue.findById(ivId);
  if (!iv) throw new Error('IV introuvable');
  await mongoose.disconnect();

  const token = jwt.sign({ _id: admin._id }, config.SECRET, { expiresIn: '10m' });
  const body = { ...iv.toObject(), source: 'manual', value: { ...(iv.value?.toObject?.() || iv.value || {}), [iv.indicator_type]: JSON.parse(rawValue) } };
  const start = Date.now();
  const res = await fetch(`http://localhost:${config.PORT}/indicator_value/${ivId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `JWT ${token}` }, body: JSON.stringify(body) });
  const json = await res.json();
  console.log(`PUT ${iv.indicator_excel_id} (${iv.action_name} ${iv.situation} ${iv.year}) : ${JSON.stringify(iv.value?.[iv.indicator_type])} → ${rawValue} — HTTP ${res.status} ok=${json.ok} en ${Date.now() - start}ms`);
  process.exit(json.ok ? 0 : 1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
