/* eslint-env node */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const fs = require('fs');
const mongoose = require('mongoose');
const ExcelJS = require('exceljs');
const config = require('../src/config');
const Collectivity = require('../src/models/collectivity');
const Action = require('../src/models/action');
const EconomicActor = require('../src/models/economic_actor');
const { ACTION_GAINS_RANGES, CALCULATED_COLUMNS, readAggregationBlocks, rowsForFile } = require('../src/services/aggregationReader');

// Export local, en lecture seule, des valeurs calculées (émissions, gains, atteinte)
// lues dans le fichier d'agrégation SharePoint de chaque collectivité.
//
// Depuis api/ :
//   node script/export_calculated_values.js --collectivities <id1,id2|all> \
//     [--template ../Template_export_Interlud.xlsx] \
//     [--out ./out/export_valeurs_calculees.xlsx] \
//     [--include-zero false] [--concurrency 2] [--all-years]
//
// Mongo : find + lean uniquement. SharePoint : GET de plages, via readAggregationBlocks.
// La sortie est un fichier local. Ne pas lancer sur autre chose qu'un petit échantillon au début.

const USAGE = `Usage : node script/export_calculated_values.js --collectivities <id1,id2|all> [--template ../Template_export_Interlud.xlsx] [--out ./out/export_valeurs_calculees.xlsx] [--include-zero false] [--concurrency 2] [--all-years]

À lancer depuis api/, avec api/.env déjà en place (ne pas afficher ce fichier).
Lecture seule Mongo (find/lean) et SharePoint (GET). Par défaut : années de la fiche seulement.
--all-years garde 2010-2050. --include-zero true conserve les zéros ; les cellules vides restent omises.`;

const DEFAULT_TEMPLATE = path.resolve(__dirname, '../../Template_export_Interlud.xlsx');
const DEFAULT_OUT = path.resolve(__dirname, '../out/export_valeurs_calculees.xlsx');
const PAUSE_MS = 500;
const SHEET_NAME = 'Valeurs calculées';
const README_BULLET = "• Valeurs calculées — émissions, gains (écarts entre situations) et taux d'atteinte, une ligne par valeur, lus dans le fichier d'agrégation de la collectivité ou de l'acteur économique (feuilles « 3. Émissions par action » et « 4. Gains par action »).";

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const safeError = (error) =>
  String(error && error.message ? error.message : error)
    .replace(/mongodb(?:\+srv)?:\/\/\S+/gi, 'mongodb://…')
    .replace(/Bearer\s+\S+/gi, 'Bearer …')
    .replace(/\/items\/[^/\s'"]+/g, '/items/…')
    .slice(0, 400);

const takeValue = (args, index) => {
  const eq = args[index].indexOf('=');
  if (eq !== -1) return { value: args[index].slice(eq + 1), next: index };
  return { value: args[index + 1], next: index + 1 };
};

const parseArgs = (argv) => {
  const parsed = { collectivities: '', template: '', out: '', includeZero: false, concurrency: 2, allYears: false };
  const args = argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--all-years') {
      parsed.allYears = true;
      continue;
    }
    if (arg === '--include-zero' || arg.startsWith('--include-zero=')) {
      const taken = arg.startsWith('--include-zero=') ? { value: arg.slice('--include-zero='.length), next: i } : takeValue(args, i);
      i = taken.next;
      if (taken.value === 'true' || taken.value === 'false') {
        parsed.includeZero = taken.value === 'true';
        continue;
      }
      if (taken.value === undefined || String(taken.value).startsWith('--')) {
        parsed.includeZero = true;
        if (taken.value !== undefined && String(taken.value).startsWith('--')) i -= 1;
        continue;
      }
      throw new Error('--include-zero attend true ou false');
    }
    const key = arg.startsWith('--collectivities') ? 'collectivities' : arg.startsWith('--template') ? 'template' : arg.startsWith('--out') ? 'out' : arg.startsWith('--concurrency') ? 'concurrency' : '';
    if (!key) throw new Error(`Option inconnue : ${arg.split('=')[0]}\n${USAGE}`);
    const taken = takeValue(args, i);
    i = taken.next;
    if (taken.value === undefined || String(taken.value).startsWith('--')) throw new Error(`Valeur manquante pour --${key}\n${USAGE}`);
    if (key === 'concurrency') {
      const n = parseInt(taken.value, 10);
      if (!Number.isFinite(n) || n < 1) throw new Error('--concurrency doit être un entier ≥ 1');
      parsed.concurrency = n;
      continue;
    }
    parsed[key] = taken.value;
  }
  if (!parsed.collectivities) throw new Error(USAGE);
  return parsed;
};

