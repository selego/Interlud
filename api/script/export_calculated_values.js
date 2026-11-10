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
const EconomicActorQuestion = require('../src/models/economic_actor_question');
const EconomicActorAnswer = require('../src/models/economic_actor_answer');
const { ACTION_GAINS_RANGES, readAggregationBlocks, rowsForFile } = require('../src/services/aggregationReader');

// Export local, en lecture seule, des valeurs calculées (émissions, gains, atteinte)
// lues dans le fichier d'agrégation SharePoint de chaque collectivité.
//
// Depuis api/ :
//   node script/export_calculated_values.js --collectivities <id1,id2|all> \
//     [--template ../Template_export_Interlud.xlsx] [--out ./out/export_valeurs_calculees.xlsx] [--with-answers]
//
// --with-answers ajoute l'onglet « Réponses acteurs éco » (questionnaire AE, lu en base uniquement).
//
// Mongo : find uniquement. SharePoint : GET de plages, via readAggregationBlocks.
// La sortie est un fichier local. Ne pas lancer sur autre chose qu'un petit échantillon au début.

const USAGE = `Usage : node script/export_calculated_values.js --collectivities <id1,id2|all> [--template ../Template_export_Interlud.xlsx] [--out ./out/export_valeurs_calculees.xlsx] [--with-answers]

À lancer depuis api/ (api/.env requis).
Lecture seule Mongo (find) et SharePoint (GET).`;

const DEFAULT_TEMPLATE = path.resolve(__dirname, '../../Template_export_Interlud.xlsx');
const DEFAULT_OUT = path.resolve(__dirname, '../out/export_valeurs_calculees.xlsx');
const SHEET_NAME = 'Valeurs calculées';
// Nombre maximal de lignes d'une feuille Excel, en-tête compris.
const EXCEL_MAX_ROWS = 1048576;
const README_TITLE = 'Export des données Interlud+';
const README_BULLET =
  "• Valeurs calculées — émissions, gains (écarts entre situations) et taux d'atteinte, une ligne par valeur, lus dans le fichier d'agrégation de la collectivité ou de l'acteur économique (feuilles « 3. Émissions par action » et « 4. Gains par action »). Ce sont les valeurs au moment de l'export : un nouvel export les remplace, sans historique. Ligne Total : atteinte = cumul ex-post ÷ cumul prévisionnel sur toutes les années, comme sur l'accueil.";
// Fond jaune des lignes d'exemple fictives du template.
const EXAMPLE_FILL = 'FFFFF8DC';
const OPTIONS = ['collectivities', 'template', 'out'];
const ANSWERS_SHEET_NAME = 'Réponses acteurs éco';

const ANSWERS_COLUMNS = [
  { header: 'Acteur économique', key: 'acteur', width: 28 },
  { header: 'Collectivités', key: 'collectivites', width: 36 },
  { header: 'Question', key: 'question', width: 48 },
  { header: 'Question active', key: 'active', width: 12 },
  { header: 'Fiches rattachées', key: 'fiches', width: 24 },
  { header: 'Type', key: 'type', width: 12 },
  { header: 'Réponse', key: 'reponse', width: 36 },
  { header: 'Unité', key: 'unite', width: 12 },
  { header: 'Mise à jour', key: 'misAJour', width: 14 },
];

const CALCULATED_COLUMNS = [
  { header: 'Collectivité', key: 'collectivite', width: 28 },
  { header: 'SIREN', key: 'siren', width: 14 },
  { header: 'Département', key: 'departement', width: 14 },
  { header: 'Propriétaire', key: 'proprietaire', width: 18 },
  { header: 'Acteur économique', key: 'acteur', width: 28 },
  { header: 'Fiche action', key: 'fiche', width: 14 },
  { header: 'Action de référence', key: 'actionReference', width: 36 },
  { header: 'Nom de la fiche', key: 'nomFiche', width: 36 },
  { header: 'Instance', key: 'instance', width: 12 },
  { header: 'Brouillon', key: 'brouillon', width: 12 },
  { header: 'Famille', key: 'famille', width: 14 },
  { header: 'Polluant', key: 'polluant', width: 14 },
  { header: 'Situation / Écart', key: 'situation', width: 20 },
  { header: 'Année', key: 'annee', width: 10 },
  { header: 'Valeur', key: 'valeur', width: 14 },
  { header: 'Unité', key: 'unite', width: 12 },
];

