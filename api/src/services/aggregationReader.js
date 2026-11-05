// Lecture des feuilles d'agrégation « 3. Émissions par action » et « 4. Gains par action ».
// GET de plages uniquement : pas de session workbook, pas d'écriture SharePoint.
// Les routes /excel/* importent les constantes et extractAggregation ; leur réponse ne change pas.

const GAINS_WORKSHEET = '4. Gains par action';
const EMISSIONS_WORKSHEET = '3. Émissions par action';
const BLOCK_ROWS = 41;
const YEAR_START = 2010;

// Blocs par action espacés de 57 lignes dans les deux feuilles (pas de C5 ni C8)
const ACTION_GAINS_RANGES = {
  B2: { dataStartRow: 19 },
  B3: { dataStartRow: 76 },
  B4: { dataStartRow: 133 },
  C1: { dataStartRow: 190 },
  C2: { dataStartRow: 247 },
  C3: { dataStartRow: 304 },
  C4: { dataStartRow: 361 },
  C6: { dataStartRow: 418 },
  C7: { dataStartRow: 475 },
  C9: { dataStartRow: 532 },
};
const ACTION_EMISSIONS_RANGES = {
  B2: { dataStartRow: 21 },
  B3: { dataStartRow: 78 },
  B4: { dataStartRow: 135 },
  C1: { dataStartRow: 192 },
  C2: { dataStartRow: 249 },
  C3: { dataStartRow: 306 },
  C4: { dataStartRow: 363 },
  C6: { dataStartRow: 420 },
  C7: { dataStartRow: 477 },
  C9: { dataStartRow: 534 },
};

const GAINS_FIRST_ROW = Math.min(...Object.values(ACTION_GAINS_RANGES).map((r) => r.dataStartRow));
const GAINS_LAST_ROW = Math.max(...Object.values(ACTION_GAINS_RANGES).map((r) => r.dataStartRow)) + (BLOCK_ROWS - 1);
const EMISSIONS_FIRST_ROW = Math.min(...Object.values(ACTION_EMISSIONS_RANGES).map((r) => r.dataStartRow));
const EMISSIONS_LAST_ROW = Math.max(...Object.values(ACTION_EMISSIONS_RANGES).map((r) => r.dataStartRow)) + (BLOCK_ROWS - 1);

const EMISSION_TYPES = ['GES', 'PM', 'NOx', 'HC', 'CO', 'Nrj'];
// Décalages 0-indexés : total = E(4), instance 1 = AW(48), instance 2 = CO(92), instance 3 = EG(136)
const INSTANCE_COL_OFFSET = { 1: 48, 2: 92, 3: 136 };
const TOTAL_COL_OFFSET = 4;
const INSTANCE_EMISSION_COL = { GES: 0, PM: 7, NOx: 14, HC: 21, CO: 28, Nrj: 35 };
const INSTANCE_END_COL = { 1: 'CK', 2: 'EC', 3: 'FU' };

const INDICATORS_CONFIG = [
  { key: 'GES', label: 'GES', unit: 'tCO2e' },
  { key: 'PM', label: 'PM', unit: 'tPart' },
  { key: 'HC', label: 'HC', unit: 'tHC' },
  { key: 'NOx', label: 'NOx', unit: 'tNOx' },
  { key: 'CO', label: 'CO', unit: 'tCO' },
  { key: 'Nrj', label: 'Énergie', unit: 'GWh' },
];

// 6 écarts par polluant, ordre confirmé : +0 Réf-Init, +1 Prév-Init, +2 Prév-Réf,
// +3 Expost-Init, +4 Expost-Réf, +5 Expost-Prév.
// Le dashboard (extractAggregation) ne consomme que +0, +2, +4 et +5.
const GAIN_COLUMNS = [
  { offset: 0, label: 'Réf-Init' },
  { offset: 1, label: 'Prév-Init' },
  { offset: 2, label: 'Prév-Réf' },
  { offset: 3, label: 'Expost-Init' },
  { offset: 4, label: 'Expost-Réf' },
  { offset: 5, label: 'Expost-Prév' },
];

const EMISSION_SITUATIONS = [
  { offset: 0, label: 'init' },
  { offset: 1, label: 'ref' },
  { offset: 2, label: 'prev' },
  { offset: 3, label: 'expost' },
];

// Cellule vide → null. 0 reste 0.
const cellNumber = (val) => {
  if (val === null || val === undefined || val === '') return null;
  if (typeof val === 'number') return Number.isFinite(val) ? val : null;
  if (typeof val !== 'string') return null;
  const trimmed = val.trim();
  if (!trimmed || trimmed.startsWith('#')) return null;
  const num = parseFloat(trimmed.replace(/\s/g, '').replace(',', '.'));
  if (!Number.isFinite(num)) return null;
  return num;
};

// Lecture du dashboard : une cellule vide compte pour 0.
const parseNumber = (val) => cellNumber(val) ?? 0;

