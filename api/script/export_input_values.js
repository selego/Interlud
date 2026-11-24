/* eslint-env node */
const ExcelJS = require('exceljs');
const Action = require('../src/models/action');
const IndicatorValue = require('../src/models/indicator_value');
const User = require('../src/models/user');
const { HIDDEN_IDS, buildYearMappings, shouldDisplayIndicator, collectConditionExcelIds } = require('../src/utils/indicators');

// Onglets des données d'entrée de l'export (Valeurs, Actions, Collectivités, Acteurs économiques).
// Tout est lu en base (lecture seule), sans appel à SharePoint. Colonnes = en-têtes du template validé.

const EXCEL_MAX_ROWS = 1048576;
const SITUATION_ORDER = { init: 0, ref: 1, prev: 2, expost: 3 };
const DATE_FORMAT = 'dd/mm/yyyy hh:mm';
const DAY_FORMAT = 'dd/mm/yyyy';
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
  { name: 'Actions', columns: ACTIONS_COLUMNS, dates: ['modifLe'], days: ['dateDebut', 'dateFin'] },
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

// Notes des en-têtes : texte corrigé à l'écriture quand celui du template ne décrit plus l'export (le template binaire reste inchangé).
const UTC_NOTE = 'Date et heure en UTC (heure de Paris = UTC+1 en hiver, UTC+2 en été).';
const HEADER_NOTES = {
  Valeurs: {
    'Valeur saisie':
      "Valeur actuelle enregistrée sur la plateforme (colonne F de l'Excel de la fiche). Égale à la valeur par défaut quand l'utilisateur n'a rien changé : la plateforme y recopie la valeur par défaut, notamment pour les indicateurs non primordiaux et le Parc types. Une valeur présente ne prouve donc pas une saisie par un utilisateur. Vide si aucune valeur enregistrée.",
    'Valeur par défaut': "Valeur par défaut enregistrée sur la plateforme (colonne H de l'Excel de la fiche, au dernier recalcul). Elle n'est pas relue dans l'Excel au moment de l'export.",
    'Valeur modifiée': 'Oui si la valeur saisie diffère de la valeur par défaut actuelle, Non si elle est égale (nombres comparés sans tenir compte des écarts d’arrondi), vide si aucune valeur saisie. Valeur calculée à l’export, pas une formule.',
    'Dernière mise à jour': `Date du dernier enregistrement de la ligne sur la plateforme, y compris un recalcul automatique de la valeur par défaut : ce n'est pas forcément une saisie. ${UTC_NOTE}`,
  },
  Actions: { 'Dernière modification le': UTC_NOTE },
  Collectivités: {
    'Nb fiches action': 'Nombre de fiches action portées par la collectivité (hors configuration et hors fiches des acteurs économiques).',
    'Créée le': UTC_NOTE,
  },
  'Acteurs économiques': { 'Créé le': UTC_NOTE },
};

// Lignes du Lisez-moi corrigées (repérées par leur début) ; null = pas de ligne dans le template, ajoutée après la précédente.
const README_LINES = [
  ['• Valeurs —', "• Valeurs — l'onglet principal : une ligne par indicateur affiché × fiche action × situation × année, avec la valeur enregistrée et la valeur par défaut."],
  ['• Collectivités —', "• Collectivités — une ligne par EPCI du périmètre de l'export ayant au moins un utilisateur approuvé ou une fiche (données de base + état d'onboarding)."],
  [
    '• Valeur saisie vide',
    "• Valeur saisie = valeur actuelle enregistrée sur la plateforme : elle est égale à la valeur par défaut quand l'utilisateur n'a rien changé (la plateforme recopie la valeur par défaut, notamment pour les indicateurs non primordiaux et le Parc types) : une valeur présente ne prouve donc pas une saisie. « Valeur modifiée » = Oui quand elle diffère de la valeur par défaut actuelle, Non sinon, vide si aucune valeur. Seuls les indicateurs affichés dans l'état actuel de la fiche sont exportés (un indicateur masqué par une condition d'affichage n'a pas de ligne). Valeur saisie vide = indicateur affiché sans valeur enregistrée ; un indicateur sans valeur ni valeur par défaut n'a pas de ligne.",
  ],
  [
    null,
    "• Dates et heures en UTC (heure de Paris = UTC+1 en hiver, UTC+2 en été). « Dernière mise à jour » = date du dernier enregistrement de la valeur, y compris un recalcul automatique de la valeur par défaut.",
  ],
];

