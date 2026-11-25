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
const { SHEETS, VALUES_COLUMNS, HEADER_NOTES, README_LINES, neutralize, sameValue, valueRow, loadInputRows, prepareInputSheets, writeWorkbook, checkVolume } = require('../script/export_input_values');
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
  { _id: 'c1-ae', type: 'custom', excel_worksheetname: 'C1', action_parent_name: 'Optimisation des tournées', name: '=HYPERLINK("x")', instance_number: 1, year_init: 2024, owner: 'economic_actor', economic_actor_id: EA, economic_actor_name: 'Ancien nom', collectivity_id: COL },
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

// Modèles simulés. IndicatorValue.find sert le curseur principal et la requête des valeurs sources des conditions d'affichage.
const mockModels = (t, { values = indicatorValues, total } = {}) => {
  const actionQueries = [];
  const ivQueries = [];
  const countQueries = [];
  t.mock.method(Action, 'find', (query) => {
    actionQueries.push(query);
    return Promise.resolve(actions);
  });
  t.mock.method(IndicatorValue, 'countDocuments', async (query) => {
    countQueries.push(query);
    return total ?? values.length;
  });
  t.mock.method(IndicatorValue, 'find', (query) => {
    ivQueries.push(query);
    const docs = query.indicator_excel_id ? values.filter((value) => query.indicator_excel_id.$in.includes(value.indicator_excel_id)) : values;
    const chain = {
      select: () => chain,
      lean: () => chain,
      cursor: () => ({
        async *[Symbol.asyncIterator]() {
          for (const value of docs) yield value;
        },
      }),
      then: (resolve, reject) => Promise.resolve(docs).then(resolve, reject),
    };
    return chain;
  });
  const aggregate = t.mock.method(User, 'aggregate', async () => [{ _id: COL, count: 3 }]);
  return { actionQueries, ivQueries, countQueries, aggregate };
};

const noteText = (cell) => (typeof cell.note === 'string' ? cell.note : (cell.note?.texts || []).map((part) => part.text).join(''));

const pick = (row, keys) => keys.map((key) => row[key]);