const resolvePaths = (parsed) => ({
  ...parsed,
  template: parsed.template ? path.resolve(process.cwd(), parsed.template) : DEFAULT_TEMPLATE,
  out: parsed.out ? path.resolve(process.cwd(), parsed.out) : DEFAULT_OUT,
});

const jobsForCollectivity = (collectivity, actions, actors) => {
  const id = String(collectivity._id);
  const own = actions.filter((action) => action.owner !== 'economic_actor');
  const jobs = [
    {
      label: `${collectivity.name} — collectivité`,
      fileId: collectivity.aggregation_excel_file_id || '',
      collectivity,
      actorName: '',
      owner: 'collectivity',
      actions: own,
    },
  ];
  const seen = new Set();
  for (const actor of actors) {
    const entry = (actor.collectivities || []).find((c) => String(c.id) === id);
    if (!entry) continue;
    const actorActions = actions.filter((action) => action.owner === 'economic_actor' && String(action.economic_actor_id) === String(actor._id));
    for (const action of actorActions) seen.add(String(action._id));
    if (!actorActions.length && !entry.aggregation_excel_file_id) continue;
    jobs.push({
      label: `${collectivity.name} — ${actor.name}`,
      fileId: entry.aggregation_excel_file_id || '',
      collectivity,
      actorName: actor.name || '',
      owner: 'economic_actor',
      actions: actorActions,
    });
  }
  return { jobs, orphanActorActions: actions.filter((action) => action.owner === 'economic_actor' && !seen.has(String(action._id))).length };
};

async function runWithConcurrency(items, concurrency, fn) {
  const results = new Array(items.length);
  if (!items.length) return results;
  let cursor = 0;
  const worker = async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      if (index > 0) await delay(PAUSE_MS);
      results[index] = await fn(items[index], index);
    }
  };
  const workers = Math.min(concurrency, items.length);
  await Promise.all(Array.from({ length: workers }, () => worker()));
  return results;
}

const moveSheetAfter = (workbook, sheetName, afterName) => {
  const ordered = workbook.worksheets;
  const moved = ordered.find((sheet) => sheet.name === sheetName);
  const rest = ordered.filter((sheet) => sheet !== moved);
  if (!moved || !rest.some((sheet) => sheet.name === afterName)) return;
  rest.splice(rest.findIndex((sheet) => sheet.name === afterName) + 1, 0, moved);
  rest.forEach((sheet, index) => {
    sheet.orderNo = index;
  });
};

const addReadmeBullet = (workbook) => {
  const sheet = workbook.getWorksheet('Lisez-moi');
  if (!sheet) return;
  const max = Math.max(sheet.rowCount, 13);
  for (let row = 1; row <= max; row++) {
    const value = sheet.getCell(row, 1).value;
    if (typeof value === 'string' && value.includes('Valeurs calculées')) return;
  }
  const target = sheet.getCell(13, 1);
  const cell = target.value ? sheet.getCell(max + 1, 1) : target;
  cell.value = README_BULLET;
  const sample = sheet.getCell(9, 1);
  if (sample.font) cell.font = { ...sample.font };
};

const addCalculatedValuesSheet = (workbook, rows) => {
  const existing = workbook.getWorksheet(SHEET_NAME);
  if (existing) workbook.removeWorksheet(existing.id);
  const sheet = workbook.addWorksheet(SHEET_NAME, { views: [{ state: 'frozen', ySplit: 1 }] });
  sheet.columns = CALCULATED_COLUMNS.map((column) => ({ header: column.header, key: column.key, width: column.width }));
  const header = sheet.getRow(1);
  header.font = { bold: true };
  header.alignment = { wrapText: true, vertical: 'middle' };
  header.height = 30;
  if (rows.length) sheet.addRows(rows);
  const lastRow = Math.max(sheet.rowCount, 1);
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: lastRow, column: CALCULATED_COLUMNS.length } };
  moveSheetAfter(workbook, SHEET_NAME, 'Valeurs');
  addReadmeBullet(workbook);
  return sheet;
};

const fileContext = (job) => ({
  collectivityName: job.collectivity.name || '',
  siren: job.collectivity.siren,
  department: job.collectivity.department,
  owner: job.owner,
  actorName: job.actorName,
});

