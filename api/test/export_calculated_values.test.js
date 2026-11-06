/* eslint-env node */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const ExcelJS = require('exceljs');

const { GAINS_FIRST_ROW, EMISSIONS_FIRST_ROW, ACTION_GAINS_RANGES, ACTION_EMISSIONS_RANGES, GAIN_COLUMNS, parseNumber, cellNumber, extractAggregation, rowsForFile } = require('../src/services/aggregationReader');

const { parseArgs, jobsForCollectivity, addCalculatedValuesSheet, safeError, README_BULLET, SHEET_NAME, ANSWERS_SHEET_NAME, answerRows, addAnswersSheet } = require('../script/export_calculated_values');

// Feuilles complètes A19:FU572 et A21:FU574.
const blankSheet = () => Array.from({ length: 554 }, () => []);

const put = (rows, first, excelRow, col, value) => {
  const line = rows[excelRow - first];
  while (line.length <= col) line.push(null);
  line[col] = value;
};

const context = { collectivityName: 'CA Exemple', siren: 200012345, department: '69', owner: 'collectivity', actorName: '' };

const c1 = () => ({
  _id: 'a1',
  excel_worksheetname: 'C1',
  name: 'Tournées centre',
  action_parent_name: 'Optimisation des tournées',
  instance_number: 1,
  is_draft: false,
  owner: 'collectivity',
});

// Instance 1 de C1 = colonne AW (48) ; total = colonne E (4).
const fixture = () => {
  const gains = blankSheet();
  const em = blankSheet();
  const emRow = (year) => ACTION_EMISSIONS_RANGES.C1.dataStartRow + (year - 2010);
  const gainsRow = (year) => ACTION_GAINS_RANGES.C1.dataStartRow + (year - 2010);
  put(em, EMISSIONS_FIRST_ROW, emRow(2015), 48, 1);
  put(em, EMISSIONS_FIRST_ROW, emRow(2020), 48, 100);
  put(em, EMISSIONS_FIRST_ROW, emRow(2030), 50, 80);
  put(em, EMISSIONS_FIRST_ROW, emRow(2030), 51, 70);
  put(gains, GAINS_FIRST_ROW, gainsRow(2020), 48, 0);
  [-5, -6, -10, -7, -4, -1].forEach((value, offset) => put(gains, GAINS_FIRST_ROW, gainsRow(2030), 48 + offset, value));
  put(em, EMISSIONS_FIRST_ROW, emRow(2020), 4, 999);
  put(em, EMISSIONS_FIRST_ROW, emRow(2025), 6, 50);
  put(em, EMISSIONS_FIRST_ROW, emRow(2030), 6, '30');
  put(em, EMISSIONS_FIRST_ROW, emRow(2030), 7, 20);
  return { gains, em };
};

const pick = (rows, filter) => rows.filter((row) => Object.entries(filter).every(([key, value]) => row[key] === value));

describe('lecture du dashboard', () => {
  test('les 6 écarts de gains sont dans l’ordre confirmé ; le dashboard ne lit pas +1 ni +3', () => {
    assert.deepEqual(
      GAIN_COLUMNS.map((column) => [column.offset, column.label]),
      [
        [0, 'Réf-Init'],
        [1, 'Prév-Init'],
        [2, 'Prév-Réf'],
        [3, 'Expost-Init'],
        [4, 'Expost-Réf'],
        [5, 'Expost-Prév'],
      ],
    );
    const row = Array(60).fill(0);
    row[49] = 100;
    row[51] = 50;
    row[52] = 4;
    const agg = extractAggregation({ type: 'custom', instance_number: 1 }, [{ year: 2030, row }], []);
    assert.equal(agg.gains.GES.objective, 0);
    assert.equal(agg.gains.GES.real, 4);
    assert.equal(agg.gains.GES.achievement, null);
  });

  test('parseNumber conserve le comportement du dashboard', () => {
    assert.equal(parseNumber(null), 0);
    assert.equal(parseNumber(''), 0);
    assert.equal(parseNumber('1 234,5'), 1234.5);
    assert.equal(parseNumber('nope'), 0);
    assert.equal(parseNumber('#N/A'), 0);
    assert.equal(parseNumber(-3), -3);
  });

  test('cellNumber distingue vide et zéro', () => {
    assert.equal(cellNumber(null), null);
    assert.equal(cellNumber(''), null);
    assert.equal(cellNumber('  '), null);
    assert.equal(cellNumber(0), 0);
    assert.equal(cellNumber('#N/A'), null);
    assert.equal(cellNumber('1 234,5'), 1234.5);
  });
});

