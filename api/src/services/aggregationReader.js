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
  { header: 'Année de référence liée', key: 'anneeRef', width: 24 },
  { header: 'Valeur', key: 'valeur', width: 14 },
  { header: 'Unité', key: 'unite', width: 12 },
  { header: 'Source', key: 'source', width: 42 },
  { header: "Date d'extraction", key: 'dateExtraction', width: 18 },
];

const parseNumber = (val) => {
  if (val === null || val === undefined || val === '') return 0;
  if (typeof val === 'number') return val;
  if (typeof val === 'string') {
    const cleaned = val.replace(/\s/g, '').replace(',', '.');
    const num = parseFloat(cleaned);
    return isNaN(num) ? 0 : num;
  }
  return 0;
};

const extractAggregation = (action, gainsYearRows, emYearRows) => {
  let processedData = { score: 0, gains: {}, emissions: {} };

  let totalAchievement = 0;
  let achievementCount = 0;

  for (const emissionType of EMISSION_TYPES) {
    if (INSTANCE_EMISSION_COL[emissionType] === undefined) continue;
    const col = (action.type === 'global' ? 4 : INSTANCE_COL_OFFSET[action.instance_number]) + INSTANCE_EMISSION_COL[emissionType];

    // Gains : 6 écarts par type (Réf-Init, Prév-Init, Prév-Réf, Expost-Init, Expost-Réf, Expost-Prév)
    const yearlyData = gainsYearRows.map((d) => ({
      year: d.year,
      ecartRefInit: parseNumber(d.row[col]),
      ecartPrevRef: parseNumber(d.row[col + 2]),
      ecartExpostRef: parseNumber(d.row[col + 4]),
      ecartExpostPrev: parseNumber(d.row[col + 5]),
    }));

    const latestWithExpost = [...yearlyData].reverse().find((d) => d.ecartExpostRef !== 0);
    const objective = latestWithExpost ? Math.abs(latestWithExpost.ecartPrevRef) : 0;
    const real = latestWithExpost ? Math.abs(latestWithExpost.ecartExpostRef) : 0;

    let achievement = null;
    if (objective > 0 && real > 0) achievement = (real / objective) * 100;

    if (achievement !== null) {
      totalAchievement += Math.min(achievement, 100);
      achievementCount++;
    }

    processedData.gains[emissionType] = { label: emissionType, unit: INDICATORS_CONFIG.find((c) => c.key === emissionType)?.unit, objective, real, objectiveVal: objective, realVal: real, achievement, yearlyData };
  }

  processedData.score = achievementCount > 0 ? Math.round(totalAchievement / achievementCount) : 0;

  for (const emissionType of EMISSION_TYPES) {
    if (INSTANCE_EMISSION_COL[emissionType] === undefined) continue;
    const emCol = (action.type === 'global' ? 4 : INSTANCE_COL_OFFSET[action.instance_number]) + INSTANCE_EMISSION_COL[emissionType];
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

const columnLetter = (index0) => {
  let n = index0 + 1;
  let letters = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    letters = String.fromCharCode(65 + rem) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
};

const sheetRangeAddress = (firstRow, lastRow) => `A${firstRow}:FU${lastRow}`;

const actionBlockAddress = (dataStartRow) => `A${dataStartRow}:FU${dataStartRow + BLOCK_ROWS - 1}`;

const isOversizedRangeError = (error) => {
  const name = error?.name || '';
  if (name === 'TimeoutError' || name === 'AbortError') return true;
  const message = String(error?.message || '');
  if (/timeout|timed out|aborted/i.test(message)) return true;
  if (/\b504\b/.test(message)) return true;
  return false;
};

const asValues = (result) => {
  if (Array.isArray(result)) return result;
  if (result && Array.isArray(result.values)) return result.values;
  return [];
};

const emptySheet = (firstRow, lastRow) => Array.from({ length: lastRow - firstRow + 1 }, () => []);

const stitchBlocks = (firstRow, lastRow, blocks) => {
  const rows = emptySheet(firstRow, lastRow);
  for (const block of blocks) {
    const values = asValues(block.values);
    for (let i = 0; i < values.length && i < BLOCK_ROWS; i++) {
      const index = block.dataStartRow - firstRow + i;
      if (index < 0 || index >= rows.length) continue;
      rows[index] = values[i] || [];
    }
  }
  return rows;
};

const sliceActionYearRows = (allRows, firstRow, dataStartRow) => {
  const start = dataStartRow - firstRow;
  const slice = (allRows || []).slice(start, start + BLOCK_ROWS);
  return slice.map((row, i) => ({ year: YEAR_START + i, row: row || [], excelRow: dataStartRow + i })).filter(({ year }) => year <= 2050);
};

async function defaultFetchRange(fileId, worksheet, address) {
  const { graphFetch, getSiteId } = require('./microsoftGraph');
  const siteId = await getSiteId();
  const endpoint = `/sites/${siteId}/drive/items/${fileId}/workbook/worksheets/${encodeURIComponent(worksheet)}/range(address='${address}')`;
  const result = await graphFetch(endpoint);
  return result?.values || [];
}

// Chemin normal : une plage par feuille. Les retries 429/5xx sont déjà dans graphFetch.
// Découpage par bloc d'action seulement si cette lecture part en timeout ou en 504.
async function readSheetRows(worksheet, ranges, firstRow, lastRow, fetchRange) {
  const fullAddress = sheetRangeAddress(firstRow, lastRow);
  try {
    return asValues(await fetchRange(worksheet, fullAddress));
  } catch (error) {
    if (!isOversizedRangeError(error)) throw error;
  }
  console.warn(`[aggregationReader] Plage complète « ${worksheet} » trop volumineuse, lecture par bloc d'action.`);
  const blocks = [];
  for (const range of Object.values(ranges)) {
    const values = asValues(await fetchRange(worksheet, actionBlockAddress(range.dataStartRow)));
    blocks.push({ dataStartRow: range.dataStartRow, values });
  }
  return stitchBlocks(firstRow, lastRow, blocks);
}

// { gainsRows, emRows } alignés sur A19:FU572 et A21:FU574 (ligne 0 = première ligne de la plage, colonne 0 = A).
async function readAggregationBlocks(aggregationFileId, deps = {}) {
  if (!aggregationFileId) throw new Error("Identifiant de fichier d'agrégation manquant");
  const fetchRange = deps.fetchRange || ((worksheet, address) => defaultFetchRange(aggregationFileId, worksheet, address));
  const [gainsRows, emRows] = await Promise.all([
    readSheetRows(GAINS_WORKSHEET, ACTION_GAINS_RANGES, GAINS_FIRST_ROW, GAINS_LAST_ROW, fetchRange),
    readSheetRows(EMISSIONS_WORKSHEET, ACTION_EMISSIONS_RANGES, EMISSIONS_FIRST_ROW, EMISSIONS_LAST_ROW, fetchRange),
  ]);
  return { gainsRows, emRows };
}

const indicatorByKey = (key) => INDICATORS_CONFIG.find((c) => c.key === key);

const emissionBaseColumn = (instance) => {
  if (instance === 'Total') return TOTAL_COL_OFFSET;
  const offset = INSTANCE_COL_OFFSET[instance];
  if (offset === undefined) return null;
  return offset;
};

const addYear = (years, value) => {
  if (value === null || value === undefined || value === '') return;
  const n = typeof value === 'number' ? value : Number(value);
  if (Number.isFinite(n)) years.add(n);
};

const usefulYears = (action) => {
  const years = new Set();
  addYear(years, action.year_init);
  addYear(years, action.year_ref);
  addYear(years, action.year_prev);
  addYear(years, action.year_expost);
  for (const year of action.year_inits || []) addYear(years, year);
  for (const file of action.exel_files_prev || []) {
    addYear(years, file.year_prev);
    addYear(years, file.year_ref);
  }
  for (const file of action.excel_files_expost || []) {
    addYear(years, file.year_expost);
    addYear(years, file.year_ref);
  }
  return years;
};

const referenceFiles = (action) => {
  const prev = [...(action.exel_files_prev || [])];
  if (!prev.some((f) => f.year_prev != null) && action.year_prev != null) prev.push({ year_prev: action.year_prev, year_ref: action.year_ref });
  const expost = [...(action.excel_files_expost || [])];
  if (!expost.some((f) => f.year_expost != null) && action.year_expost != null) expost.push({ year_expost: action.year_expost, year_ref: action.year_ref });
  return { prev, expost };
};

const linkedReferenceYear = (action, year, situation) => {
  const { prev, expost } = referenceFiles(action);
  if (situation === 'init') return null;
  if (situation === 'ref') return year;
  if (situation === 'prev') {
    const match = prev.find((f) => f.year_prev === year);
    if (match && match.year_ref != null) return match.year_ref;
    return null;
  }
  if (situation === 'expost') {
    const match = expost.find((f) => f.year_expost === year);
    if (match && match.year_ref != null) return match.year_ref;
    return null;
  }
  const prevMatch = prev.find((f) => f.year_prev === year);
  if (prevMatch && prevMatch.year_ref != null) return prevMatch.year_ref;
  const expostMatch = expost.find((f) => f.year_expost === year);
  if (expostMatch && expostMatch.year_ref != null) return expostMatch.year_ref;
  const asRef = [...prev, ...expost].find((f) => f.year_ref === year);
  if (asRef && asRef.year_ref != null) return asRef.year_ref;
  if (action.year_ref != null && year === action.year_ref) return action.year_ref;
  return null;
};

// Cellule réellement vide → null. 0 reste 0 (filtré ensuite par includeZero).
const cellNumber = (val) => {
  if (val === null || val === undefined || val === '') return null;
  if (typeof val === 'number') return Number.isFinite(val) ? val : null;
  if (typeof val === 'object') {
    if (Object.prototype.hasOwnProperty.call(val, 'result')) return cellNumber(val.result);
    return null;
  }
  if (typeof val !== 'string') return null;
  const trimmed = val.trim();
  if (!trimmed || trimmed.startsWith('#')) return null;
  const num = parseFloat(trimmed.replace(/\s/g, '').replace(',', '.'));
  if (!Number.isFinite(num)) return null;
  return num;
};

const keepValue = (value, includeZero) => {
  if (value === null) return false;
  if (value === 0 && !includeZero) return false;
  return true;
};

const sourceRef = (worksheet, col, excelRow) => `${worksheet}!${columnLetter(col)}${excelRow}`;

const blank = (value) => (value === null || value === undefined ? '' : value);

const buildCalculatedValueRows = ({ collectivityName, siren, department, owner, actorName, action, instance, gainsYearRows = [], emYearRows = [], allowedYears, allYears = false, includeZero = false, extractedAt }) => {
  const baseCol = emissionBaseColumn(instance);
  if (baseCol === null) return [];
  const years = allowedYears || usefulYears(action);
  const instanceLabel = instance === 'Total' ? 'Total' : instance;
  const base = {
    collectivite: collectivityName || '',
    siren: blank(siren),
    departement: blank(department),
    proprietaire: owner || '',
    acteur: actorName || '',
    fiche: action.excel_worksheetname || '',
    actionReference: action.action_parent_name || '',
    nomFiche: instance === 'Total' ? action.action_parent_name || action.name || '' : action.name || '',
    instance: instanceLabel,
    brouillon: instance === 'Total' ? '' : action.is_draft ? 'Oui' : 'Non',
    dateExtraction: extractedAt || '',
  };
  const rows = [];
  const yearOk = (year) => {
    if (allYears) return year >= YEAR_START && year <= 2050;
    return years.has(year);
  };
  const emByYear = new Map(emYearRows.map((d) => [d.year, d]));
  const gainsByYear = new Map(gainsYearRows.map((d) => [d.year, d]));
  const orderedYears = [...new Set([...emByYear.keys(), ...gainsByYear.keys()])].filter(yearOk).sort((a, b) => a - b);

  for (const emissionType of EMISSION_TYPES) {
    const typeCol = INSTANCE_EMISSION_COL[emissionType];
    if (typeCol === undefined) continue;
    const col = baseCol + typeCol;
    const polluant = indicatorByKey(emissionType)?.label || emissionType;
    const unite = indicatorByKey(emissionType)?.unit || '';

    for (const year of orderedYears) {
      const em = emByYear.get(year);
      if (em) {
        for (const situation of EMISSION_SITUATIONS) {
          const valeur = cellNumber(em.row[col + situation.offset]);
          if (!keepValue(valeur, includeZero)) continue;
          rows.push({
            ...base,
            famille: 'Émission',
            polluant,
            situation: situation.label,
            annee: year,
            anneeRef: blank(linkedReferenceYear(action, year, situation.label)),
            valeur,
            unite,
            source: sourceRef(EMISSIONS_WORKSHEET, col + situation.offset, em.excelRow),
          });
        }
      }
      const gain = gainsByYear.get(year);
      if (!gain) continue;
      for (const gap of GAIN_COLUMNS) {
        const valeur = cellNumber(gain.row[col + gap.offset]);
        if (!keepValue(valeur, includeZero)) continue;
        rows.push({
          ...base,
          famille: 'Gain',
          polluant,
          situation: gap.label,
          annee: year,
          anneeRef: blank(linkedReferenceYear(action, year, gap.label)),
          valeur,
          unite,
          source: sourceRef(GAINS_WORKSHEET, col + gap.offset, gain.excelRow),
        });
      }
    }

    const yearly = gainsYearRows.map((d) => ({
      year: d.year,
      excelRow: d.excelRow,
      ecartPrevRef: parseNumber(d.row[col + 2]),
      ecartExpostRef: parseNumber(d.row[col + 4]),
    }));
    const latest = [...yearly].reverse().find((d) => d.ecartExpostRef !== 0);
    if (!latest) continue;
    const objective = Math.abs(latest.ecartPrevRef);
    const real = Math.abs(latest.ecartExpostRef);
    const achievement = objective > 0 && real > 0 ? (real / objective) * 100 : null;
    const attainment = [
      { situation: 'objectif', valeur: objective, unite, source: sourceRef(GAINS_WORKSHEET, col + 2, latest.excelRow) },
      { situation: 'réel', valeur: real, unite, source: sourceRef(GAINS_WORKSHEET, col + 4, latest.excelRow) },
      { situation: 'taux', valeur: achievement, unite: '%', source: `${sourceRef(GAINS_WORKSHEET, col + 2, latest.excelRow)}; ${sourceRef(GAINS_WORKSHEET, col + 4, latest.excelRow)}` },
    ];
    for (const item of attainment) {
      if (!keepValue(item.valeur, includeZero)) continue;
      rows.push({
        ...base,
        famille: 'Atteinte',
        polluant,
        situation: item.situation,
        annee: latest.year,
        anneeRef: blank(linkedReferenceYear(action, latest.year, item.situation)),
        valeur: item.valeur,
        unite: item.unite,
        source: item.source,
      });
    }
  }

  return rows;
};

const buildTotalAction = (actions) => {
  const sorted = [...actions].sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'fr'));
  const first = sorted[0] || {};
  return {
    excel_worksheetname: first.excel_worksheetname,
    action_parent_name: first.action_parent_name || first.name || '',
    name: first.action_parent_name || first.name || '',
    is_draft: false,
    owner: first.owner,
    economic_actor_name: first.economic_actor_name || '',
    exel_files_prev: sorted.flatMap((a) => a.exel_files_prev || []),
    excel_files_expost: sorted.flatMap((a) => a.excel_files_expost || []),
    year_inits: sorted.map((a) => a.year_init),
    year_ref: first.year_ref,
    year_prev: first.year_prev,
    year_expost: first.year_expost,
  };
};