// Atteinte du dashboard d'action : dernière année où l'écart Expost−Réf est non nul.
const latestAttainment = (yearlyData) => {
  const latest = [...yearlyData].reverse().find((d) => d.ecartExpostRef !== 0);
  if (!latest) return { latest: null, objective: 0, real: 0, achievement: null };
  const objective = Math.abs(latest.ecartPrevRef);
  const real = Math.abs(latest.ecartExpostRef);
  return { latest, objective, real, achievement: objective > 0 && real > 0 ? (real / objective) * 100 : null };
};

const extractAggregation = (action, gainsYearRows, emYearRows) => {
  let processedData = { score: 0, gains: {}, emissions: {} };

  let totalAchievement = 0;
  let achievementCount = 0;

  for (const emissionType of EMISSION_TYPES) {
    if (INSTANCE_EMISSION_COL[emissionType] === undefined) continue;
    const col = (action.type === 'global' ? TOTAL_COL_OFFSET : INSTANCE_COL_OFFSET[action.instance_number]) + INSTANCE_EMISSION_COL[emissionType];

    // Gains : 6 écarts par type (Réf-Init, Prév-Init, Prév-Réf, Expost-Init, Expost-Réf, Expost-Prév)
    const yearlyData = gainsYearRows.map((d) => ({
      year: d.year,
      ecartRefInit: parseNumber(d.row[col]),
      ecartPrevRef: parseNumber(d.row[col + 2]),
      ecartExpostRef: parseNumber(d.row[col + 4]),
      ecartExpostPrev: parseNumber(d.row[col + 5]),
    }));

    const { objective, real, achievement } = latestAttainment(yearlyData);

    if (achievement !== null) {
      totalAchievement += Math.min(achievement, 100);
      achievementCount++;
    }

    processedData.gains[emissionType] = { label: emissionType, unit: INDICATORS_CONFIG.find((c) => c.key === emissionType)?.unit, objective, real, objectiveVal: objective, realVal: real, achievement, yearlyData };
  }

  processedData.score = achievementCount > 0 ? Math.round(totalAchievement / achievementCount) : 0;

  for (const emissionType of EMISSION_TYPES) {
    if (INSTANCE_EMISSION_COL[emissionType] === undefined) continue;
    const emCol = (action.type === 'global' ? TOTAL_COL_OFFSET : INSTANCE_COL_OFFSET[action.instance_number]) + INSTANCE_EMISSION_COL[emissionType];
    processedData.emissions[emissionType] = {
      label: emissionType,
      unit: INDICATORS_CONFIG.find((c) => c.key === emissionType)?.unit,
      yearlyData: emYearRows.map((d) => ({
        year: d.year,
        initiale: parseNumber(d.row[emCol]),
        reference: parseNumber(d.row[emCol + 1]),
        previsionnelle: parseNumber(d.row[emCol + 2]),
        expost: parseNumber(d.row[emCol + 3]),
      })),
    };
  }

  return processedData;
};

// Lignes d'un bloc d'action : ligne 0 = année 2010.
const sliceActionYearRows = (allRows, firstRow, dataStartRow) =>
  (allRows || []).slice(dataStartRow - firstRow, dataStartRow - firstRow + BLOCK_ROWS).map((row, i) => ({ year: YEAR_START + i, row: row || [] }));

const blockYearRows = (gainsRows, emRows, key) => ({
  gainsYearRows: sliceActionYearRows(gainsRows, GAINS_FIRST_ROW, ACTION_GAINS_RANGES[key].dataStartRow),
  emYearRows: sliceActionYearRows(emRows, EMISSIONS_FIRST_ROW, ACTION_EMISSIONS_RANGES[key].dataStartRow),
});

// Une lecture de plage par feuille ; les retries 429/5xx sont dans graphFetch.
// { gainsRows, emRows } alignés sur A19:FU572 et A21:FU574 (ligne 0 = première ligne de la plage, colonne 0 = A).
async function readAggregationBlocks(aggregationFileId) {
  if (!aggregationFileId) throw new Error("Identifiant de fichier d'agrégation manquant");
  const { graphFetch, getSiteId } = require('./microsoftGraph');
  const siteId = await getSiteId();
  const readSheet = async (worksheet, firstRow, lastRow) => {
    const result = await graphFetch(`/sites/${siteId}/drive/items/${aggregationFileId}/workbook/worksheets/${encodeURIComponent(worksheet)}/range(address='A${firstRow}:FU${lastRow}')`);
    return result?.values || [];
  };
  const [gainsRows, emRows] = await Promise.all([readSheet(GAINS_WORKSHEET, GAINS_FIRST_ROW, GAINS_LAST_ROW), readSheet(EMISSIONS_WORKSHEET, EMISSIONS_FIRST_ROW, EMISSIONS_LAST_ROW)]);
  return { gainsRows, emRows };
}

