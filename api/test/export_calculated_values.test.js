/* eslint-env node */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const ExcelJS = require('exceljs');

const {
  GAINS_WORKSHEET,
  EMISSIONS_WORKSHEET,
  GAINS_FIRST_ROW,
  GAINS_LAST_ROW,
  EMISSIONS_FIRST_ROW,
  EMISSIONS_LAST_ROW,
  ACTION_GAINS_RANGES,
  ACTION_EMISSIONS_RANGES,
  GAIN_COLUMNS,
  parseNumber,
  extractAggregation,
  columnLetter,
  sheetRangeAddress,
  actionBlockAddress,
  isOversizedRangeError,
  readAggregationBlocks,
  sliceActionYearRows,
  cellNumber,
  usefulYears,
  buildCalculatedValueRows,
  rowsForFile,
} = require('../src/services/aggregationReader');

const { parseArgs, jobsForCollectivity, addCalculatedValuesSheet, safeError, README_BULLET, SHEET_NAME, runWithConcurrency } = require('../script/export_calculated_values');

const blankSheet = (first, last) => Array.from({ length: last - first + 1 }, () => []);

const put = (rows, first, excelRow, col, value) => {
  const line = rows[excelRow - first];
  while (line.length <= col) line.push(null);
  line[col] = value;
};

const c1 = () => ({
  _id: 'a1',
  excel_worksheetname: 'C1',
  name: 'Tournées centre',
  action_parent_name: 'Optimisation des tournées',
  instance_number: 1,
  is_draft: false,
  owner: 'collectivity',
  year_init: 2020,
  exel_files_prev: [{ year_prev: 2030, year_ref: 2025 }],
  excel_files_expost: [{ year_expost: 2030, year_ref: 2025 }],
});

const fixture = () => {
  const gains = blankSheet(GAINS_FIRST_ROW, GAINS_LAST_ROW);
  const em = blankSheet(EMISSIONS_FIRST_ROW, EMISSIONS_LAST_ROW);
  const emStart = ACTION_EMISSIONS_RANGES.C1.dataStartRow;
  const gainsStart = ACTION_GAINS_RANGES.C1.dataStartRow;
  const col = 48;
  put(em, EMISSIONS_FIRST_ROW, emStart + (2015 - 2010), col, 1);
  put(em, EMISSIONS_FIRST_ROW, emStart + (2020 - 2010), col, 100);
  put(em, EMISSIONS_FIRST_ROW, emStart + (2030 - 2010), col + 2, 80);
  put(em, EMISSIONS_FIRST_ROW, emStart + (2030 - 2010), col + 3, 70);
  put(gains, GAINS_FIRST_ROW, gainsStart + (2020 - 2010), col, 0);
  put(gains, GAINS_FIRST_ROW, gainsStart + (2030 - 2010), col, -5);
  put(gains, GAINS_FIRST_ROW, gainsStart + (2030 - 2010), col + 1, -6);
  put(gains, GAINS_FIRST_ROW, gainsStart + (2030 - 2010), col + 2, -10);
  put(gains, GAINS_FIRST_ROW, gainsStart + (2030 - 2010), col + 3, -7);
  put(gains, GAINS_FIRST_ROW, gainsStart + (2030 - 2010), col + 4, -4);
  put(gains, GAINS_FIRST_ROW, gainsStart + (2030 - 2010), col + 5, -1);
  put(em, EMISSIONS_FIRST_ROW, emStart + (2020 - 2010), 4, 999);
  return { gains, em, emStart, gainsStart, col };
};

describe('mapping des colonnes', () => {
  test('lettres de colonnes du bloc total et des instances', () => {
    assert.equal(columnLetter(0), 'A');
    assert.equal(columnLetter(4), 'E');
    assert.equal(columnLetter(44), 'AS');
    assert.equal(columnLetter(48), 'AW');
    assert.equal(columnLetter(88), 'CK');
    assert.equal(columnLetter(92), 'CO');
    assert.equal(columnLetter(132), 'EC');
    assert.equal(columnLetter(136), 'EG');
    assert.equal(columnLetter(176), 'FU');
  });

  test('plages complètes et blocs', () => {
    assert.equal(GAINS_FIRST_ROW, 19);
    assert.equal(GAINS_LAST_ROW, 572);
    assert.equal(EMISSIONS_FIRST_ROW, 21);
    assert.equal(EMISSIONS_LAST_ROW, 574);
    assert.equal(sheetRangeAddress(GAINS_FIRST_ROW, GAINS_LAST_ROW), 'A19:FU572');
    assert.equal(sheetRangeAddress(EMISSIONS_FIRST_ROW, EMISSIONS_LAST_ROW), 'A21:FU574');
    assert.equal(actionBlockAddress(19), 'A19:FU59');
    assert.equal(actionBlockAddress(190), 'A190:FU230');
  });

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
    assert.equal(agg.gains.GES.yearlyData[0].ecartRefInit, 0);
    assert.equal(agg.gains.GES.yearlyData[0].ecartPrevRef, 0);
  });
});

