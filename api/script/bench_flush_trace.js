/**
 * Reproduit le flush excelSync réel pour plusieurs indicateurs d'une même action et trace
 * chaque appel Graph (méthode, URL, durée) pour voir où part le temps.
 * Écritures idempotentes : on ré-enqueue les valeurs ACTUELLES de la base.
 *
 * Usage (depuis api/) : node script/bench_flush_trace.js [nbIndicateurs=5]
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

// Trace de tous les appels Graph (le service utilise le fetch global)
const realFetch = globalThis.fetch;
const t0 = Date.now();
globalThis.fetch = async (url, options = {}) => {
  const start = Date.now();
  const res = await realFetch(url, options);
  const short = String(url).replace('https://graph.microsoft.com/v1.0', '').replace(/\/sites\/[^/]+\/drive\/items\//, '/items/');
  console.log(`  [+${String(start - t0).padStart(6)}ms] ${String(options.method || 'GET').padEnd(5)} ${String(Date.now() - start).padStart(6)}ms  ${res.status}  ${short.slice(0, 140)}`);
  return res;
};

const mongoose = require('mongoose');
const config = require('../src/config');
const Action = require('../src/models/action');
const Indicator = require('../src/models/indicator');
const IndicatorValue = require('../src/models/indicator_value');
const { enqueueCellUpdate, enqueueAggregation, isSyncPending } = require('../src/services/excelSync');

const NB = parseInt(process.argv[2] || '5');

(async () => {
  await mongoose.connect(config.MONGODB_ENDPOINT);
  const action = await Action.findOne({ name: /^B2/, collectivity_id: (await require('../src/models/collectivity').findOne({ name: 'Bordeaux Métropole' }))._id.toString(), type: { $ne: 'config' }, owner: 'collectivity', 'exel_files_prev.0.excel_file_id': { $exists: true } });
  const file = action.exel_files_prev.find((f) => f.excel_file_id && f.year_prev != null);
  const ivs = await IndicatorValue.find({ action_id: action._id.toString(), situation: 'prev', year: file.year_prev, indicator_type: 'number' }).limit(NB);
  console.log(`Action "${action.name}" — ${ivs.length} indicateurs prev ${file.year_prev}, fichier ${file.excel_file_id}\n`);

  const start = Date.now();
  for (const iv of ivs) {
    const indicator = await Indicator.findById(iv.indicator_id);
    enqueueCellUpdate({ fileId: file.excel_file_id, situation: 'prev', excelIndicatorId: indicator.excel_indicator_id, value: iv.value?.number, unit: indicator.value_unit });
  }
  enqueueAggregation({ actionId: action._id, situation: 'prev', year: file.year_prev });
  console.log('Enqueue terminé, attente du flush (debounce 2s)...\n');

  while (isSyncPending(action._id)) await new Promise((r) => setTimeout(r, 200));
  console.log(`\n✅ Flush terminé : ${Date.now() - start} ms depuis l'enqueue (debounce inclus)`);

  await mongoose.disconnect();
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