describe('lignes Valeurs calculées', () => {
  test('émissions et gains signés de toutes les années, vides et zéros omis', () => {
    const { gains, em } = fixture();
    const rows = pick(rowsForFile({ context, actions: [c1()], gainsRows: gains, emRows: em }), { instance: 1, polluant: 'GES' });

    assert.deepEqual(
      pick(rows, { famille: 'Émission' }).map((row) => [row.annee, row.situation, row.valeur]),
      [
        [2015, 'init', 1],
        [2020, 'init', 100],
        [2030, 'prev', 80],
        [2030, 'expost', 70],
      ],
    );
    assert.deepEqual(
      pick(rows, { famille: 'Gain' }).map((row) => [row.annee, row.situation, row.valeur]),
      [
        [2030, 'Réf-Init', -5],
        [2030, 'Prév-Init', -6],
        [2030, 'Prév-Réf', -10],
        [2030, 'Expost-Init', -7],
        [2030, 'Expost-Réf', -4],
        [2030, 'Expost-Prév', -1],
      ],
    );
    const first = rows[0];
    assert.equal(first.collectivite, 'CA Exemple');
    assert.equal(first.siren, 200012345);
    assert.equal(first.unite, 'tCO2e');
    assert.equal(first.brouillon, 'Non');
    assert.equal(first.nomFiche, 'Tournées centre');
  });

  test("l'atteinte d'une instance suit le dashboard d'action", () => {
    const { gains, em } = fixture();
    const rows = rowsForFile({ context, actions: [c1()], gainsRows: gains, emRows: em });
    const agg = extractAggregation({ type: 'custom', instance_number: 1 }, [{ year: 2030, row: gains[ACTION_GAINS_RANGES.C1.dataStartRow + 20 - GAINS_FIRST_ROW] }], []);
    assert.deepEqual(
      pick(rows, { instance: 1, polluant: 'GES', famille: 'Atteinte' }).map((row) => [row.situation, row.valeur, row.unite, row.annee]),
      [
        ['objectif', 10, 'tCO2e', 2030],
        ['réel', 4, 'tCO2e', 2030],
        ['taux', 40, '%', 2030],
      ],
    );
    assert.equal(agg.gains.GES.achievement, 40);
  });

  test("l'atteinte du total suit l'accueil : cumul ex-post ÷ cumul prévisionnel", () => {
    const { gains, em } = fixture();
    const rows = rowsForFile({ context, actions: [c1()], gainsRows: gains, emRows: em });
    assert.deepEqual(
      pick(rows, { instance: 'Total', polluant: 'GES', famille: 'Atteinte' }).map((row) => [row.situation, row.valeur, row.unite, row.annee]),
      [
        ['objectif', 80, 'tCO2e', ''],
        ['réel', 20, 'tCO2e', ''],
        ['taux', 25, '%', ''],
      ],
    );
  });

  test('instances, total, brouillon, acteur', () => {
    const { gains, em } = fixture();
    put(em, EMISSIONS_FIRST_ROW, ACTION_EMISSIONS_RANGES.C1.dataStartRow + 10, 92, 50);
    const draft = { ...c1(), _id: 'a2', name: 'Brouillon', instance_number: 2, is_draft: true };
    const rows = rowsForFile({ context: { ...context, owner: 'economic_actor', actorName: 'Dupont' }, actions: [draft, c1()], gainsRows: gains, emRows: em });
    assert.deepEqual(
      pick(rows, { famille: 'Émission', situation: 'init', annee: 2020, polluant: 'GES' }).map((row) => [row.instance, row.nomFiche, row.brouillon, row.acteur, row.valeur]),
      [
        [1, 'Tournées centre', 'Non', 'Dupont', 100],
        [2, 'Brouillon', 'Oui', 'Dupont', 50],
        ['Total', 'Optimisation des tournées', '', 'Dupont', 999],
      ],
    );
  });

  test('une instance hors 1..3 est ignorée et signalée', (t) => {
    const warn = t.mock.method(console, 'warn', () => {});
    const { gains, em } = fixture();
    assert.equal(rowsForFile({ context, actions: [{ ...c1(), instance_number: 4 }], gainsRows: gains, emRows: em }).length, 0);
    assert.equal(warn.mock.callCount(), 1);
    assert.match(warn.mock.calls[0].arguments[0], /instance 4/);
  });
});