describe('parseNumber et cellules', () => {
  test('parseNumber conserve le comportement du dashboard', () => {
    assert.equal(parseNumber(null), 0);
    assert.equal(parseNumber(''), 0);
    assert.equal(parseNumber('1 234,5'), 1234.5);
    assert.equal(parseNumber('nope'), 0);
    assert.equal(parseNumber(-3), -3);
  });

  test('cellNumber distingue vide et zéro', () => {
    assert.equal(cellNumber(null), null);
    assert.equal(cellNumber(''), null);
    assert.equal(cellNumber('  '), null);
    assert.equal(cellNumber(0), 0);
    assert.equal(cellNumber('#N/A'), null);
    assert.equal(cellNumber('1 234,5'), 1234.5);
    assert.equal(cellNumber({ result: '8' }), 8);
  });
});

describe('lignes Valeurs calculées', () => {
  test('années utiles, source, gains signés et atteinte alignée sur extractAggregation', () => {
    const { gains, em } = fixture();
    const action = c1();
    const gainsYearRows = sliceActionYearRows(gains, GAINS_FIRST_ROW, ACTION_GAINS_RANGES.C1.dataStartRow);
    const emYearRows = sliceActionYearRows(em, EMISSIONS_FIRST_ROW, ACTION_EMISSIONS_RANGES.C1.dataStartRow);
    const agg = extractAggregation({ type: 'custom', instance_number: 1 }, gainsYearRows, emYearRows);
    const rows = buildCalculatedValueRows({
      collectivityName: 'CA Exemple',
      siren: 200012345,
      department: '69',
      owner: 'collectivity',
      actorName: '',
      action,
      instance: 1,
      gainsYearRows,
      emYearRows,
      includeZero: false,
      extractedAt: '2026-11-05',
    });

    assert.equal(agg.gains.GES.objective, 10);
    assert.equal(agg.gains.GES.real, 4);
    assert.equal(agg.gains.GES.achievement, 40);
    assert.equal(agg.score, 40);
    assert.ok(!rows.some((row) => row.annee === 2015));
    assert.ok(!rows.some((row) => row.annee === 2020 && row.famille === 'Gain'));

    const init = rows.find((row) => row.famille === 'Émission' && row.situation === 'init');
    assert.equal(init.valeur, 100);
    assert.equal(init.source, `${EMISSIONS_WORKSHEET}!AW202`);
    assert.equal(init.anneeRef, '');
    assert.equal(init.polluant, 'GES');
    assert.equal(init.unite, 'tCO2e');
    assert.equal(init.brouillon, 'Non');
    assert.equal(init.siren, 200012345);

    const prev = rows.find((row) => row.famille === 'Émission' && row.situation === 'prev');
    assert.equal(prev.valeur, 80);
    assert.equal(prev.annee, 2030);
    assert.equal(prev.anneeRef, 2025);
    assert.equal(prev.source, `${EMISSIONS_WORKSHEET}!AY212`);

    const gaps = rows.filter((row) => row.famille === 'Gain' && row.polluant === 'GES').map((row) => [row.situation, row.valeur, row.source]);
    assert.deepEqual(gaps, [
      ['Réf-Init', -5, `${GAINS_WORKSHEET}!AW210`],
      ['Prév-Init', -6, `${GAINS_WORKSHEET}!AX210`],
      ['Prév-Réf', -10, `${GAINS_WORKSHEET}!AY210`],
      ['Expost-Init', -7, `${GAINS_WORKSHEET}!AZ210`],
      ['Expost-Réf', -4, `${GAINS_WORKSHEET}!BA210`],
      ['Expost-Prév', -1, `${GAINS_WORKSHEET}!BB210`],
    ]);

    const attainment = rows.filter((row) => row.famille === 'Atteinte');
    assert.deepEqual(
      attainment.map((row) => [row.situation, row.valeur, row.unite, row.annee]),
      [
        ['objectif', 10, 'tCO2e', 2030],
        ['réel', 4, 'tCO2e', 2030],
        ['taux', 40, '%', 2030],
      ],
    );
    assert.equal(attainment[0].valeur, agg.gains.GES.objective);
    assert.equal(attainment[1].valeur, agg.gains.GES.real);
    assert.equal(attainment[2].valeur, agg.gains.GES.achievement);
    assert.equal(attainment[2].source, `${GAINS_WORKSHEET}!AY210; ${GAINS_WORKSHEET}!BA210`);
  });

  test('--all-years et --include-zero', () => {
    const { gains, em } = fixture();
    const action = c1();
    const gainsYearRows = sliceActionYearRows(gains, GAINS_FIRST_ROW, ACTION_GAINS_RANGES.C1.dataStartRow);
    const emYearRows = sliceActionYearRows(em, EMISSIONS_FIRST_ROW, ACTION_EMISSIONS_RANGES.C1.dataStartRow);
    const rows = buildCalculatedValueRows({ action, instance: 1, gainsYearRows, emYearRows, allYears: true, includeZero: true, extractedAt: '2026-11-05' });
    assert.ok(rows.some((row) => row.annee === 2015 && row.valeur === 1));
    assert.ok(rows.some((row) => row.annee === 2020 && row.famille === 'Gain' && row.valeur === 0));
  });

  test("l'atteinte est émise même hors années utiles, et le taux est omis si l'objectif est nul", () => {
    const gains = blankSheet(GAINS_FIRST_ROW, GAINS_LAST_ROW);
    const em = blankSheet(EMISSIONS_FIRST_ROW, EMISSIONS_LAST_ROW);
    const gainsStart = ACTION_GAINS_RANGES.B2.dataStartRow;
    put(gains, GAINS_FIRST_ROW, gainsStart + (2040 - 2010), 52, -4);
    const action = { excel_worksheetname: 'B2', name: 'ZFE', action_parent_name: 'ZFE', instance_number: 1, year_init: 2020 };
    const rows = buildCalculatedValueRows({
      action,
      instance: 1,
      gainsYearRows: sliceActionYearRows(gains, GAINS_FIRST_ROW, gainsStart),
      emYearRows: sliceActionYearRows(em, EMISSIONS_FIRST_ROW, ACTION_EMISSIONS_RANGES.B2.dataStartRow),
      extractedAt: '2026-11-05',
    });
    assert.deepEqual(
      rows.map((row) => [row.famille, row.situation, row.valeur, row.annee, row.anneeRef]),
      [['Atteinte', 'réel', 4, 2040, '']],
    );
  });

  test('instance et total, brouillon, acteur', () => {
    const { gains, em } = fixture();
    const emStart = ACTION_EMISSIONS_RANGES.C1.dataStartRow;
    const gainsStart = ACTION_GAINS_RANGES.C1.dataStartRow;
    put(em, EMISSIONS_FIRST_ROW, emStart + (2020 - 2010), 92, 50);
    put(gains, GAINS_FIRST_ROW, gainsStart + (2030 - 2010), 6, -10);
    put(gains, GAINS_FIRST_ROW, gainsStart + (2030 - 2010), 8, -4);
    const draft = { ...c1(), _id: 'a2', name: 'Brouillon', instance_number: 2, is_draft: true };
    const rows = rowsForFile({
      collectivityName: 'CA Exemple',
      siren: 200012345,
      department: '69',
      owner: 'economic_actor',
      actorName: 'Transports Dupont',
      actions: [draft, c1()],
      gainsRows: gains,
      emRows: em,
      extractedAt: '2026-11-05',
    });
    const instances = rows.filter((row) => row.famille === 'Émission' && row.situation === 'init' && row.annee === 2020);
    assert.deepEqual(
      instances.map((row) => [row.instance, row.nomFiche, row.brouillon, row.acteur, row.source]),
      [
        [1, 'Tournées centre', 'Non', 'Transports Dupont', `${EMISSIONS_WORKSHEET}!AW202`],
        [2, 'Brouillon', 'Oui', 'Transports Dupont', `${EMISSIONS_WORKSHEET}!CO202`],
        ['Total', 'Optimisation des tournées', '', 'Transports Dupont', `${EMISSIONS_WORKSHEET}!E202`],
      ],
    );
    const totalAtt = rows.find((row) => row.instance === 'Total' && row.famille === 'Atteinte' && row.situation === 'objectif');
    const gainsYearRows = sliceActionYearRows(gains, GAINS_FIRST_ROW, ACTION_GAINS_RANGES.C1.dataStartRow);
    const emYearRows = sliceActionYearRows(em, EMISSIONS_FIRST_ROW, ACTION_EMISSIONS_RANGES.C1.dataStartRow);
    assert.equal(totalAtt.valeur, extractAggregation({ type: 'global' }, gainsYearRows, emYearRows).gains.GES.objective);
  });

  test('une instance hors 1..3 est ignorée', () => {
    const { gains, em } = fixture();
    const rows = rowsForFile({ actions: [{ ...c1(), instance_number: 4 }], gainsRows: gains, emRows: em, extractedAt: '2026-11-05' });
    assert.equal(rows.length, 0);
  });

  test('années utiles', () => {
    const years = usefulYears({ year_init: 2020, year_ref: 2024, exel_files_prev: [{ year_prev: 2030, year_ref: 2025 }], excel_files_expost: [], year_expost: 2031 });
    assert.deepEqual([...years].sort(), [2020, 2024, 2025, 2030, 2031]);
  });
});

