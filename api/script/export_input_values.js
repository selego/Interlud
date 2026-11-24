/* eslint-env node */
const ExcelJS = require('exceljs');
const Action = require('../src/models/action');
const IndicatorValue = require('../src/models/indicator_value');
const User = require('../src/models/user');

// Onglets des données d'entrée de l'export (Valeurs, Actions, Collectivités, Acteurs économiques).
// Tout est lu en base (find uniquement), sans appel à SharePoint. Colonnes = en-têtes du template validé.

const EXCEL_MAX_ROWS = 1048576;
const SITUATION_ORDER = { init: 0, ref: 1, prev: 2, expost: 3 };
const DATE_FORMAT = 'dd/mm/yyyy hh:mm';
const collator = new Intl.Collator('fr');

const VALUES_COLUMNS = [
  ['Collectivité', 'collectivite'],
  ['SIREN', 'siren'],
  ['Département', 'departement'],
  ['Propriétaire', 'proprietaire'],
  ['Acteur économique', 'acteur'],
  ['Fiche action', 'fiche'],
  ['Action de référence', 'actionReference'],
  ['Nom de la fiche', 'nomFiche'],
  ['Instance', 'instance'],
  ['Brouillon', 'brouillon'],
  ['Situation', 'situation'],
  ['Année', 'annee'],
  ['Catégorie', 'categorie'],
  ['Sous-catégorie', 'sousCategorie'],
  ['ID Excel', 'idExcel'],
  ['Ligne Excel', 'ligneExcel'],
  ['Indicateur', 'indicateur'],
  ['Description', 'description'],
  ['Type', 'type'],
  ['Unité', 'unite'],
  ['Primordial', 'primordial'],
  ['Valeur saisie', 'valeurSaisie'],
  ['Valeur par défaut', 'valeurDefaut'],
  ['Valeur modifiée', 'valeurModifiee'],
  ['Dernière mise à jour', 'misAJour'],
];

const ACTIONS_COLUMNS = [
  ['Collectivité', 'collectivite'],
  ['SIREN', 'siren'],
  ['Propriétaire', 'proprietaire'],
  ['Acteur économique', 'acteur'],
  ['Fiche action', 'fiche'],
  ['Action de référence', 'actionReference'],
  ['Nom de la fiche', 'nomFiche'],
  ['Instance', 'instance'],
  ['Brouillon', 'brouillon'],
  ['Statut', 'statut'],
  ['Priorité', 'priorite'],
  ['Année initiale', 'anneeInit'],
  ['Années prévisionnelles', 'anneesPrev'],
  ['Années ex-post', 'anneesExpost'],
  ['Complétion init (%)', 'completionInit'],
  ['Complétion ref (%)', 'completionRef'],
  ['Complétion prev (%)', 'completionPrev'],
  ['Complétion expost (%)', 'completionExpost'],
  ['Date de début', 'dateDebut'],
  ['Date de fin', 'dateFin'],
  ['Budget (€)', 'budget'],
  ['Aides financières (€)', 'aides'],
  ['Subventionnée par le programme', 'subventionnee'],
  ['Pilote', 'pilote'],
  ['Partenaires', 'partenaires'],
  ['Description', 'description'],
  ['Dernière modification par', 'modifPar'],
  ['Dernière modification le', 'modifLe'],
];

const COLLECTIVITIES_COLUMNS = [
  ['Collectivité', 'collectivite'],
  ['Département', 'departement'],
  ['SIREN', 'siren'],
  ['Population', 'population'],
  ['Surface (km²)', 'surface'],
  ['Année des données', 'annee'],
  ['Données de base onboardées', 'donneesBase'],
  ['Parc types onboardé', 'parcTypes'],
  ['Nb fiches action', 'nbFiches'],
  ['Nb acteurs économiques', 'nbActeurs'],
  ['Nb utilisateurs approuvés', 'nbUtilisateurs'],
  ['Créée le', 'creeLe'],
];

const ACTORS_COLUMNS = [
  ['Acteur économique', 'acteur'],
  ['Description', 'description'],
  ['Collectivités de rattachement', 'collectivites'],
  ['Nb fiches action', 'nbFiches'],
  ['Créé le', 'creeLe'],
];

