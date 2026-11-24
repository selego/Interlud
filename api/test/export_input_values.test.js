/* eslint-env node */
// Onglets des données d'entrée de l'export (Valeurs, Actions, Collectivités, Acteurs économiques).
// Lancer : npm test (aucune connexion MongoDB ni Microsoft Graph nécessaire, les modèles sont simulés en mémoire).
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const ExcelJS = require('exceljs');

const Action = require('../src/models/action');
const IndicatorValue = require('../src/models/indicator_value');
const User = require('../src/models/user');
const { SHEETS, VALUES_COLUMNS, neutralize, loadInputRows, prepareInputSheets, writeWorkbook, checkVolume } = require('../script/export_input_values');
const { addCalculatedValuesSheet, EXCEL_MAX_ROWS } = require('../script/export_calculated_values');

const COL = '64c000000000000000000001';
const OTHER_COL = '64c000000000000000000002';
const EA = '64e000000000000000000001';
const updatedAt = new Date('2026-11-20T09:30:00Z');

const collectivity = { _id: COL, name: 'CA Exemple', siren: 200012345, department: '69', population: 185000, area: 312.4, year: 2023, basedata_onboarded: true, parc_types_onboarded: false, createdAt: new Date('2025-09-02T00:00:00Z') };
const actor = { _id: EA, name: 'Transports Un', description: 'Transporteur', collectivities: [{ id: COL, name: 'CA Exemple' }, { id: OTHER_COL, name: 'CC Voisine' }], createdAt: new Date('2026-01-20T00:00:00Z') };

const actions = [
  { _id: 'cfg', type: 'config', name: 'Données de base', owner: 'collectivity', collectivity_id: COL },
  { _id: 'c1-1', type: 'custom', excel_worksheetname: 'C1', action_parent_name: 'Optimisation des tournées', name: 'Tournées centre', instance_number: 1, owner: 'collectivity', collectivity_id: COL, status: 'in_progress', year_init: 2024, exel_files_prev: [{ year_prev: 2030 }, { year_prev: 2028 }], excel_files_expost: [], completion_init: 100, budget_costs: 250000, is_subsidized_by_program: true, last_modif_by_name: 'Marie Martin', last_modif_date: updatedAt },
  { _id: 'c1-2', type: 'custom', excel_worksheetname: 'C1', action_parent_name: 'Optimisation des tournées', name: 'Tournées est', instance_number: 2, is_draft: true, owner: 'collectivity', collectivity_id: COL },
  { _id: 'c1-ae', type: 'custom', excel_worksheetname: 'C1', action_parent_name: 'Optimisation des tournées', name: '=HYPERLINK("x")', instance_number: 1, owner: 'economic_actor', economic_actor_id: EA, economic_actor_name: 'Ancien nom', collectivity_id: COL },
];

const iv = (action_id, situation, year, excelId, line, type, value, value_default, extra = {}) => ({
  action_id,
  collectivity_id: COL,
  situation,
  year,
  indicator_excel_id: excelId,
  excel_line_number: line,
  indicator_name: `Indicateur ${excelId}`,
  indicator_category_name: 'Flotte',
  indicator_type: type,
  indicator_value_unit: type === 'number' ? 'véhicules' : '',
  is_primordial: excelId === 'NbVeh',
  value: { [type]: value },
  value_default: { [type]: value_default },
  updatedAt,
  ...extra,
});