const safeError = (error) =>
  String(error && error.message ? error.message : error)
    .replace(/mongodb(?:\+srv)?:\/\/\S+/gi, 'mongodb://…')
    .replace(/Bearer\s+\S+/gi, 'Bearer …')
    .replace(/\/items\/[^/\s'"]+/g, '/items/…')
    .slice(0, 400);

const parseArgs = (argv) => {
  const parsed = { collectivities: '', template: '', out: '', withAnswers: false };
  const args = argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const [flag, inline] = args[i].split(/=(.*)/s);
    if (flag === '--with-answers') {
      parsed.withAnswers = true;
      continue;
    }
    const key = OPTIONS.find((option) => flag === `--${option}`);
    if (!key) throw new Error(`Option inconnue : ${flag}\n${USAGE}`);
    const value = inline !== undefined ? inline : args[++i];
    if (value === undefined || value.startsWith('--')) throw new Error(`Valeur manquante pour --${key}\n${USAGE}`);
    parsed[key] = value;
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

// Le template contient des lignes d'exemple fictives et des notes de travail pour BL : on ne les garde pas dans l'export.
const removeTemplateExamples = (workbook) => {
  for (const sheet of workbook.worksheets) {
    for (let row = sheet.rowCount; row >= 2; row--) {
      if (sheet.getRow(row).getCell(1).fill?.fgColor?.argb === EXAMPLE_FILL) sheet.spliceRows(row, 1);
    }
  }
  const readme = workbook.getWorksheet('Lisez-moi');
  if (!readme) return;
  const findRow = (predicate) => Array.from(readme.getColumn(1).values, (value) => String(value || '')).findIndex(predicate);
  const titleRow = findRow((value) => value.startsWith("Template d'export"));
  if (titleRow !== -1) readme.getCell(titleRow, 1).value = README_TITLE;
  for (const draft of ['Document de travail', "L'export serait"]) {
    const row = findRow((value) => value.startsWith(draft));
    if (row !== -1) readme.spliceRows(row, 1);
  }
  // Section « Questions pour BL » jusqu'à la fin, une ligne à la fois : spliceRows d'exceljs ne fait rien si la plage dépasse la dernière ligne.
  const questionsRow = findRow((value) => value === 'Questions pour BL');
  if (questionsRow !== -1) {
    for (let row = readme.rowCount; row >= questionsRow; row--) readme.spliceRows(row, 1);
  }
};

// Puce insérée sous celle de l'onglet « Valeurs », avec le même style.
const addReadmeBullet = (workbook) => {
  const sheet = workbook.getWorksheet('Lisez-moi');
  if (!sheet) return;
  const values = Array.from(sheet.getColumn(1).values, (value) => String(value || ''));
  if (values.some((value) => value.includes('Valeurs calculées'))) return;
  const valuesRow = values.findIndex((value) => value.startsWith('• Valeurs'));
  if (valuesRow === -1) {
    sheet.addRow([README_BULLET]);
    return;
  }
  sheet.insertRow(valuesRow + 1, [README_BULLET], 'i');
};

const addCalculatedValuesSheet = (workbook, rows) => {
  if (rows.length + 1 > EXCEL_MAX_ROWS) {
    throw new Error(`Export annulé : l'onglet « ${SHEET_NAME} » compterait ${rows.length + 1} lignes (en-tête compris), au-delà de la limite Excel de ${EXCEL_MAX_ROWS}. Relancer avec moins de collectivités.`);
  }
  removeTemplateExamples(workbook);
  const existing = workbook.getWorksheet(SHEET_NAME);
  if (existing) workbook.removeWorksheet(existing.id);
  const sheet = workbook.addWorksheet(SHEET_NAME, { views: [{ state: 'frozen', ySplit: 1 }] });
  sheet.columns = CALCULATED_COLUMNS;
  const header = sheet.getRow(1);
  header.font = { bold: true };
  header.alignment = { wrapText: true, vertical: 'middle' };
  header.height = 30;
  if (rows.length) sheet.addRows(rows);
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(sheet.rowCount, 1), column: CALCULATED_COLUMNS.length } };
  moveSheetAfter(workbook, SHEET_NAME, 'Valeurs');
  addReadmeBullet(workbook);
  return sheet;
};

// Une ligne par acteur et par question : questions actives (même sans réponse) et questions désactivées déjà répondues.
const answerRows = ({ actors, questions, answers }) =>
  actors.flatMap((actor) =>
    questions
      .map((question) => ({ question, answer: answers.find((a) => a.economic_actor_id === String(actor._id) && a.question_id === String(question._id)) }))
      .filter((line) => line.question.active || line.answer)
      .map((line) => ({
        acteur: actor.name || '',
        collectivites: (actor.collectivities || []).map((c) => c.name).join(', '),
        question: line.question.label || '',
        active: line.question.active ? 'Oui' : 'Non',
        fiches: (line.question.actions || []).map((a) => a.name).join(', '),
        type: line.question.type || '',
        reponse: Array.isArray(line.answer?.value?.[line.question.type]) ? line.answer.value[line.question.type].join(', ') : line.answer?.value?.[line.question.type] ?? '',
        unite: line.question.value_unit || '',
        misAJour: line.answer?.updatedAt || null,
      })),
  );

const addAnswersSheet = (workbook, rows) => {
  const existing = workbook.getWorksheet(ANSWERS_SHEET_NAME);
  if (existing) workbook.removeWorksheet(existing.id);
  const sheet = workbook.addWorksheet(ANSWERS_SHEET_NAME, { views: [{ state: 'frozen', ySplit: 1 }] });
  sheet.columns = ANSWERS_COLUMNS;
  const header = sheet.getRow(1);
  header.font = { bold: true };
  header.alignment = { wrapText: true, vertical: 'middle' };
  header.height = 30;
  if (rows.length) sheet.addRows(rows);
  sheet.getColumn('misAJour').numFmt = 'dd/mm/yyyy';
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(sheet.rowCount, 1), column: ANSWERS_COLUMNS.length } };
  moveSheetAfter(workbook, ANSWERS_SHEET_NAME, SHEET_NAME);
  return sheet;
};