const SHEETS = [
  { name: 'Valeurs', columns: VALUES_COLUMNS, dates: ['misAJour'] },
  { name: 'Actions', columns: ACTIONS_COLUMNS, dates: ['dateDebut', 'dateFin', 'modifLe'] },
  { name: 'Collectivités', columns: COLLECTIVITIES_COLUMNS, dates: ['creeLe'] },
  { name: 'Acteurs économiques', columns: ACTORS_COLUMNS, dates: ['creeLe'] },
];

// Un texte commençant par = + - @ (ou tabulation / retour chariot) serait interprété comme une formule par un tableur :
// on le préfixe d'une apostrophe. Les nombres restent des nombres ; un texte qui est un nombre (« -12,5 ») ou un simple tiret
// (choix « - » des listes) est gardé tel quel.
const neutralize = (value) => {
  if (typeof value !== 'string') return value;
  if (!/^[=+\-@\t\r]/.test(value)) return value;
  if (/^[-+]?\d+([.,]\d+)?$/.test(value.trim()) || /^-+$/.test(value.trim())) return value;
  return `'${value}`;
};

const isEmpty = (value) => value === undefined || value === null || value === '' || (Array.isArray(value) && !value.length);

const cellValue = (value) => {
  if (isEmpty(value)) return null;
  if (Array.isArray(value)) return value.join('; ');
  return value;
};

const yesNo = (value) => (value ? 'Oui' : 'Non');
const years = (list) => [...new Set(list.filter((year) => year !== undefined && year !== null))].sort((a, b) => a - b).join('; ');
const isRegularAction = (action) => action.type !== 'config' && action.type !== 'global';

// Une ligne par valeur d'indicateur ayant une valeur saisie ou une valeur par défaut.
// context = { collectivity, action, actorName } ; la valeur est lue selon le type de l'indicateur.
const valueRow = (iv, { collectivity, action, actorName }) => {
  const saisie = cellValue(iv.value?.[iv.indicator_type]);
  const defaut = cellValue(iv.value_default?.[iv.indicator_type]);
  if (saisie === null && defaut === null) return null;
  const isConfig = action.type === 'config';
  return {
    collectivite: collectivity.name || '',
    siren: collectivity.siren ?? null,
    departement: collectivity.department || '',
    proprietaire: action.owner || iv.owner || '',
    acteur: action.owner === 'economic_actor' ? actorName || action.economic_actor_name || '' : '',
    fiche: isConfig ? 'CONFIG' : action.excel_worksheetname || '',
    actionReference: isConfig ? action.name || '' : action.action_parent_name || '',
    nomFiche: action.name || '',
    instance: action.instance_number || 1,
    brouillon: yesNo(action.is_draft),
    situation: iv.situation || '',
    annee: iv.year ?? null,
    categorie: iv.indicator_category_name || '',
    sousCategorie: iv.indicator_sub_category_name || '',
    idExcel: iv.indicator_excel_id || '',
    ligneExcel: iv.excel_line_number ?? null,
    indicateur: iv.indicator_name || '',
    description: iv.indicator_description || '',
    type: iv.indicator_type || '',
    unite: iv.indicator_value_unit || '',
    primordial: yesNo(iv.is_primordial),
    valeurSaisie: saisie,
    valeurDefaut: defaut,
    valeurModifiee: saisie === null ? '' : yesNo(saisie !== defaut),
    misAJour: iv.updatedAt || null,
  };
};

const sortKey = (row) => [row.collectivite, row.proprietaire === 'collectivity' ? 0 : 1, row.acteur, row.fiche === 'CONFIG' ? '' : row.fiche, row.nomFiche, row.instance, SITUATION_ORDER[row.situation] ?? 9, row.annee ?? 0, row.ligneExcel ?? 0, row.idExcel];
const compareRows = (a, b) => {
  const ka = sortKey(a);
  const kb = sortKey(b);
  for (let i = 0; i < ka.length; i++) {
    if (ka[i] === kb[i]) continue;
    if (typeof ka[i] === 'number' && typeof kb[i] === 'number') return ka[i] - kb[i];
    return collator.compare(String(ka[i]), String(kb[i]));
  }
  return 0;
};