const indicatorValues = [
  iv('c1-1', 'prev', 2030, 'NbVeh', 13, 'number', 15, 17),
  iv('c1-1', 'init', 2024, 'NbVeh', 13, 'number', 350, 320),
  iv('c1-1', 'init', 2024, 'TypeVeh', 12, 'checkbox', ['VUL diesel', 'VUL électrique'], []),
  iv('c1-1', 'expost', 2030, 'NbVeh', 13, 'number', undefined, 17),
  iv('c1-1', 'ref', 2030, 'Vide', 20, 'text', '', undefined),
  iv('c1-2', 'init', 2024, 'NbVeh', 13, 'number', -4.5, -4.5),
  iv('cfg', 'init', 2024, 'NomTerr', 5, 'text', '-commentaire', 'CA Exemple'),
  iv('c1-ae', 'init', 2024, 'NbVeh', 13, 'number', 18, undefined, { owner: 'economic_actor' }),
  iv('supprimee', 'init', 2024, 'NbVeh', 13, 'number', 1, 1),
];

const mockModels = (t) => {
  const actionQueries = [];
  const ivQueries = [];
  t.mock.method(Action, 'find', (query) => {
    actionQueries.push(query);
    return Promise.resolve(actions);
  });
  t.mock.method(IndicatorValue, 'find', (query) => {
    ivQueries.push(query);
    return {
      cursor: () => ({
        async *[Symbol.asyncIterator]() {
          for (const value of indicatorValues) yield value;
        },
      }),
    };
  });
  t.mock.method(User, 'countDocuments', async () => 3);
  return { actionQueries, ivQueries };
};

const pick = (row, keys) => keys.map((key) => row[key]);

describe('onglet Valeurs', () => {
  test('une ligne par valeur saisie ou par défaut, triée, config incluse, instances et organisation', async (t) => {
    const queries = mockModels(t);
    const { orphans, sheets } = await loadInputRows({ collectivities: [collectivity], actors: [actor] });

    assert.deepEqual(queries.actionQueries, [{ collectivity_id: { $in: [COL] }, type: { $ne: 'global' } }]);
    assert.deepEqual(queries.ivQueries, [{ collectivity_id: { $in: [COL] } }]);
    assert.equal(orphans, 1);
    assert.deepEqual(
      sheets.Valeurs.map((row) => pick(row, ['proprietaire', 'acteur', 'fiche', 'nomFiche', 'instance', 'brouillon', 'situation', 'annee', 'idExcel', 'ligneExcel', 'valeurSaisie', 'valeurDefaut', 'valeurModifiee'])),
      [
        ['collectivity', '', 'CONFIG', 'Données de base', 1, 'Non', 'init', 2024, 'NomTerr', 5, '-commentaire', 'CA Exemple', 'Oui'],
        ['collectivity', '', 'C1', 'Tournées centre', 1, 'Non', 'init', 2024, 'TypeVeh', 12, 'VUL diesel; VUL électrique', null, 'Oui'],
        ['collectivity', '', 'C1', 'Tournées centre', 1, 'Non', 'init', 2024, 'NbVeh', 13, 350, 320, 'Oui'],
        ['collectivity', '', 'C1', 'Tournées centre', 1, 'Non', 'prev', 2030, 'NbVeh', 13, 15, 17, 'Oui'],
        ['collectivity', '', 'C1', 'Tournées centre', 1, 'Non', 'expost', 2030, 'NbVeh', 13, null, 17, ''],
        ['collectivity', '', 'C1', 'Tournées est', 2, 'Oui', 'init', 2024, 'NbVeh', 13, -4.5, -4.5, 'Non'],
        ['economic_actor', 'Transports Un', 'C1', '=HYPERLINK("x")', 1, 'Non', 'init', 2024, 'NbVeh', 13, 18, null, 'Oui'],
      ],
    );
    const first = sheets.Valeurs[2];
    assert.equal(first.collectivite, 'CA Exemple');
    assert.equal(first.siren, 200012345);
    assert.equal(first.actionReference, 'Optimisation des tournées');
    assert.equal(first.indicateur, 'Indicateur NbVeh');
    assert.equal(first.unite, 'véhicules');
    assert.equal(first.primordial, 'Oui');
    assert.equal(first.misAJour, updatedAt);
    assert.equal(sheets.Valeurs[0].actionReference, 'Données de base');
  });

  test('Actions, Collectivités, Acteurs économiques : fiches hors configuration', async (t) => {
    mockModels(t);
    const { sheets } = await loadInputRows({ collectivities: [collectivity], actors: [actor] });
    assert.deepEqual(
      sheets.Actions.map((row) => pick(row, ['proprietaire', 'acteur', 'fiche', 'nomFiche', 'instance', 'brouillon', 'anneesPrev'])),
      [
        ['collectivity', '', 'C1', 'Tournées centre', 1, 'Non', '2028; 2030'],
        ['collectivity', '', 'C1', 'Tournées est', 2, 'Oui', ''],
        ['economic_actor', 'Transports Un', 'C1', '=HYPERLINK("x")', 1, 'Non', ''],
      ],
    );
    assert.equal(sheets.Actions[0].budget, 250000);
    assert.equal(sheets.Actions[0].subventionnee, 'Oui');
    assert.deepEqual(sheets['Collectivités'].map((row) => pick(row, ['collectivite', 'siren', 'donneesBase', 'parcTypes', 'nbFiches', 'nbActeurs', 'nbUtilisateurs'])), [['CA Exemple', 200012345, 'Oui', 'Non', 2, 1, 3]]);
    assert.deepEqual(sheets['Acteurs économiques'].map((row) => pick(row, ['acteur', 'collectivites', 'nbFiches'])), [['Transports Un', 'CA Exemple; CC Voisine', 1]]);
  });
});