const isEmpty = (value) => value === undefined || value === null || value === '' || (Array.isArray(value) && !value.length);

const cellValue = (value) => {
  if (isEmpty(value)) return null;
  if (Array.isArray(value)) return value.join('; ');
  return value;
};

const yesNo = (value) => (value ? 'Oui' : 'Non');
// Deux nombres égaux aux erreurs d'arrondi près (58,00000000000001 et 57,99999999999999) ne sont pas une modification.
const sameValue = (a, b) => {
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
  return a === b;
};
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
    valeurModifiee: saisie === null ? '' : yesNo(!sameValue(saisie, defaut)),
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

// Groupe de lecture des conditions d'affichage, comme l'interface : même collectivité, même propriétaire (et même acteur économique).
const groupKey = (collectivityId, owner, actorId) => `${collectivityId}|${owner}|${owner === 'economic_actor' ? actorId || '' : ''}`;

// Indicateurs affichés, avec la règle de l'interface et de l'export par fiche (shouldDisplayIndicator) : valeurs sources lues dans
// le même groupe, par indicateur × situation × année, années possibles déduites des fiches du groupe.
// candidates = [{ row, iv, group }] ; une seule requête pour toutes les valeurs sources.
async function filterDisplayed(candidates, { ids, actions, conditionIds }) {
  if (!conditionIds.size) return { rows: candidates.map((c) => c.row), hidden: 0 };
  const sources = new Map();
  const query = IndicatorValue.find({ collectivity_id: { $in: ids }, indicator_excel_id: { $in: [...conditionIds] } })
    .select('collectivity_id owner economic_actor_id indicator_excel_id indicator_type situation year value display_condition')
    .lean();
  for (const source of await query) {
    const key = groupKey(source.collectivity_id, source.owner, source.economic_actor_id);
    if (!sources.has(key)) sources.set(key, new Map());
    sources.get(key).set(`${source.indicator_excel_id}_${source.situation}_${source.year}`, source);
  }
  const regularByGroup = new Map();
  for (const action of actions) {
    if (action.type === 'config') continue;
    const key = groupKey(action.collectivity_id, action.owner, action.economic_actor_id);
    if (!regularByGroup.has(key)) regularByGroup.set(key, []);
    regularByGroup.get(key).push(action);
  }
  const mappings = new Map([...regularByGroup].map(([key, list]) => [key, buildYearMappings(list)]));
  const empty = new Map();
  const rows = [];
  for (const { row, iv, group } of candidates) {
    if (!iv || shouldDisplayIndicator(iv, mappings.get(group)?.[`${iv.situation}_${iv.year}`], sources.get(group) || empty)) rows.push(row);
  }
  return { rows, hidden: candidates.length - rows.length };
}

// Garde-fou avant toute lecture coûteuse : le nombre de valeurs en base majore le nombre de lignes de l'onglet Valeurs.
async function checkInputVolume(ids) {
  const total = await IndicatorValue.countDocuments({ collectivity_id: { $in: ids } });
  if (total + 1 > EXCEL_MAX_ROWS) {
    throw new Error(`Export annulé : ${total} valeurs d'indicateur en base pour ces collectivités, l'onglet « Valeurs » pourrait dépasser la limite Excel de ${EXCEL_MAX_ROWS} lignes. Relancer avec moins de collectivités.`);
  }
  return total;
}