const actionRow = (action, { collectivity, actorName }) => ({
  collectivite: collectivity.name || '',
  siren: collectivity.siren ?? null,
  proprietaire: action.owner || '',
  acteur: action.owner === 'economic_actor' ? actorName || action.economic_actor_name || '' : '',
  fiche: action.excel_worksheetname || '',
  actionReference: action.action_parent_name || '',
  nomFiche: action.name || '',
  instance: action.instance_number || 1,
  brouillon: yesNo(action.is_draft),
  statut: action.status || '',
  priorite: action.priority || '',
  anneeInit: action.year_init ?? null,
  anneesPrev: years([...(action.exel_files_prev || []).map((file) => file.year_prev), action.year_prev]),
  anneesExpost: years([...(action.excel_files_expost || []).map((file) => file.year_expost), action.year_expost]),
  completionInit: action.completion_init ?? null,
  completionRef: action.completion_ref ?? null,
  completionPrev: action.completion_prev ?? null,
  completionExpost: action.completion_expost ?? null,
  dateDebut: action.date_start || null,
  dateFin: action.date_end || null,
  budget: action.budget_costs ?? null,
  aides: action.financial_aid ?? null,
  subventionnee: yesNo(action.is_subsidized_by_program),
  pilote: action.pilote || '',
  partenaires: action.partners || '',
  description: action.description || '',
  modifPar: action.last_modif_by_name || '',
  modifLe: action.last_modif_date || null,
});

const collectivityRow = (collectivity, { actions, actors, approvedUsers }) => ({
  collectivite: collectivity.name || '',
  departement: collectivity.department || '',
  siren: collectivity.siren ?? null,
  population: collectivity.population ?? null,
  surface: collectivity.area ?? null,
  annee: collectivity.year ?? null,
  donneesBase: yesNo(collectivity.basedata_onboarded),
  parcTypes: yesNo(collectivity.parc_types_onboarded),
  nbFiches: actions.filter((action) => isRegularAction(action) && action.owner !== 'economic_actor' && action.collectivity_id === String(collectivity._id)).length,
  nbActeurs: actors.filter((actor) => (actor.collectivities || []).some((c) => c.id === String(collectivity._id))).length,
  nbUtilisateurs: approvedUsers,
  creeLe: collectivity.createdAt || null,
});

const actorRow = (actor, { actions }) => ({
  acteur: actor.name || '',
  description: actor.description || '',
  collectivites: (actor.collectivities || []).map((c) => c.name).filter(Boolean).join('; '),
  nbFiches: actions.filter((action) => isRegularAction(action) && action.owner === 'economic_actor' && action.economic_actor_id === String(actor._id)).length,
  creeLe: actor.createdAt || null,
});

// Lecture en base. collectivities et actors sont déjà chargés par le script (mêmes collectivités que l'onglet Valeurs calculées).
async function loadInputRows({ collectivities, actors }) {
  const ids = collectivities.map((collectivity) => String(collectivity._id));
  const collectivityById = new Map(collectivities.map((collectivity) => [String(collectivity._id), collectivity]));
  const actorById = new Map(actors.map((actor) => [String(actor._id), actor]));
  const actions = await Action.find({ collectivity_id: { $in: ids }, type: { $ne: 'global' } });
  const actionById = new Map(actions.map((action) => [String(action._id), action]));
  const contextFor = (action) => ({ collectivity: collectivityById.get(action.collectivity_id) || {}, action, actorName: actorById.get(action.economic_actor_id)?.name });

  const values = [];
  let orphans = 0;
  // Curseur : les valeurs sont lues une à une, seules les lignes de l'export restent en mémoire.
  for await (const iv of IndicatorValue.find({ collectivity_id: { $in: ids } }).cursor()) {
    const action = actionById.get(iv.action_id);
    if (!action) {
      orphans++;
      continue;
    }
    const row = valueRow(iv, contextFor(action));
    if (row) values.push(row);
  }
  values.sort(compareRows);

  const regular = actions.filter(isRegularAction);
  const actionRows = regular.map((action) => actionRow(action, contextFor(action))).sort(compareRows);
  const collectivityRows = [];
  for (const collectivity of [...collectivities].sort((a, b) => collator.compare(String(a.name || ''), String(b.name || '')))) {
    const approvedUsers = await User.countDocuments({ collectivities: { $elemMatch: { id: String(collectivity._id), status: 'approved' } } });
    collectivityRows.push(collectivityRow(collectivity, { actions, actors, approvedUsers }));
  }
  const actorRows = [...actors].sort((a, b) => collator.compare(String(a.name || ''), String(b.name || ''))).map((actor) => actorRow(actor, { actions }));

  return { orphans, sheets: { Valeurs: values, Actions: actionRows, Collectivités: collectivityRows, 'Acteurs économiques': actorRows } };
}