describe('lecture des plages', () => {
  test('une plage complète réussie ne redécoupe pas', async () => {
    const calls = [];
    const { gainsRows, emRows } = await readAggregationBlocks('file', {
      fetchRange: async (worksheet, address) => {
        calls.push([worksheet, address]);
        return worksheet === GAINS_WORKSHEET ? [['g']] : [['e']];
      },
    });
    assert.deepEqual(calls, [
      [GAINS_WORKSHEET, 'A19:FU572'],
      [EMISSIONS_WORKSHEET, 'A21:FU574'],
    ]);
    assert.deepEqual(gainsRows, [['g']]);
    assert.deepEqual(emRows, [['e']]);
  });

  test('un 504 découpe par bloc et aligne les lignes', async () => {
    const calls = [];
    const { gainsRows, emRows } = await readAggregationBlocks('file', {
      fetchRange: async (worksheet, address) => {
        calls.push(address);
        if (address === 'A19:FU572' || address === 'A21:FU574') throw new Error('Graph API error: 504');
        const start = Number(address.slice(1, address.indexOf(':')));
        return Array.from({ length: 41 }, (_, i) => [`${worksheet}:${start + i}`]);
      },
    });
    assert.equal(gainsRows.length, 572 - 19 + 1);
    assert.equal(emRows.length, 574 - 21 + 1);
    assert.deepEqual(gainsRows[190 - 19], [`${GAINS_WORKSHEET}:190`]);
    assert.deepEqual(gainsRows[60 - 19], []);
    assert.deepEqual(emRows[192 - 21], [`${EMISSIONS_WORKSHEET}:192`]);
    assert.ok(calls.includes('A190:FU230'));
    assert.equal(calls.filter((address) => address === 'A19:FU572').length, 1);
  });

  test('une erreur autre qu’un timeout ou un 504 est propagée', async () => {
    await assert.rejects(
      () => readAggregationBlocks('file', { fetchRange: async () => { throw new Error('Graph API error: 403'); } }),
      /403/,
    );
  });

  test('détection timeout', () => {
    assert.equal(isOversizedRangeError(Object.assign(new Error('aborted'), { name: 'TimeoutError' })), true);
    assert.equal(isOversizedRangeError(new Error('The operation was aborted due to timeout')), true);
    assert.equal(isOversizedRangeError(new Error('Graph API error: 404')), false);
  });
});