describe('fichier produit', () => {
  test('onglets du template remplis sous leur en-tête, types des cellules, formules neutralisées', async (t) => {
    mockModels(t);
    const { sheets } = await loadInputRows({ collectivities: [collectivity], actors: [actor] });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(path.resolve(__dirname, '../../Template_export_Interlud.xlsx'));
    addCalculatedValuesSheet(wb, [{ collectivite: 'CA Exemple', valeur: -12, fiche: 'C1' }]);
    const appended = prepareInputSheets(wb, sheets);
    const out = path.join(os.tmpdir(), `export-entrees-${process.pid}.xlsx`);
    await writeWorkbook(wb, out, appended);
    const check = new ExcelJS.Workbook();
    await check.xlsx.readFile(out);
    fs.unlinkSync(out);

    assert.deepEqual(check.worksheets.map((sheet) => sheet.name), ['Lisez-moi', 'Valeurs', 'Valeurs calculées', 'Actions', 'Collectivités', 'Acteurs économiques']);
    assert.equal(check.getWorksheet('Lisez-moi').getCell('A1').value, 'Export des données Interlud+', 'feuilles du template recopiées');
    assert.equal(check.getWorksheet('Lisez-moi').getColumn(1).width, 140);
    assert.equal(check.getWorksheet('Valeurs calculées').getRow(2).getCell(15).value, -12, 'onglet Valeurs calculées recopié');
    const values = check.getWorksheet('Valeurs');
    assert.equal(values.actualRowCount, 8);
    assert.equal(values.autoFilter, 'A1:Y8');
    assert.deepEqual(values.getRow(1).values.slice(1), VALUES_COLUMNS.map(([label]) => label));
    assert.equal(values.getRow(1).getCell(1).fill?.fgColor?.argb, 'FF1F3A5F', "l'en-tête du template est gardé");
    const col = (key) => VALUES_COLUMNS.findIndex(([, k]) => k === key) + 1;
    const row = (n) => values.getRow(n);
    assert.equal(row(4).getCell(col('valeurSaisie')).value, 350);
    assert.equal(row(4).getCell(col('valeurSaisie')).type, ExcelJS.ValueType.Number);
    assert.equal(row(7).getCell(col('valeurSaisie')).value, -4.5, 'un nombre négatif reste un nombre');
    assert.equal(row(4).getCell(col('siren')).type, ExcelJS.ValueType.Number);
    assert.equal(row(4).getCell(col('ligneExcel')).value, 13);
    assert.equal(row(4).getCell(col('annee')).type, ExcelJS.ValueType.Number);
    assert.equal(row(4).getCell(col('misAJour')).type, ExcelJS.ValueType.Date);
    assert.equal(row(4).getCell(col('misAJour')).numFmt, 'dd/mm/yyyy hh:mm');
    assert.equal(row(6).getCell(col('valeurSaisie')).value, null, 'valeur non saisie : cellule vide');
    assert.equal(row(2).getCell(col('valeurSaisie')).value, "'-commentaire");
    assert.equal(row(8).getCell(col('nomFiche')).value, '\'=HYPERLINK("x")');
    assert.equal(values.views[0].state, 'frozen');
    assert.ok(values.autoFilter);

    const actionsSheet = check.getWorksheet('Actions');
    assert.equal(actionsSheet.actualRowCount, 4);
    assert.equal(actionsSheet.getRow(2).getCell(21).value, 250000);
    assert.equal(check.getWorksheet('Collectivités').getRow(2).getCell(9).type, ExcelJS.ValueType.Number, 'nombre, plus de formule');
    assert.equal(check.getWorksheet('Acteurs économiques').actualRowCount, 2);
  });

  test('neutralisation : textes en formule préfixés, nombres intacts', () => {
    assert.equal(neutralize('=1+1'), "'=1+1");
    assert.equal(neutralize('+33 6'), "'+33 6");
    assert.equal(neutralize('@SOMME(A1)'), "'@SOMME(A1)");
    assert.equal(neutralize('-x'), "'-x");
    assert.equal(neutralize('\tx'), "'\tx");
    assert.equal(neutralize('-12,5'), '-12,5');
    assert.equal(neutralize('-'), '-', 'choix « - » des listes');
    assert.equal(neutralize('-=1'), "'-=1");
    assert.equal(neutralize(-12.5), -12.5);
    assert.equal(neutralize('Lyon'), 'Lyon');
    assert.equal(neutralize(null), null);
  });

  test('template modifié : export refusé plutôt que colonnes décalées', () => {
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet('Valeurs').getRow(1).values = ['Collectivité', 'Autre'];
    assert.throws(() => prepareInputSheets(wb, { Valeurs: [] }), /colonne 2 de « Valeurs »/);
  });

  test('garde-fou volume : au-delà de la limite Excel, rien n’est écrit', () => {
    const wb = new ExcelJS.Workbook();
    for (const { name } of SHEETS) wb.addWorksheet(name);
    assert.throws(() => prepareInputSheets(wb, { Valeurs: new Array(EXCEL_MAX_ROWS) }), /« Valeurs » compterait 1048577 lignes/);
    assert.equal(wb.getWorksheet('Valeurs').actualRowCount, 0);
    assert.doesNotThrow(() => checkVolume({ Valeurs: new Array(EXCEL_MAX_ROWS - 1) }));
  });
});

describe('droits et lecture seule', () => {
  test('aucune route ne sert ces onglets : seul le script hors ligne les produit', () => {
    const controllers = path.join(__dirname, '../src/controllers');
    for (const file of fs.readdirSync(controllers)) assert.doesNotMatch(fs.readFileSync(path.join(controllers, file), 'utf8'), /require\([^)]*script\//, file);
  });

  test('lecture en base uniquement, sans SharePoint', () => {
    const src = fs.readFileSync(path.join(__dirname, '../script/export_input_values.js'), 'utf8');
    assert.match(src, /IndicatorValue\.find\(/);
    assert.doesNotMatch(src, /\.lean\(\)|\.select\(/);
    assert.doesNotMatch(src, /\.(save|create|updateOne|updateMany|insertMany|deleteOne|deleteMany|findOneAndUpdate|bulkWrite)\(/);
    assert.doesNotMatch(src, /microsoftGraph|aggregationReader|excelSync|graphFetch|Log\b/);
  });
});