describe('onglet Valeurs', () => {
  test('une ligne par valeur saisie ou par défaut, triée, config incluse, instances et organisation', async (t) => {
    const queries = mockModels(t);
    const { orphans, sheets } = await loadInputRows({ collectivities: [collectivity], actors: [actor] });

    assert.deepEqual(queries.countQueries, [{ collectivity_id: { $in: [COL] } }]);
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
    const { aggregate } = mockModels(t);
    const empty = { _id: OTHER_COL, name: 'CC Sans activité', siren: 200099999 };
    const { sheets } = await loadInputRows({ collectivities: [collectivity, empty], actors: [actor] });
    assert.equal(aggregate.mock.callCount(), 1, 'utilisateurs approuvés comptés en une seule agrégation');
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
    assert.deepEqual(
      sheets['Collectivités'].map((row) => pick(row, ['collectivite', 'siren', 'donneesBase', 'parcTypes', 'nbFiches', 'nbActeurs', 'nbUtilisateurs'])),
      [['CA Exemple', 200012345, 'Oui', 'Non', 2, 1, 3]],
      'collectivité sans utilisateur approuvé ni fiche absente',
    );
    assert.deepEqual(sheets['Acteurs économiques'].map((row) => pick(row, ['acteur', 'collectivites', 'nbFiches'])), [['Transports Un', 'CA Exemple; CC Voisine', 1]]);
  });

  test('valeurs 0 et false conservées', () => {
    const context = { collectivity, action: actions[1] };
    const zero = valueRow(iv('c1-1', 'init', 2024, 'NbVeh', 13, 'number', 0, 5), context);
    assert.equal(zero.valeurSaisie, 0);
    assert.equal(zero.valeurModifiee, 'Oui');
    const no = valueRow(iv('c1-1', 'init', 2024, 'Choix', 14, 'radio', false, undefined), context);
    assert.equal(no.valeurSaisie, false);
    assert.equal(valueRow(iv('c1-1', 'init', 2024, 'Zero', 15, 'number', undefined, 0), context).valeurDefaut, 0);
  });

  test('valeur modifiée : nombres comparés aux erreurs d’arrondi près', () => {
    assert.equal(sameValue(58.00000000000001, 57.99999999999999), true);
    assert.equal(sameValue(0.1 + 0.2, 0.3), true);
    assert.equal(sameValue(58, 58.01), false);
    assert.equal(sameValue(0, 1e-6), false);
    assert.equal(sameValue('58', 58), false);
    assert.equal(valueRow(iv('c1-1', 'init', 2024, 'NbVeh', 13, 'number', 58.00000000000001, 57.99999999999999), { collectivity, action: actions[1] }).valeurModifiee, 'Non');
  });

  test('condition d’affichage : une valeur masquée dans l’état actuel de la fiche n’est pas exportée', async (t) => {
    const cond = (value) => ({ operator: 'AND', conditions: [{ type: 'equals', excel_indicator_id: 'Motor', value }] });
    const values = [
      iv('c1-1', 'init', 2024, 'Motor', 30, 'radio', 'Diesel', undefined),
      iv('c1-1', 'init', 2024, 'Masquee', 31, 'number', 7, 7, { display_condition: cond('Électrique') }),
      iv('c1-1', 'init', 2024, 'Affichee', 32, 'number', 8, 8, { display_condition: cond('Diesel') }),
      // Même indicateur source chez l'acteur économique : n'influe pas sur les fiches de la collectivité.
      iv('c1-ae', 'init', 2024, 'Motor', 30, 'radio', 'Électrique', undefined, { owner: 'economic_actor', economic_actor_id: EA }),
      iv('c1-ae', 'init', 2024, 'AffEA', 31, 'number', 9, 9, { owner: 'economic_actor', economic_actor_id: EA, display_condition: cond('Électrique') }),
      // Indicateur technique jamais affiché (HIDDEN_IDS) : pas de ligne, même sans condition.
      iv('c1-1', 'init', 2024, 'ActionsCharte', 3, 'checkbox', ['C1'], []),
      // Condition jamais visible.
      iv('c1-1', 'init', 2024, 'Jamais', 33, 'number', 1, 1, { display_condition: { operator: 'AND', conditions: [{ type: 'neverVisible' }] } }),
    ].map((value) => ({ owner: 'collectivity', ...value }));
    const queries = mockModels(t, { values });
    const { sheets, stats } = await loadInputRows({ collectivities: [collectivity], actors: [actor] });
    assert.deepEqual(sheets.Valeurs.map((row) => row.idExcel).sort(), ['AffEA', 'Affichee', 'Motor', 'Motor']);
    assert.equal(stats.hidden, 2);
    assert.equal(stats.neverDisplayed, 1);
    assert.equal(queries.ivQueries.length, 2, 'une seule requête pour les valeurs sources, pas une par ligne');
    assert.deepEqual(queries.ivQueries[1].indicator_excel_id, { $in: ['Motor'] });
  });

  test('garde-fou volume : échoue sur le comptage, avant de lire fiches et valeurs', async (t) => {
    const queries = mockModels(t, { total: EXCEL_MAX_ROWS });
    await assert.rejects(loadInputRows({ collectivities: [collectivity], actors: [actor] }), /1048576 valeurs d'indicateur en base.*limite Excel/);
    assert.equal(queries.countQueries.length, 1);
    assert.equal(queries.actionQueries.length, 0);
    assert.equal(queries.ivQueries.length, 0);
    assert.equal(queries.aggregate.mock.callCount(), 0);
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
    assert.equal(row(6).getCell(col('valeurSaisie')).type, ExcelJS.ValueType.Null);
    assert.equal(row(4).getCell(col('acteur')).type, ExcelJS.ValueType.Null, 'texte vide : vraie cellule vide, pas une chaîne vide');
    assert.equal(row(6).getCell(col('valeurModifiee')).type, ExcelJS.ValueType.Null);
    assert.equal(noteText(values.getRow(1).getCell(col('proprietaire'))), "collectivity = fiche portée par l'EPCI ; economic_actor = fiche portée par un acteur économique.", 'note du template recopiée');
    assert.equal(noteText(values.getRow(1).getCell(col('valeurModifiee'))), HEADER_NOTES.Valeurs['Valeur modifiée']);
    assert.equal(noteText(values.getRow(1).getCell(col('misAJour'))), HEADER_NOTES.Valeurs['Dernière mise à jour']);
    for (const sheet of check.worksheets) {
      sheet.getRow(1).eachCell((cell) => assert.doesNotMatch(noteText(cell), /Formule|\(colonne H\) au moment/, `${sheet.name} ${cell.address}`));
    }
    const notes = check.worksheets.reduce((sum, sheet) => sum + Array.from({ length: sheet.columnCount }, (_, i) => sheet.getRow(1).getCell(i + 1)).filter((cell) => cell.note).length, 0);
    assert.equal(notes, 20, 'les 16 notes du template + 4 notes de dates (UTC)');
    const readmeTexts = check.getWorksheet('Lisez-moi').getColumn(1).values.map(String);
    for (const [, text] of README_LINES) assert.equal(readmeTexts.filter((value) => value === text).length, 1, text);
    assert.equal(readmeTexts.indexOf(README_LINES[3][1]), readmeTexts.indexOf(README_LINES[2][1]) + 1, 'ligne UTC sous les conventions de valeur');
    assert.ok(check.getWorksheet('Lisez-moi').getCell(readmeTexts.indexOf(README_LINES[3][1]), 1).alignment?.wrapText, 'style de la ligne voisine');
    assert.equal(row(2).getCell(col('valeurSaisie')).value, "'-commentaire");
    assert.equal(row(8).getCell(col('nomFiche')).value, '\'=HYPERLINK("x")');
    assert.equal(values.views[0].state, 'frozen');
    assert.ok(values.autoFilter);

    const actionsSheet = check.getWorksheet('Actions');
    assert.equal(actionsSheet.actualRowCount, 4);
    assert.equal(actionsSheet.getRow(2).getCell(21).value, 250000);
    assert.equal(actionsSheet.getRow(2).getCell(19).numFmt, 'dd/mm/yyyy', 'date de début sans heure');
    assert.equal(actionsSheet.getRow(2).getCell(28).numFmt, 'dd/mm/yyyy hh:mm');
    assert.equal(check.getWorksheet('Valeurs calculées').getRow(1).getCell(1).font?.bold, true, 'style de l’en-tête Valeurs calculées gardé');
    assert.equal(check.getWorksheet('Valeurs calculées').getColumn(1).width, 28);
    assert.equal(check.getWorksheet('Valeurs calculées').autoFilter, 'A1:P2');
    assert.equal(check.getWorksheet('Valeurs calculées').views[0].state, 'frozen');
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
    // .lean() / .select() ne font que lire (objets simples, champs choisis) : autorisés. Aucune écriture, ni $out / $merge en agrégation.
    assert.doesNotMatch(src, /\$out|\$merge/);
    assert.doesNotMatch(src, /\.(save|create|updateOne|updateMany|insertMany|deleteOne|deleteMany|findOneAndUpdate|bulkWrite)\(/);
    assert.doesNotMatch(src, /microsoftGraph|aggregationReader|excelSync|graphFetch|Log\b/);
  });
});