async function processJob(job, options) {
  if (!job.actions.length) return { status: 'ok', label: job.label, rows: [], note: 'aucune fiche' };
  if (!job.fileId) return { status: 'ko', label: job.label, rows: [], error: "pas de fichier d'agrégation" };
  try {
    const { gainsRows, emRows } = await readAggregationBlocks(job.fileId);
    const rows = rowsForFile({ ...fileContext(job), actions: job.actions, gainsRows, emRows, allYears: options.allYears, includeZero: options.includeZero, extractedAt: options.extractedAt });
    return { status: 'ok', label: job.label, rows };
  } catch (error) {
    return { status: 'ko', label: job.label, rows: [], error: safeError(error) };
  }
}

async function main() {
  const options = resolvePaths(parseArgs(process.argv));
  if (!fs.existsSync(options.template)) throw new Error(`Template introuvable : ${options.template}`);
  if (path.resolve(options.template) === path.resolve(options.out)) throw new Error('Le fichier de sortie ne peut pas être le template.');
  if (!config.MONGODB_ENDPOINT) throw new Error('MONGODB_ENDPOINT est absent (api/.env). Ne pas coller son contenu dans le terminal.');

  console.log(`Template : ${options.template}`);
  console.log(`Sortie   : ${options.out}`);

  let connected = false;
  let exitCode = 0;
  try {
    await mongoose.connect(config.MONGODB_ENDPOINT);
    connected = true;

    const filter = options.collectivities === 'all' ? {} : { _id: { $in: options.collectivities.split(',').map((id) => id.trim()).filter(Boolean) } };
    if (options.collectivities !== 'all' && !filter._id.$in.length) throw new Error('--collectivities est vide');
    const collectivities = await Collectivity.find(filter).lean();
    if (options.collectivities !== 'all') {
      const found = new Set(collectivities.map((collectivity) => String(collectivity._id)));
      for (const id of filter._id.$in) {
        if (!found.has(id)) console.warn(`Collectivité introuvable : ${id}`);
      }
    }
    if (!collectivities.length) throw new Error('Aucune collectivité trouvée.');

    const ids = collectivities.map((collectivity) => String(collectivity._id));
    const actions = await Action.find({
      collectivity_id: { $in: ids },
      excel_worksheetname: { $in: Object.keys(ACTION_GAINS_RANGES) },
      type: { $nin: ['config', 'global'] },
    }).lean();
    const actors = await EconomicActor.find({ 'collectivities.id': { $in: ids } }).lean();

    const extractedAt = new Date().toISOString().slice(0, 10);
    const jobs = [];
    let orphans = 0;
    for (const collectivity of collectivities) {
      const built = jobsForCollectivity(
        collectivity,
        actions.filter((action) => action.collectivity_id === String(collectivity._id)),
        actors,
      );
      jobs.push(...built.jobs);
      orphans += built.orphanActorActions;
    }
    if (orphans) console.warn(`${orphans} fiche(s) d'acteur économique sans fichier d'agrégation identifié, ignorée(s).`);

    console.log(`${jobs.length} fichier(s) d'agrégation à lire (concurrence ${options.concurrency}, pause ${PAUSE_MS} ms).`);
    const results = await runWithConcurrency(jobs, options.concurrency, async (job, index) => {
      const result = await processJob(job, { ...options, extractedAt });
      const detail = result.error ? ` — ${result.error}` : result.note ? ` — ${result.note}` : '';
      console.log(`[${index + 1}/${jobs.length}] ${result.status === 'ok' ? 'OK' : 'KO'} ${result.label} — ${result.rows.length} ligne(s)${detail}`);
      return result;
    });

    const rows = results.flatMap((result) => result.rows);
    const ok = results.filter((result) => result.status === 'ok').length;
    const ko = results.length - ok;
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(options.template);
    addCalculatedValuesSheet(workbook, rows);
    await fs.promises.mkdir(path.dirname(options.out), { recursive: true });
    await workbook.xlsx.writeFile(options.out);
    console.log(`Résumé : ${ok} OK, ${ko} KO, ${rows.length} ligne(s) → ${options.out}`);
    if (ko) exitCode = 1;
  } catch (error) {
    console.error(safeError(error));
    exitCode = 1;
  }
  if (connected) await mongoose.disconnect().catch(() => {});
  process.exit(exitCode);
}

if (require.main === module) {
  main();
}

module.exports = {
  USAGE,
  README_BULLET,
  SHEET_NAME,
  parseArgs,
  resolvePaths,
  jobsForCollectivity,
  safeError,
  addCalculatedValuesSheet,
  runWithConcurrency,
  processJob,
};