const fileContext = (job) => ({
  collectivityName: job.collectivity.name || '',
  siren: job.collectivity.siren,
  department: job.collectivity.department,
  owner: job.owner,
  actorName: job.actorName,
});

async function processJob(job) {
  if (!job.actions.length) return { status: 'ok', label: job.label, rows: [], note: 'aucune fiche' };
  if (!job.fileId) return { status: 'ko', label: job.label, rows: [], error: "pas de fichier d'agrégation" };
  try {
    const { gainsRows, emRows } = await readAggregationBlocks(job.fileId);
    return { status: 'ok', label: job.label, rows: rowsForFile({ context: fileContext(job), actions: job.actions, gainsRows, emRows }) };
  } catch (error) {
    return { status: 'ko', label: job.label, rows: [], error: safeError(error) };
  }
}

async function main() {
  const options = resolvePaths(parseArgs(process.argv));
  if (!fs.existsSync(options.template)) throw new Error(`Template introuvable : ${options.template}`);
  if (path.resolve(options.template) === path.resolve(options.out)) throw new Error('Le fichier de sortie ne peut pas être le template.');
  if (!config.MONGODB_ENDPOINT) throw new Error('MONGODB_ENDPOINT absent : api/.env requis.');

  console.log(`Template : ${options.template}`);
  console.log(`Sortie   : ${options.out}`);

  let connected = false;
  let exitCode = 0;
  try {
    await mongoose.connect(config.MONGODB_ENDPOINT);
    connected = true;

    // Mongoose convertit le filtre en ObjectId sur place : on garde la liste demandée à part.
    const requested = options.collectivities === 'all' ? [] : options.collectivities.split(',').map((id) => id.trim()).filter(Boolean);
    if (options.collectivities !== 'all' && !requested.length) throw new Error('--collectivities est vide');
    const collectivities = await Collectivity.find(options.collectivities === 'all' ? {} : { _id: { $in: requested.filter((id) => mongoose.isValidObjectId(id)) } });
    const found = new Set(collectivities.map((collectivity) => String(collectivity._id)));
    for (const id of requested) {
      if (!found.has(id)) console.warn(`Collectivité introuvable : ${id}`);
    }
    if (!collectivities.length) throw new Error('Aucune collectivité trouvée.');

    const ids = collectivities.map((collectivity) => String(collectivity._id));
    const actions = await Action.find({
      collectivity_id: { $in: ids },
      excel_worksheetname: { $in: Object.keys(ACTION_GAINS_RANGES) },
      type: { $nin: ['config', 'global'] },
    });
    const actors = await EconomicActor.find({ 'collectivities.id': { $in: ids } });

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

    console.log(`${jobs.length} fichier(s) d'agrégation à lire.`);
    const results = [];
    for (const [index, job] of jobs.entries()) {
      const result = await processJob(job);
      console.log(`[${index + 1}/${jobs.length}] ${result.status === 'ok' ? 'OK' : 'KO'} ${result.label} — ${result.rows.length} ligne(s)${result.error || result.note ? ` — ${result.error || result.note}` : ''}`);
      results.push(result);
    }

    const rows = results.flatMap((result) => result.rows);
    const ok = results.filter((result) => result.status === 'ok').length;
    const ko = results.length - ok;
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(options.template);
    addCalculatedValuesSheet(workbook, rows);
    if (options.withAnswers) {
      const questions = await EconomicActorQuestion.find({}).sort({ order: 1, createdAt: 1 });
      const answers = await EconomicActorAnswer.find({ economic_actor_id: { $in: actors.map((actor) => String(actor._id)) } });
      const answersRows = answerRows({ actors, questions, answers });
      addAnswersSheet(workbook, answersRows);
      console.log(`Réponses acteurs éco : ${answersRows.length} ligne(s), ${answers.length} réponse(s) saisie(s).`);
    }
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
  README_TITLE,
  SHEET_NAME,
  EXCEL_MAX_ROWS,
  ANSWERS_SHEET_NAME,
  parseArgs,
  resolvePaths,
  jobsForCollectivity,
  safeError,
  addCalculatedValuesSheet,
  answerRows,
  addAnswersSheet,
  processJob,
};