describe('script', () => {
  test('arguments', () => {
    assert.throws(() => parseArgs(['node', 'script']), /Usage/);
    const parsed = parseArgs(['node', 'script', '--collectivities', 'a,b', '--template', './t.xlsx', '--out', './out/x.xlsx', '--include-zero', 'false', '--concurrency', '3', '--all-years']);
    assert.equal(parsed.collectivities, 'a,b');
    assert.equal(parsed.template, './t.xlsx');
    assert.equal(parsed.out, './out/x.xlsx');
    assert.equal(parsed.includeZero, false);
    assert.equal(parsed.concurrency, 3);
    assert.equal(parsed.allYears, true);
    assert.equal(parseArgs(['node', 'script', '--collectivities=all', '--include-zero=true']).includeZero, true);
    assert.equal(parseArgs(['node', 'script', '--collectivities=all', '--include-zero']).includeZero, true);
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

  test('concurrence plafonnée', async () => {
    let current = 0;
    let max = 0;
    await runWithConcurrency([1, 2], 2, async () => {
      current += 1;
      max = Math.max(max, current);
      await new Promise((resolve) => setTimeout(resolve, 700));
      current -= 1;
    });
    assert.equal(max, 2);
  });

  test('onglet ajouté après Valeurs, en-tête figé, Lisez-moi', async () => {
    const wb = new ExcelJS.Workbook();
    const readme = wb.addWorksheet('Lisez-moi');
    readme.getCell('A9').value = '• Valeurs — exemple';
    readme.getCell('A9').font = { name: 'Arial', size: 10 };
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
    assert.equal(sheet.views[0].ySplit, 1);
    assert.ok(sheet.autoFilter);
    const bullets = [];
    readme.eachRow((row) => {
      const value = row.getCell(1).value;
      if (typeof value === 'string' && value.includes('Valeurs calculées')) bullets.push(value);
    });
    assert.deepEqual(bullets, [README_BULLET]);

    const buf = await wb.xlsx.writeBuffer();
    const reloaded = new ExcelJS.Workbook();
    await reloaded.xlsx.load(buf);
    assert.deepEqual(reloaded.worksheets.map((s) => s.name), ['Lisez-moi', 'Valeurs', SHEET_NAME, 'Actions']);
    assert.equal(reloaded.getWorksheet(SHEET_NAME).views[0].state, 'frozen');
  });

  test('le template du dépôt n’est pas modifié', async () => {
    const template = path.resolve(__dirname, '../../Template_export_Interlud.xlsx');
    const before = crypto.createHash('sha256').update(fs.readFileSync(template)).digest('hex');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(template);
    addCalculatedValuesSheet(wb, []);
    const out = path.join(os.tmpdir(), `export-calculees-${process.pid}.xlsx`);
    await wb.xlsx.writeFile(out);
    const after = crypto.createHash('sha256').update(fs.readFileSync(template)).digest('hex');
    assert.equal(before, after);
    const check = new ExcelJS.Workbook();
    await check.xlsx.readFile(out);
    assert.deepEqual(check.worksheets.map((sheet) => sheet.name), ['Lisez-moi', 'Valeurs', SHEET_NAME, 'Actions', 'Collectivités', 'Acteurs économiques']);
    assert.equal(check.getWorksheet('Valeurs').getCell('A2').value, 'CA Exemple Agglo');
    assert.match(String(check.getWorksheet('Lisez-moi').getCell('A13').value), /Valeurs calculées/);
    assert.match(String(check.getWorksheet('Lisez-moi').getCell('A9').value), /onglet principal/);
    fs.unlinkSync(out);
  });
});

describe('garde-fous lecture seule', () => {
  test('le service ne déclenche pas d’écriture SharePoint', () => {
    const src = fs.readFileSync(path.join(__dirname, '../src/services/aggregationReader.js'), 'utf8');
    assert.match(src, /graphFetch\(/);
    assert.doesNotMatch(src, /graphFetchWithSession|excelSync|createWorkbookSession|duplicateExcelFile|method:\s*['"]PATCH|method:\s*['"]POST|calculate/);
  });

  test('le script ne fait que find/lean, et les routes réutilisent le service', () => {
    const script = fs.readFileSync(path.join(__dirname, '../script/export_calculated_values.js'), 'utf8');
    const controller = fs.readFileSync(path.join(__dirname, '../src/controllers/excel.js'), 'utf8');
    assert.match(script, /Collectivity\.find\(/);
    assert.match(script, /Action\.find\(/);
    assert.match(script, /\.lean\(\)/);
    assert.doesNotMatch(script, /\.(save|updateOne|updateMany|insertMany|deleteOne|deleteMany|findOneAndUpdate|bulkWrite)\(/);
    assert.doesNotMatch(script, /excelSync|graphFetchWithSession|createWorkbookSession|duplicateExcelFile|Log\.create/);
    assert.match(controller, /aggregationReader/);
    assert.match(controller, /graphFetchWithSession/);
    assert.match(controller, /extractAggregation\(/);
    assert.doesNotMatch(controller, /const extractAggregation|const parseNumber|const ACTION_GAINS_RANGES/);
  });
});