// Utilisateurs approuvés par collectivité, en une agrégation (un utilisateur compte une fois par collectivité).
async function approvedUsersByCollectivity(ids) {
  const counts = await User.aggregate([
    { $match: { collectivities: { $elemMatch: { id: { $in: ids }, status: 'approved' } } } },
    { $unwind: '$collectivities' },
    { $match: { 'collectivities.id': { $in: ids }, 'collectivities.status': 'approved' } },
    { $group: { _id: '$collectivities.id', users: { $addToSet: '$_id' } } },
    { $project: { count: { $size: '$users' } } },
  ]);
  return new Map(counts.map((entry) => [String(entry._id), entry.count]));
}

// Lecture en base. collectivities et actors sont déjà chargés par le script (mêmes collectivités que l'onglet Valeurs calculées).
async function loadInputRows({ collectivities, actors }) {
  const ids = collectivities.map((collectivity) => String(collectivity._id));
  const total = await checkInputVolume(ids);
  const collectivityById = new Map(collectivities.map((collectivity) => [String(collectivity._id), collectivity]));
  const actorById = new Map(actors.map((actor) => [String(actor._id), actor]));
  const actions = await Action.find({ collectivity_id: { $in: ids }, type: { $ne: 'global' } });
  const actionById = new Map(actions.map((action) => [String(action._id), action]));
  const contextFor = (action) => ({ collectivity: collectivityById.get(action.collectivity_id) || {}, action, actorName: actorById.get(action.economic_actor_id)?.name });

  const candidates = [];
  const conditionIds = new Set();
  let orphans = 0;
  let neverDisplayed = 0;
  // Curseur (objets simples) : les valeurs sont lues une à une, seules les lignes de l'export restent en mémoire.
  for await (const iv of IndicatorValue.find({ collectivity_id: { $in: ids } }).lean().cursor()) {
    const hasCondition = iv.display_condition?.conditions?.length > 0;
    if (hasCondition) collectConditionExcelIds(iv.display_condition, conditionIds);
    // Indicateurs techniques jamais affichés par la plateforme (même exclusion que l'export par fiche).
    if (HIDDEN_IDS.includes(iv.indicator_excel_id)) {
      neverDisplayed++;
      continue;
    }
    const action = actionById.get(String(iv.action_id));
    if (!action) {
      orphans++;
      continue;
    }
    const row = valueRow(iv, contextFor(action));
    if (!row) continue;
    const condition = hasCondition ? { display_condition: iv.display_condition, indicator_excel_id: iv.indicator_excel_id, situation: iv.situation, year: iv.year } : null;
    candidates.push({ row, iv: condition, group: groupKey(action.collectivity_id, action.owner, action.economic_actor_id) });
  }
  const { rows: values, hidden } = await filterDisplayed(candidates, { ids, actions, conditionIds });
  values.sort(compareRows);

  const regular = actions.filter(isRegularAction);
  const actionRows = regular.map((action) => actionRow(action, contextFor(action))).sort(compareRows);
  const approved = await approvedUsersByCollectivity(ids);
  const withActions = new Set(actions.map((action) => action.collectivity_id));
  // Seules les collectivités du périmètre qui ont au moins un utilisateur approuvé ou une fiche (configuration comprise).
  const collectivityRows = [...collectivities]
    .filter((collectivity) => approved.get(String(collectivity._id)) || withActions.has(String(collectivity._id)))
    .sort((a, b) => collator.compare(String(a.name || ''), String(b.name || '')))
    .map((collectivity) => collectivityRow(collectivity, { actions, actors, approvedUsers: approved.get(String(collectivity._id)) || 0 }));
  const actorRows = [...actors].sort((a, b) => collator.compare(String(a.name || ''), String(b.name || ''))).map((actor) => actorRow(actor, { actions }));

  return {
    orphans,
    stats: { valuesInBase: total, candidates: candidates.length, hidden, neverDisplayed, collectivitiesInScope: collectivities.length },
    sheets: { Valeurs: values, Actions: actionRows, Collectivités: collectivityRows, 'Acteurs économiques': actorRows },
  };
}