describe('script', () => {
  test('arguments', () => {
    assert.throws(() => parseArgs(['node', 'script']), /Usage/);
    const parsed = parseArgs(['node', 'script', '--collectivities', 'a,b', '--template', './t.xlsx', '--out=./out/x.xlsx']);
    assert.deepEqual(parsed, { collectivities: 'a,b', template: './t.xlsx', out: './out/x.xlsx', withAnswers: false });
    assert.equal(parseArgs(['node', 'script', '--collectivities', 'all', '--with-answers']).withAnswers, true);
    assert.throws(() => parseArgs(['node', 'script', '--collectivities=all', '--all-years']), /Option inconnue/);
    assert.throws(() => parseArgs(['node', 'script', '--collectivities', '--out', 'x']), /Valeur manquante/);
  });

  test('fichiers collectivité puis acteurs', () => {
    const collectivity = { _id: 'c1', name: 'Agglo', aggregation_excel_file_id: 'col-file' };
    const actions = [
      { _id: 'a1', owner: 'collectivity' },
      { _id: 'a2', owner: 'economic_actor', economic_actor_id: 'e1' },
      { _id: 'a3', owner: 'economic_actor', economic_actor_id: 'absent' },
    ];
    const actors = [
      { _id: 'e1', name: 'Dupont', collectivities: [{ id: 'c1', aggregation_excel_file_id: 'actor-file' }] },
      { _id: 'e2', name: 'Sans fichier', collectivities: [{ id: 'c1', aggregation_excel_file_id: '' }] },
    ];
    const built = jobsForCollectivity(collectivity, actions, actors);
    assert.equal(built.orphanActorActions, 1);
    assert.deepEqual(
      built.jobs.map((job) => [job.label, job.fileId, job.actions.map((action) => action._id)]),
      [
        ['Agglo — collectivité', 'col-file', ['a1']],
        ['Agglo — Dupont', 'actor-file', ['a2']],
      ],
    );
  });

  test('les messages d’erreur masquent une URI et un jeton', () => {
    const text = safeError(new Error('fail mongodb+srv://user:secret@host/db Bearer abc /items/01ABC'));
    assert.equal(text.includes('secret'), false);
    assert.equal(text.includes('Bearer abc'), false);
    assert.equal(text.includes('01ABC'), false);
  });

  test('onglet ajouté après Valeurs, en-tête figé, Lisez-moi', async () => {
    const wb = new ExcelJS.Workbook();
    const readme = wb.addWorksheet('Lisez-moi');
    readme.getCell('A9').value = '• Valeurs — exemple';
    wb.addWorksheet('Valeurs');
    wb.addWorksheet('Actions');
    addCalculatedValuesSheet(wb, [{ collectivite: 'CA Exemple', valeur: 12, fiche: 'C1' }]);
    addCalculatedValuesSheet(wb, [{ collectivite: 'CA Exemple', valeur: 12, fiche: 'C1' }]);
    assert.deepEqual(wb.worksheets.map((sheet) => sheet.name), ['Lisez-moi', 'Valeurs', SHEET_NAME, 'Actions']);
    const sheet = wb.getWorksheet(SHEET_NAME);
    assert.equal(sheet.getRow(1).getCell(1).font.bold, true);
    assert.equal(sheet.getRow(1).getCell(1).value, 'Collectivité');
    assert.equal(sheet.getRow(2).getCell(1).value, 'CA Exemple');
    assert.equal(sheet.views[0].state, 'frozen');
    assert.ok(sheet.autoFilter);
    assert.equal(readme.getCell('A10').value, README_BULLET);
    assert.equal(readme.getColumn(1).values.filter((value) => value === README_BULLET).length, 1);
  });

  test('réponses acteurs éco : une ligne par acteur et question active, plus les questions désactivées déjà répondues', () => {
    const actors = [
      { _id: 'ea1', name: 'Transports Un', collectivities: [{ id: 'c1', name: 'CA Exemple' }, { id: 'c2', name: 'CC Voisine' }] },
      { _id: 'ea2', name: 'Livraisons Deux', collectivities: [{ id: 'c1', name: 'CA Exemple' }] },
    ];
    const questions = [
      { _id: 'q1', label: 'Nombre de véhicules', type: 'number', value_unit: 'véh.', active: true, actions: [{ id: 'g1', name: 'C1' }] },
      { _id: 'q2', label: 'Énergies utilisées', type: 'checkbox', active: true, actions: [] },
      { _id: 'q3', label: 'Ancienne question', type: 'text', active: false, actions: [] },
    ];
    const updatedAt = new Date('2026-11-06T10:00:00Z');
    const answers = [
      { economic_actor_id: 'ea1', question_id: 'q1', value: { number: 12 }, updatedAt },
      { economic_actor_id: 'ea1', question_id: 'q2', value: { checkbox: ['Diesel', 'Électrique'] }, updatedAt },
      { economic_actor_id: 'ea2', question_id: 'q3', value: { text: 'oui' }, updatedAt },
    ];
    const rows = answerRows({ actors, questions, answers });
    assert.deepEqual(
      rows.map((row) => [row.acteur, row.question, row.reponse]),
      [
        ['Transports Un', 'Nombre de véhicules', 12],
        ['Transports Un', 'Énergies utilisées', 'Diesel, Électrique'],
        ['Livraisons Deux', 'Nombre de véhicules', ''],
        ['Livraisons Deux', 'Énergies utilisées', ''],
        ['Livraisons Deux', 'Ancienne question', 'oui'],
      ],
    );
    assert.equal(rows[0].collectivites, 'CA Exemple, CC Voisine');
    assert.equal(rows[0].fiches, 'C1');
    assert.equal(rows[0].unite, 'véh.');
    assert.equal(rows[0].misAJour, updatedAt);
    assert.equal(rows[2].misAJour, null);
    assert.equal(rows[4].active, 'Non');
  });

  test('onglet des réponses placé après les valeurs calculées', () => {
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet('Lisez-moi');
    wb.addWorksheet('Valeurs');
    wb.addWorksheet('Actions');
    addCalculatedValuesSheet(wb, []);
    addAnswersSheet(wb, [{ acteur: 'Transports Un', question: 'Nombre de véhicules', reponse: 12 }]);
    addAnswersSheet(wb, [{ acteur: 'Transports Un', question: 'Nombre de véhicules', reponse: 12 }]);
    assert.deepEqual(wb.worksheets.map((sheet) => sheet.name), ['Lisez-moi', 'Valeurs', SHEET_NAME, ANSWERS_SHEET_NAME, 'Actions']);
    const sheet = wb.getWorksheet(ANSWERS_SHEET_NAME);
    assert.equal(sheet.getRow(1).getCell(1).value, 'Acteur économique');
    assert.equal(sheet.getRow(2).getCell(1).value, 'Transports Un');
    assert.equal(sheet.rowCount, 2);
    assert.equal(sheet.views[0].state, 'frozen');
  });

  test('sortie sans les exemples fictifs ni les questions, template du dépôt intact', async () => {
    const template = path.resolve(__dirname, '../../Template_export_Interlud.xlsx');
    const before = crypto.createHash('sha256').update(fs.readFileSync(template)).digest('hex');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(template);
    addCalculatedValuesSheet(wb, []);
    const out = path.join(os.tmpdir(), `export-calculees-${process.pid}.xlsx`);
    await wb.xlsx.writeFile(out);
    assert.equal(crypto.createHash('sha256').update(fs.readFileSync(template)).digest('hex'), before);

    const check = new ExcelJS.Workbook();
    await check.xlsx.readFile(out);
    fs.unlinkSync(out);
    assert.deepEqual(check.worksheets.map((sheet) => sheet.name), ['Lisez-moi', 'Valeurs', SHEET_NAME, 'Actions', 'Collectivités', 'Acteurs économiques']);
    for (const name of ['Valeurs', 'Actions', 'Collectivités', 'Acteurs économiques']) {
      const sheet = check.getWorksheet(name);
      assert.equal(sheet.actualRowCount, 1, `${name} ne garde que l'en-tête`);
      assert.ok(sheet.getCell('A1').value);
    }
    const readme = Array.from(check.getWorksheet('Lisez-moi').getColumn(1).values, (value) => String(value || ''));
    assert.ok(!readme.some((value) => /Questions pour BL|exemple fictive|Document de travail|^\d\. /.test(value)));
    assert.equal(readme.indexOf(README_BULLET), readme.findIndex((value) => value.startsWith('• Valeurs —')) + 1);
  });
});