const unionUsefulYears = (actions) => {
  const years = new Set();
  for (const action of actions) {
    for (const year of usefulYears(action)) years.add(year);
  }
  return years;
};

const rowsForFile = ({ collectivityName, siren, department, owner, actorName, actions, gainsRows, emRows, allYears = false, includeZero = false, extractedAt }) => {
  const sorted = [...(actions || [])].sort((a, b) => String(a.excel_worksheetname || '').localeCompare(String(b.excel_worksheetname || '')) || (a.instance_number || 1) - (b.instance_number || 1) || String(a.name || '').localeCompare(String(b.name || ''), 'fr'));
  const groups = new Map();
  const rows = [];
  for (const action of sorted) {
    const key = action.excel_worksheetname;
    if (!ACTION_GAINS_RANGES[key] || !ACTION_EMISSIONS_RANGES[key]) continue;
    const instance = action.instance_number || 1;
    if (emissionBaseColumn(instance) === null) continue;
    const gainsYearRows = sliceActionYearRows(gainsRows, GAINS_FIRST_ROW, ACTION_GAINS_RANGES[key].dataStartRow);
    const emYearRows = sliceActionYearRows(emRows, EMISSIONS_FIRST_ROW, ACTION_EMISSIONS_RANGES[key].dataStartRow);
    rows.push(...buildCalculatedValueRows({ collectivityName, siren, department, owner, actorName, action, instance, gainsYearRows, emYearRows, allYears, includeZero, extractedAt }));
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(action);
  }
  for (const [key, group] of groups) {
    const gainsYearRows = sliceActionYearRows(gainsRows, GAINS_FIRST_ROW, ACTION_GAINS_RANGES[key].dataStartRow);
    const emYearRows = sliceActionYearRows(emRows, EMISSIONS_FIRST_ROW, ACTION_EMISSIONS_RANGES[key].dataStartRow);
    rows.push(
      ...buildCalculatedValueRows({
        collectivityName,
        siren,
        department,
        owner,
        actorName,
        action: buildTotalAction(group),
        instance: 'Total',
        gainsYearRows,
        emYearRows,
        allowedYears: unionUsefulYears(group),
        allYears,
        includeZero,
        extractedAt,
      }),
    );
  }
  return rows;
};

module.exports = {
  GAINS_WORKSHEET,
  EMISSIONS_WORKSHEET,
  ACTION_GAINS_RANGES,
  ACTION_EMISSIONS_RANGES,
  GAINS_FIRST_ROW,
  GAINS_LAST_ROW,
  EMISSIONS_FIRST_ROW,
  EMISSIONS_LAST_ROW,
  EMISSION_TYPES,
  INSTANCE_COL_OFFSET,
  TOTAL_COL_OFFSET,
  INSTANCE_EMISSION_COL,
  INSTANCE_END_COL,
  INDICATORS_CONFIG,
  GAIN_COLUMNS,
  EMISSION_SITUATIONS,
  CALCULATED_COLUMNS,
  parseNumber,
  extractAggregation,
  columnLetter,
  sheetRangeAddress,
  actionBlockAddress,
  isOversizedRangeError,
  stitchBlocks,
  sliceActionYearRows,
  readAggregationBlocks,
  emissionBaseColumn,
  usefulYears,
  linkedReferenceYear,
  cellNumber,
  buildCalculatedValueRows,
  buildTotalAction,
  rowsForFile,
};