const checkVolume = (sheets) => {
  for (const { name } of SHEETS) {
    const count = (sheets[name] || []).length + 1;
    if (count > EXCEL_MAX_ROWS) throw new Error(`Export annulé : l'onglet « ${name} » compterait ${count} lignes (en-tête compris), au-delà de la limite Excel de ${EXCEL_MAX_ROWS}. Relancer avec moins de collectivités.`);
  }
};

// Prépare les onglets du template (en-tête gardé tel quel, lignes d'exemple retirées, filtre, format des dates)
// et renvoie leurs lignes, écrites ensuite en flux par writeWorkbook pour ne pas garder tout le classeur en mémoire.
const prepareInputSheets = (workbook, sheets) => {
  checkVolume(sheets);
  const appended = {};
  for (const { name, columns, dates } of SHEETS) {
    const sheet = workbook.getWorksheet(name) || workbook.addWorksheet(name);
    const header = sheet.getRow(1);
    columns.forEach(([label], index) => {
      if (!header.getCell(index + 1).value) header.getCell(index + 1).value = label;
      if (header.getCell(index + 1).value !== label) throw new Error(`Template inattendu : colonne ${index + 1} de « ${name} » = « ${header.getCell(index + 1).value} », attendu « ${label} ».`);
    });
    for (let row = sheet.rowCount; row >= 2; row--) sheet.spliceRows(row, 1);
    for (const key of dates) sheet.getColumn(columns.findIndex(([, k]) => k === key) + 1).numFmt = DATE_FORMAT;
    const rows = sheets[name] || [];
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: rows.length + 1, column: columns.length } };
    appended[name] = (function* toCells() {
      for (const row of rows) yield columns.map(([, key]) => neutralize(row[key] ?? null));
    })();
  }
  return appended;
};

// Écrit le classeur en flux : chaque feuille du classeur en mémoire (template, Valeurs calculées…) est recopiée
// (largeurs, styles, vues, filtre), puis les lignes de appended[nom de la feuille] sont ajoutées à la suite.
async function writeWorkbook(workbook, filename, appended = {}) {
  const writer = new ExcelJS.stream.xlsx.WorkbookWriter({ filename, useStyles: true, useSharedStrings: true });
  for (const sheet of [...workbook.worksheets].sort((a, b) => a.orderNo - b.orderNo)) {
    const target = writer.addWorksheet(sheet.name, { views: sheet.views, properties: sheet.properties, state: sheet.state });
    if (sheet.columns) target.columns = sheet.columns.map((column) => ({ width: column.width, style: column.style, hidden: column.hidden }));
    if (sheet.autoFilter) target.autoFilter = sheet.autoFilter;
    sheet.eachRow((row, number) => {
      const copy = target.getRow(number);
      if (row.height) copy.height = row.height;
      row.eachCell({ includeEmpty: true }, (cell, column) => {
        copy.getCell(column).value = cell.value;
        copy.getCell(column).style = cell.style;
      });
      copy.commit();
    });
    for (const values of appended[sheet.name] || []) target.addRow(values).commit();
    target.commit();
  }
  await writer.commit();
}

module.exports = {
  SHEETS,
  VALUES_COLUMNS,
  neutralize,
  valueRow,
  actionRow,
  collectivityRow,
  actorRow,
  compareRows,
  loadInputRows,
  checkVolume,
  prepareInputSheets,
  writeWorkbook,
};