describe('garde-fous lecture seule', () => {
  test('le service ne déclenche pas d’écriture SharePoint', () => {
    const src = fs.readFileSync(path.join(__dirname, '../src/services/aggregationReader.js'), 'utf8');
    assert.match(src, /graphFetch\(/);
    assert.doesNotMatch(src, /graphFetchWithSession|excelSync|createWorkbookSession|duplicateExcelFile|method:\s*['"]PATCH|method:\s*['"]POST|calculate/);
  });

  test('le script ne fait que des find, et les routes réutilisent le service', () => {
    const script = fs.readFileSync(path.join(__dirname, '../script/export_calculated_values.js'), 'utf8');
    const controller = fs.readFileSync(path.join(__dirname, '../src/controllers/excel.js'), 'utf8');
    assert.match(script, /Collectivity\.find\(/);
    assert.match(script, /Action\.find\(/);
    assert.match(script, /EconomicActorAnswer\.find\(/);
    assert.doesNotMatch(script, /\.lean\(\)/);
    assert.doesNotMatch(script, /\.(save|updateOne|updateMany|insertMany|deleteOne|deleteMany|findOneAndUpdate|bulkWrite)\(/);
    assert.doesNotMatch(script, /excelSync|graphFetchWithSession|createWorkbookSession|duplicateExcelFile|Log\.create/);
    assert.match(controller, /aggregationReader/);
    assert.match(controller, /graphFetchWithSession/);
    assert.match(controller, /extractAggregation\(/);
    assert.doesNotMatch(controller, /const extractAggregation|const parseNumber|const ACTION_GAINS_RANGES/);
  });
});