// Atteinte d'une instance : même règle que le dashboard d'action (extractAggregation).
const instanceAttainment = (gainsYearRows, col) => {
  const { latest, objective, real, achievement } = latestAttainment(gainsYearRows.map(({ year, row }) => ({ year, ecartPrevRef: parseNumber(row[col + 2]), ecartExpostRef: parseNumber(row[col + 4]) })));
  if (!latest) return null;
  return { year: latest.year, objective, real, achievement };
};

// Atteinte du total : même règle que le dashboard d'accueil (cumul ex-post ÷ cumul prévisionnel, toutes années).
const totalAttainment = (emYearRows, col) => {
  const objective = Math.abs(emYearRows.reduce((sum, { row }) => sum + parseNumber(row[col + 2]), 0));
  const real = Math.abs(emYearRows.reduce((sum, { row }) => sum + parseNumber(row[col + 3]), 0));
  return { year: '', objective, real, achievement: objective > 0 ? (real / objective) * 100 : null };
};

// context = { collectivityName, siren, department, owner, actorName }. Les cellules vides et les zéros sont omis.
const buildCalculatedValueRows = ({ context, action, instance, gainsYearRows, emYearRows }) => {
  const isTotal = instance === 'Total';
  const base = {
    collectivite: context.collectivityName || '',
    siren: context.siren ?? '',
    departement: context.department ?? '',
    proprietaire: context.owner || '',
    acteur: context.actorName || '',
    fiche: action.excel_worksheetname || '',
    actionReference: action.action_parent_name || '',
    nomFiche: isTotal ? action.action_parent_name || action.name || '' : action.name || '',
    instance,
    brouillon: '',
  };
  if (!isTotal) base.brouillon = action.is_draft ? 'Oui' : 'Non';
  const rows = [];
  const push = (fields) => {
    if (fields.valeur === null || fields.valeur === 0) return;
    rows.push({ ...base, ...fields });
  };

  for (const emissionType of EMISSION_TYPES) {
    const col = (isTotal ? TOTAL_COL_OFFSET : INSTANCE_COL_OFFSET[instance]) + INSTANCE_EMISSION_COL[emissionType];
    const { label: polluant, unit: unite } = INDICATORS_CONFIG.find((c) => c.key === emissionType);
    for (const { year, row } of emYearRows) {
      for (const situation of EMISSION_SITUATIONS) push({ famille: 'Émission', polluant, situation: situation.label, annee: year, valeur: cellNumber(row[col + situation.offset]), unite });
    }
    for (const { year, row } of gainsYearRows) {
      for (const gap of GAIN_COLUMNS) push({ famille: 'Gain', polluant, situation: gap.label, annee: year, valeur: cellNumber(row[col + gap.offset]), unite });
    }
    const attainment = isTotal ? totalAttainment(emYearRows, col) : instanceAttainment(gainsYearRows, col);
    if (!attainment) continue;
    push({ famille: 'Atteinte', polluant, situation: 'objectif', annee: attainment.year, valeur: attainment.objective, unite });
    push({ famille: 'Atteinte', polluant, situation: 'réel', annee: attainment.year, valeur: attainment.real, unite });
    push({ famille: 'Atteinte', polluant, situation: 'taux', annee: attainment.year, valeur: attainment.achievement, unite: '%' });
  }

  return rows;
};

// Une ligne par instance (1 à 3), puis une ligne Total par code d'action (bloc E→AS).
const rowsForFile = ({ context, actions, gainsRows, emRows }) => {
  const sorted = [...(actions || [])].sort((a, b) => String(a.excel_worksheetname || '').localeCompare(String(b.excel_worksheetname || '')) || (a.instance_number || 1) - (b.instance_number || 1) || String(a.name || '').localeCompare(String(b.name || ''), 'fr'));
  const groups = new Map();
  const rows = [];
  for (const action of sorted) {
    const key = action.excel_worksheetname;
    if (!ACTION_GAINS_RANGES[key]) continue;
    const instance = action.instance_number || 1;
    if (INSTANCE_COL_OFFSET[instance] === undefined) {
      console.warn(`[aggregationReader] Fiche « ${action.name} » (${key}) ignorée : instance ${instance} hors 1..3.`);
      continue;
    }
    rows.push(...buildCalculatedValueRows({ context, action, instance, ...blockYearRows(gainsRows, emRows, key) }));
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(action);
  }
  for (const [key, group] of groups) rows.push(...buildCalculatedValueRows({ context, action: group[0], instance: 'Total', ...blockYearRows(gainsRows, emRows, key) }));
  return rows;
};

module.exports = {
  GAINS_WORKSHEET,
  EMISSIONS_WORKSHEET,
  ACTION_GAINS_RANGES,
  ACTION_EMISSIONS_RANGES,
  GAINS_FIRST_ROW,
  EMISSIONS_FIRST_ROW,
  EMISSION_TYPES,
  INSTANCE_END_COL,
  INDICATORS_CONFIG,
  GAIN_COLUMNS,
  parseNumber,
  cellNumber,
  extractAggregation,
  readAggregationBlocks,
  rowsForFile,
};