const checkVolume = (sheets) => {
  for (const { name } of SHEETS) {
    const count = (sheets[name] || []).length + 1;
    if (count > EXCEL_MAX_ROWS) throw new Error(`Export annulé : l'onglet « ${name} » compterait ${count} lignes (en-tête compris), au-delà de la limite Excel de ${EXCEL_MAX_ROWS}. Relancer avec moins de collectivités.`);
  }
};

const noteFor = (cell, text) => {
  const font = cell.note?.texts?.[0]?.font || { size: 10, name: 'Arial', family: 2 };
  return { ...(typeof cell.note === 'object' ? cell.note : {}), texts: [{ font, text }] };
};

const updateReadme = (workbook) => {
  const readme = workbook.getWorksheet('Lisez-moi');
  if (!readme) return;
  let previous = -1;
  for (const [prefix, text] of README_LINES) {
    const values = Array.from(readme.getColumn(1).values, (value) => String(value || ''));
    if (values.includes(text)) {
      previous = values.indexOf(text);
      continue;
    }
    const row = prefix ? values.findIndex((value) => value.startsWith(prefix)) : -1;
    if (row !== -1) {
      readme.getCell(row, 1).value = text;
      previous = row;
    } else if (!prefix && previous !== -1) {
      readme.insertRow(previous + 1, [text], 'i');
      previous += 1;
    }
  }
};

// Prépare les onglets du template (en-tête gardé tel quel, lignes d'exemple retirées, filtre, format des dates)
// et renvoie leurs lignes, écrites ensuite en flux par writeWorkbook pour ne pas garder tout le classeur en mémoire.
const prepareInputSheets = (workbook, sheets) => {
  checkVolume(sheets);
  const appended = {};
  updateReadme(workbook);
  for (const { name, columns, dates, days = [] } of SHEETS) {
    const sheet = workbook.getWorksheet(name) || workbook.addWorksheet(name);
    const header = sheet.getRow(1);
    columns.forEach(([label], index) => {
      if (!header.getCell(index + 1).value) header.getCell(index + 1).value = label;
      if (header.getCell(index + 1).value !== label) throw new Error(`Template inattendu : colonne ${index + 1} de « ${name} » = « ${header.getCell(index + 1).value} », attendu « ${label} ».`);
      const note = HEADER_NOTES[name]?.[label];
      if (note) header.getCell(index + 1).note = noteFor(header.getCell(index + 1), note);
    });
    for (let row = sheet.rowCount; row >= 2; row--) sheet.spliceRows(row, 1);
    for (const key of dates) sheet.getColumn(columns.findIndex(([, k]) => k === key) + 1).numFmt = DATE_FORMAT;
    for (const key of days) sheet.getColumn(columns.findIndex(([, k]) => k === key) + 1).numFmt = DAY_FORMAT;
    const rows = sheets[name] || [];
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: rows.length + 1, column: columns.length } };
    appended[name] = (function* toCells() {
      // Texte vide → vraie cellule vide.
      for (const row of rows) yield columns.map(([, key]) => (row[key] === '' ? null : neutralize(row[key] ?? null)));
    })();
  }
  return appended;
};

// Écrit le classeur en flux : chaque feuille du classeur en mémoire (template, Valeurs calculées…) est recopiée
// (largeurs, styles, notes, vues, filtre), puis les lignes de appended[nom de la feuille] sont ajoutées à la suite.
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
        if (cell.note) copy.getCell(column).note = cell.note;
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
  HEADER_NOTES,
  README_LINES,
  neutralize,
  sameValue,
  valueRow,
  actionRow,
  collectivityRow,
  actorRow,
  compareRows,
  loadInputRows,
  checkInputVolume,
  checkVolume,
  prepareInputSheets,
  writeWorkbook,
};
