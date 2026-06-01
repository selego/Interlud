const express = require('express');
const passport = require('passport');
const router = express.Router();
const { capture } = require('../services/sentry');
const { graphFetch, getSiteId, exportExcelFile, sharePointSiteName, getActiveMasterFileId, uploadFileToFolder } = require('../services/microsoftGraph');
const EconomicActor = require('../models/economic_actor');
const Collectivity = require('../models/collectivity');
const Action = require('../models/action');
const ExcelVersion = require('../models/excel_version');
const { runFullExcelSync } = require('../../script/scrap_indicator_excel');
const ERROR_CODES = require('../utils/errorCodes');

// Old ranges kept for action-contribution endpoint
const AGGREGATION_WORKSHEET = 'Agrégation';

const GAINS_WORKSHEET = '4. Gains par action';
const EMISSIONS_WORKSHEET = '3. Émissions par action';
const ACTION_GAINS_RANGES = { B2: { dataStartRow: 19 } };
const ACTION_EMISSIONS_RANGES = { B2: { dataStartRow: 21 } };
const EMISSION_TYPES = ['GES', 'PM', 'NOx', 'HC', 'CO', 'Nrj'];
// Instance-specific column offsets (0-indexed): instance 1 = AK(36), instance 2 = BQ(68), instance 3 = CW(100)
const INSTANCE_COL_OFFSET = { 1: 36, 2: 68, 3: 100 };
const INSTANCE_EMISSION_COL = { GES: 0, PM: 5, NOx: 10, HC: 15, CO: 20, Nrj: 25 };
const INSTANCE_END_COL = { 1: 'BM', 2: 'CS', 3: 'DY' };

const INDICATORS_CONFIG = [
  { key: 'GES', label: 'GES', unit: 'tCO2e' },
  { key: 'PM', label: 'PM', unit: 'tPart' },
  { key: 'HC', label: 'HC', unit: 'tHC' },
  { key: 'NOx', label: 'NOx', unit: 'tNOx' },
  { key: 'CO', label: 'CO', unit: 'tCO' },
  { key: 'Nrj', label: 'Énergie', unit: 'GWh' },
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

router.post('/global-gains', passport.authenticate(['admin', 'user'], { session: false, failWithError: true }), async (req, res) => {
  try {
    const { collectivity } = req.body;
    if (!collectivity) return res.json({ ok: false, data: { error: 'collectivity is required' } });

    let aggregationFileId = null;
    if (req.user?.role === 'economic_actor') {
      const economicActor = await EconomicActor.findById(req.user.economic_actor_id);
      if (!economicActor) return res.status(404).send({ ok: false, code: ERROR_CODES.NOT_FOUND });
      const actorCollectivity = economicActor.collectivities.find((c) => c.id === (collectivity._id || collectivity.id));
      if (!actorCollectivity) return res.status(404).send({ ok: false, code: ERROR_CODES.NOT_FOUND });
      aggregationFileId = actorCollectivity.aggregation_excel_file_id;
    }
    if (!aggregationFileId && req.user?.role !== 'economic_actor') {
      aggregationFileId = (await Collectivity.findById(collectivity._id || collectivity.id))?.aggregation_excel_file_id;
    }
    if (!aggregationFileId) return res.json({ ok: false, data: { error: 'No aggregation Excel file configured' } });

    const siteId = await getSiteId();

    const result = await graphFetch(`/sites/${siteId}/drive/items/${aggregationFileId}/workbook/worksheets/${encodeURIComponent(AGGREGATION_WORKSHEET)}/range(address='B7:K39')`);
    const allValues = result.values || [];

    const gainsPrevisionnels = allValues.slice(6, 13).map((row) => row.slice(0, 9));
    const gainsReels = allValues.slice(16, 23).map((row) => row.slice(0, 10));
    const ecart = allValues.slice(26, 33).map((row) => row.slice(1, 4));

    const yearStartIndex = gainsPrevisionnels[0]?.findIndex((h) => /^\d{4}$/.test(String(h)));
    const years = yearStartIndex >= 0 && gainsPrevisionnels[0] ? gainsPrevisionnels[0].slice(yearStartIndex) : [];

    const getIndicatorData = (indicatorIndex) => {
      const prevRow = gainsPrevisionnels[indicatorIndex + 1] || [];
      const reelRow = gainsReels[indicatorIndex + 1] || [];
      const ecartRow = ecart[indicatorIndex + 1] || [];

      const evolRelIndex = gainsPrevisionnels[0]?.findIndex((h) => String(h).toLowerCase().includes('evolution relative') || String(h).toLowerCase().includes('évolution relative'));
      const evolCumIndex = gainsPrevisionnels[0]?.findIndex((h) => String(h).toLowerCase().includes('evolution cumulée') || String(h).toLowerCase().includes('évolution cumulée') || String(h).toLowerCase().includes('evolution cumul'));

      const relIdx = evolRelIndex >= 0 ? evolRelIndex : 2;
      const cumIdx = evolCumIndex >= 0 ? evolCumIndex : 3;
      const yearIdx = yearStartIndex >= 0 ? yearStartIndex : 4;

      return {
        label: INDICATORS_CONFIG[indicatorIndex]?.label || prevRow[0],
        unit: INDICATORS_CONFIG[indicatorIndex]?.unit,
        evolutionRelativePrev: Math.abs(parseNumber(prevRow[relIdx])),
        evolutionRelativeReel: Math.abs(parseNumber(reelRow[relIdx])),
        evolutionCumuleePrev: Math.abs(parseNumber(prevRow[cumIdx])),
        evolutionCumuleeReel: Math.abs(parseNumber(reelRow[cumIdx])),
        yearlyPrev: years.map((year, i) => ({ year: String(year), value: Math.abs(parseNumber(prevRow[yearIdx + i])) })),
        yearlyReel: years.map((year, i) => ({ year: String(year), value: Math.abs(parseNumber(reelRow[yearIdx + i])) })),
        ecartAbsolu: parseNumber(ecartRow[1]),
        ecartRelatif: parseNumber(ecartRow[2]),
      };
    };

    const indicators = [0, 1, 2, 3, 4, 5].map((index) => getIndicatorData(index));
    const gesData = indicators[0];
    const energieData = indicators[5];
    const avancementTrajectoire = gesData.evolutionCumuleePrev > 0 ? (gesData.evolutionCumuleeReel / gesData.evolutionCumuleePrev) * 100 : 0;

    res.json({ ok: true, data: { gesData, energieData, avancementTrajectoire, indicators } });
  } catch (error) {
    capture(error);
    res.json({ ok: false, data: { error: error.message } });
  }
});

router.post('/action-contribution', passport.authenticate(['admin', 'user'], { session: false, failWithError: true }), async (req, res) => {
  try {
    const { collectivity } = req.body;
    if (!collectivity) return res.json({ ok: false, data: { error: 'collectivity is required' } });

    let aggregationFileId = null;
    if (req.user?.role === 'economic_actor') {
      const economicActor = await EconomicActor.findById(req.user.economic_actor_id);
      if (!economicActor) return res.status(404).send({ ok: false, code: ERROR_CODES.NOT_FOUND });
      const actorCollectivity = economicActor.collectivities.find((c) => c.id === (collectivity._id || collectivity.id));
      if (!actorCollectivity) return res.status(404).send({ ok: false, code: ERROR_CODES.NOT_FOUND });
      aggregationFileId = actorCollectivity.aggregation_excel_file_id;
    }
    if (!aggregationFileId && req.user?.role !== 'economic_actor') {
      aggregationFileId = (await Collectivity.findById(collectivity._id || collectivity.id))?.aggregation_excel_file_id;
    }
    if (!aggregationFileId) return res.json({ ok: false, data: { error: 'No aggregation Excel file configured' } });

    const siteId = await getSiteId();
    const result = await graphFetch(`/sites/${siteId}/drive/items/${aggregationFileId}/workbook/worksheets/${encodeURIComponent(AGGREGATION_WORKSHEET)}/range(address='C40:H300')`);

    const values = result.values || [];
    const actionGains = [];

    const targetActions = ['B2', 'B3', 'B4', 'C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C9'];

    for (let i = 0; i < values.length; i++) {
      const row = values[i];
      if (!row || !row[0]) continue;

      const potentialActionName = String(row[0]).trim();

      if (targetActions.includes(potentialActionName)) {
        if (i + 4 < values.length) {
          const gesRow = values[i + 4];
          if (String(gesRow[0]).trim() !== 'GES') continue;
          const gesValue =
            parseFloat(
              String(gesRow[3] || 0)
                .replace(/tCO2e/gi, '')
                .replace(/\s/g, '')
                .replace(',', '.'),
            ) || 0;

          const gesPrev =
            parseFloat(
              String(gesRow[1] || 0)
                .replace(/tCO2e/gi, '')
                .replace(/\s/g, '')
                .replace(',', '.'),
            ) || 0;
          actionGains.push({ action: potentialActionName, ges: gesValue, ges_prev: gesPrev, type: gesValue <= 0 ? 'gain' : 'degradation' });
        }
      }
    }

    actionGains.sort((a, b) => Math.abs(b.ges) - Math.abs(a.ges));
    res.json({ ok: true, data: actionGains });
  } catch (error) {
    capture(error);
    res.json({ ok: false, code: ERROR_CODES.SERVER_ERROR });
  }
});

const extractAggregation = (action, gainsYearRows, emYearRows) => {
  let processedData = { score: 0, gains: {}, emissions: {} };

  let totalAchievement = 0;
  let achievementCount = 0;

  for (const emissionType of EMISSION_TYPES) {
    if (INSTANCE_EMISSION_COL[emissionType] === undefined) continue;
    const col = (action.type === 'global' ? 4 : INSTANCE_COL_OFFSET[action.instance_number]) + INSTANCE_EMISSION_COL[emissionType];

    const yearlyData = gainsYearRows.map((d) => ({
      year: d.year,
      ecartRefInit: parseNumber(d.row[col]),
      ecartPrevRef: parseNumber(d.row[col + 1]),
      ecartExpostRef: parseNumber(d.row[col + 2]),
      ecartExpostPrev: parseNumber(d.row[col + 3]),
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

router.post('/action_aggregation', passport.authenticate(['admin', 'user'], { session: false, failWithError: true }), async (req, res) => {
  try {
    const { collectivity, action, date_start, date_end } = req.body;
    if (!action) return res.json({ ok: false, data: { error: 'action is required' } });
    if (!collectivity) return res.json({ ok: false, data: { error: 'collectivity is required' } });

    const worksheetKey = action.excel_worksheetname || 'B2';
    if (!ACTION_GAINS_RANGES[worksheetKey]) return res.json({ ok: false, data: { error: `Action '${worksheetKey}' not found in gains configuration` } });

    let aggregationFileId = null;
    if (req.user?.role === 'economic_actor' || (action.type !== 'global' && action.owner === 'economic_actor')) {
      const economicActor = await EconomicActor.findById(req.user?.role === 'economic_actor' ? req.user.economic_actor_id : action.economic_actor_id);
      if (!economicActor) return res.status(404).send({ ok: false, code: ERROR_CODES.NOT_FOUND });
      const actorCollectivity = economicActor.collectivities.find((c) => c.id === (collectivity._id || collectivity.id));
      if (!actorCollectivity) return res.status(404).send({ ok: false, code: ERROR_CODES.NOT_FOUND });
      aggregationFileId = actorCollectivity.aggregation_excel_file_id;
    }
    if (!aggregationFileId && req.user?.role !== 'economic_actor' && !(action.type !== 'global' && action.owner === 'economic_actor')) {
      aggregationFileId = (await Collectivity.findById(collectivity._id || collectivity.id))?.aggregation_excel_file_id;
    }
    if (!aggregationFileId) return res.json({ ok: false, data: { error: 'No aggregation Excel file configured' } });

    const siteId = await getSiteId();
    const endCol = action.type === 'global' ? 'AH' : INSTANCE_END_COL[action.instance_number];

    const [gainsResult, emResult] = await Promise.all([
      graphFetch(`/sites/${siteId}/drive/items/${aggregationFileId}/workbook/worksheets/${encodeURIComponent(GAINS_WORKSHEET)}/range(address='A${ACTION_GAINS_RANGES[worksheetKey].dataStartRow}:${endCol}${ACTION_GAINS_RANGES[worksheetKey].dataStartRow + 40}')`),
      graphFetch(`/sites/${siteId}/drive/items/${aggregationFileId}/workbook/worksheets/${encodeURIComponent(EMISSIONS_WORKSHEET)}/range(address='A${ACTION_EMISSIONS_RANGES[worksheetKey].dataStartRow}:${endCol}${ACTION_EMISSIONS_RANGES[worksheetKey].dataStartRow + 40}')`),
    ]);

    const toYearRows = (r) => (r?.values || []).map((row, i) => ({ year: 2010 + i, row })).filter(({ year }) => year <= 2050 && (!date_start || year >= new Date(date_start).getFullYear()) && (!date_end || year <= new Date(date_end).getFullYear()));
    res.json({ ok: true, data: extractAggregation(action, toYearRows(gainsResult), toYearRows(emResult)) });
  } catch (error) {
    capture(error);
    res.json({ ok: false, data: { error: error.message } });
  }
});

router.post('/parent_action_aggregation', passport.authenticate(['admin', 'user'], { session: false, failWithError: true }), async (req, res) => {
  try {
    const { collectivity, action, date_start, date_end } = req.body;
    if (!action) return res.json({ ok: false, data: { error: 'action is required' } });
    if (!collectivity) return res.json({ ok: false, data: { error: 'collectivity is required' } });

    const worksheetKey = action.excel_worksheetname || 'B2';
    if (!ACTION_GAINS_RANGES[worksheetKey]) return res.json({ ok: false, data: { error: `Action '${worksheetKey}' not found in gains configuration` } });

    let aggregationFileId = null;
    if (req.user?.role === 'economic_actor' || (action.type !== 'global' && action.owner === 'economic_actor')) {
      const economicActor = await EconomicActor.findById(req.user?.role === 'economic_actor' ? req.user.economic_actor_id : action.economic_actor_id);
      if (!economicActor) return res.status(404).send({ ok: false, code: ERROR_CODES.NOT_FOUND });
      const actorCollectivity = economicActor.collectivities.find((c) => c.id === (collectivity._id || collectivity.id));
      if (!actorCollectivity) return res.status(404).send({ ok: false, code: ERROR_CODES.NOT_FOUND });
      aggregationFileId = actorCollectivity.aggregation_excel_file_id;
    }
    if (!aggregationFileId && req.user?.role !== 'economic_actor' && !(action.type !== 'global' && action.owner === 'economic_actor')) {
      aggregationFileId = (await Collectivity.findById(collectivity._id || collectivity.id))?.aggregation_excel_file_id;
    }
    if (!aggregationFileId) return res.json({ ok: false, data: { error: 'No aggregation Excel file configured' } });

    const siteId = await getSiteId();

    const [gainsResult, emResult] = await Promise.all([
      graphFetch(`/sites/${siteId}/drive/items/${aggregationFileId}/workbook/worksheets/${encodeURIComponent(GAINS_WORKSHEET)}/range(address='A${ACTION_GAINS_RANGES[worksheetKey].dataStartRow}:DY${ACTION_GAINS_RANGES[worksheetKey].dataStartRow + 40}')`),
      graphFetch(`/sites/${siteId}/drive/items/${aggregationFileId}/workbook/worksheets/${encodeURIComponent(EMISSIONS_WORKSHEET)}/range(address='A${ACTION_EMISSIONS_RANGES[worksheetKey].dataStartRow}:DY${ACTION_EMISSIONS_RANGES[worksheetKey].dataStartRow + 40}')`),
    ]);

    const toYearRows = (r) => (r?.values || []).map((row, i) => ({ year: 2010 + i, row })).filter(({ year }) => year <= 2050 && (!date_start || year >= new Date(date_start).getFullYear()) && (!date_end || year <= new Date(date_end).getFullYear()));
    const gainsYearRows = toYearRows(gainsResult);
    const emYearRows = toYearRows(emResult);

    let query = { type: { $ne: 'config' }, collectivity_id: collectivity._id, action_parent_id: action._id };
    if (req.user.role === 'economic_actor' || (action.type !== 'global' && action.owner === 'economic_actor')) {
      query.owner = 'economic_actor';
      query.economic_actor_id = req.user?.role === 'economic_actor' ? req.user.economic_actor_id : action.economic_actor_id;
    }
    if (!query.owner) query.owner = 'collectivity';
    const actions = await Action.find(query).sort({ name: 1 });
    const aggregations = {};
    for (const a of actions) {
      aggregations[a._id] = extractAggregation(a, gainsYearRows, emYearRows);
    }
    res.json({ ok: true, data: { actions, aggregations } });
  } catch (error) {
    capture(error);
    res.json({ ok: false, data: { error: error.message } });
  }
});

router.post('/compare_actions', passport.authenticate(['admin', 'user'], { session: false, failWithError: true }), async (req, res) => {
  try {
    const { collectivity, action_ids, date_start, date_end } = req.body;
    if (!collectivity) return res.json({ ok: false, data: { error: 'collectivity is required' } });
    if (!action_ids?.length) return res.json({ ok: false, data: { error: 'action_ids is required' } });

    const actions = await Action.find({ _id: { $in: action_ids } });
    if (!actions.length) return res.json({ ok: false, data: { error: 'no actions found' } });

    const worksheetKey = actions[0].excel_worksheetname || 'B2';
    if (!ACTION_GAINS_RANGES[worksheetKey]) return res.json({ ok: false, data: { error: `Action '${worksheetKey}' not found in gains configuration` } });

    const firstAction = actions[0];
    let aggregationFileId = null;
    if (req.user?.role === 'economic_actor' || (firstAction.type !== 'global' && firstAction.owner === 'economic_actor')) {
      const economicActor = await EconomicActor.findById(req.user?.role === 'economic_actor' ? req.user.economic_actor_id : firstAction.economic_actor_id);
      if (!economicActor) return res.status(404).send({ ok: false, code: ERROR_CODES.NOT_FOUND });
      const actorCollectivity = economicActor.collectivities.find((c) => c.id === (collectivity._id || collectivity.id));
      if (!actorCollectivity) return res.status(404).send({ ok: false, code: ERROR_CODES.NOT_FOUND });
      aggregationFileId = actorCollectivity.aggregation_excel_file_id;
    }
    if (!aggregationFileId && req.user?.role !== 'economic_actor' && !(firstAction.type !== 'global' && firstAction.owner === 'economic_actor')) {
      aggregationFileId = (await Collectivity.findById(collectivity._id || collectivity.id))?.aggregation_excel_file_id;
    }
    if (!aggregationFileId) return res.json({ ok: false, data: { error: 'No aggregation Excel file configured' } });

    const siteId = await getSiteId();

    const [gainsResult, emResult] = await Promise.all([
      graphFetch(`/sites/${siteId}/drive/items/${aggregationFileId}/workbook/worksheets/${encodeURIComponent(GAINS_WORKSHEET)}/range(address='A${ACTION_GAINS_RANGES[worksheetKey].dataStartRow}:DY${ACTION_GAINS_RANGES[worksheetKey].dataStartRow + 40}')`),
      graphFetch(`/sites/${siteId}/drive/items/${aggregationFileId}/workbook/worksheets/${encodeURIComponent(EMISSIONS_WORKSHEET)}/range(address='A${ACTION_EMISSIONS_RANGES[worksheetKey].dataStartRow}:DY${ACTION_EMISSIONS_RANGES[worksheetKey].dataStartRow + 40}')`),
    ]);

    const toYearRows = (r) => (r?.values || []).map((row, i) => ({ year: 2010 + i, row })).filter(({ year }) => year <= 2050 && (!date_start || year >= new Date(date_start).getFullYear()) && (!date_end || year <= new Date(date_end).getFullYear()));
    const gainsYearRows = toYearRows(gainsResult);
    const emYearRows = toYearRows(emResult);

    const TYPE_ORDER = { init: 0, ref: 1, expost: 2, prev: 3 };
    const DATA_KEYS = { init: 'initiale', ref: 'reference', expost: 'expost', prev: 'previsionnelle' };
    const GAIN_KEYS = ['ecartRefInit', 'ecartExpostRef', 'ecartPrevRef', 'ecartExpostPrev'];

    const buildBars = (action) => {
      const bars = [];
      if (action.year_init) bars.push({ year: action.year_init, type: 'init' });
      const expostEntries = action.excel_files_expost?.length ? action.excel_files_expost.filter((e) => e.year_expost) : action.year_expost ? [{ year_expost: action.year_expost, year_ref: action.year_ref }] : [];
      const prevEntries = action.exel_files_prev?.length ? action.exel_files_prev.filter((e) => e.year_prev) : action.year_prev ? [{ year_prev: action.year_prev, year_ref: action.year_ref }] : [];
      const addedRef = new Set();
      for (const e of expostEntries) {
        if (e.year_ref && !addedRef.has(e.year_ref)) {
          bars.push({ year: e.year_ref, type: 'ref' });
          addedRef.add(e.year_ref);
        }
        bars.push({ year: e.year_expost, type: 'expost' });
      }
      for (const e of prevEntries) {
        if (e.year_ref && !addedRef.has(e.year_ref)) {
          bars.push({ year: e.year_ref, type: 'ref' });
          addedRef.add(e.year_ref);
        }
        bars.push({ year: e.year_prev, type: 'prev' });
      }
      if (!addedRef.size && action.year_ref) bars.push({ year: action.year_ref, type: 'ref' });
      bars.sort((a, b) => a.year - b.year || TYPE_ORDER[a.type] - TYPE_ORDER[b.type]);
      return bars;
    };

    const interpolate = (known, years) => {
      const sorted = [...known.entries()].sort(([a], [b]) => a - b);
      const out = {};
      for (const year of years) {
        const k = known.get(year);
        if (k != null) {
          out[year] = { value: k.value, situationType: k.type, interpolated: false };
          continue;
        }
        let before = null,
          after = null;
        for (const [y, e] of sorted) {
          if (y < year && e.value != null) before = { year: y, value: e.value };
          if (y > year && e.value != null && !after) after = { year: y, value: e.value };
        }
        if (before && after) {
          const v = before.value + ((year - before.year) / (after.year - before.year)) * (after.value - before.value);
          out[year] = { value: Math.round(v * 100) / 100, situationType: null, interpolated: true };
        }
      }
      return out;
    };

    const years = [...new Set([...emYearRows.map((d) => d.year), ...gainsYearRows.map((d) => d.year)])].sort((a, b) => a - b);
    const emissions = {};
    const gains = {};
    const availableYears = {};
    const availableIndicators = new Set();
    const availableGainTypes = new Set();

    for (const action of actions) {
      const agg = extractAggregation(action, gainsYearRows, emYearRows);
      const bars = buildBars(action);
      emissions[action._id] = {};
      gains[action._id] = {};

      for (const [indicator, emData] of Object.entries(agg.emissions)) {
        const byYear = new Map(emData.yearlyData.map((d) => [d.year, d]));
        const known = new Map();
        for (const bar of bars) {
          const row = byYear.get(bar.year);
          const val = row?.[DATA_KEYS[bar.type]];
          if (val != null && val > 0) known.set(bar.year, { value: val, type: bar.type });
        }
        if (!known.size) continue;
        availableIndicators.add(indicator);
        if (!availableYears[indicator]) availableYears[indicator] = new Set();
        for (const y of known.keys()) availableYears[indicator].add(y);
        emissions[action._id][indicator] = interpolate(known, years);
      }

      for (const [indicator, gainsData] of Object.entries(agg.gains)) {
        gains[action._id][indicator] = {};
        const gmap = new Map(gainsData.yearlyData.map((d) => [d.year, d]));
        for (const gainType of GAIN_KEYS) {
          const known = new Map();
          for (const bar of bars) {
            const row = gmap.get(bar.year);
            if (row && row[gainType] !== 0) known.set(bar.year, { value: row[gainType], type: bar.type });
          }
          if (known.size) availableGainTypes.add(gainType);
          gains[action._id][indicator][gainType] = interpolate(known, years);
        }
      }
    }

    const availableYearsOut = {};
    for (const [ind, set] of Object.entries(availableYears)) availableYearsOut[ind] = [...set].sort((a, b) => a - b);

    res.json({
      ok: true,
      data: {
        years,
        emissions,
        gains,
        availableIndicators: [...availableIndicators],
        availableGainTypes: [...availableGainTypes],
        availableYears: availableYearsOut,
      },
    });
  } catch (error) {
    capture(error);
    res.json({ ok: false, data: { error: error.message } });
  }
});

// Lance la synchronisation complète en arrière-plan puis met à jour le statut de la version.
async function runMasterSyncInBackground(versionId, newFileId) {
  try {
    const stats = await runFullExcelSync({ masterFileId: newFileId, regenerateCollectivities: true });
    // La nouvelle version devient le master actif ; on désactive les précédentes.
    await ExcelVersion.updateMany({ _id: { $ne: versionId } }, { $set: { is_active: false } });
    await ExcelVersion.findByIdAndUpdate(versionId, { $set: { status: 'done', is_active: true, stats } });
  } catch (error) {
    capture(error);
    await ExcelVersion.findByIdAndUpdate(versionId, { $set: { status: 'error', error_message: error.message } });
  }
}

// Upload d'une nouvelle version du fichier master Excel (admin uniquement).
// Le fichier est déposé sur SharePoint comme nouveau fichier versionné, puis la
// synchronisation des indicateurs tourne en arrière-plan (statut suivi en base).
router.post('/upload-master', passport.authenticate('admin', { session: false, failWithError: true }), async (req, res) => {
  try {
    const { fileBase64 } = req.body;
    if (!fileBase64) return res.status(400).json({ ok: false, data: { error: 'fileBase64 is required' } });

    // Refuser si une synchronisation est déjà en cours
    const ongoing = await ExcelVersion.findOne({ status: 'processing' });
    if (ongoing) return res.json({ ok: false, data: { error: 'Une synchronisation est déjà en cours' } });

    const buffer = Buffer.from(fileBase64, 'base64');

    // Récupérer le master actif pour en déduire le dossier parent et la version
    const siteId = await getSiteId();
    const currentMasterId = await getActiveMasterFileId();
    const currentMaster = await graphFetch(`/sites/${siteId}/drive/items/${currentMasterId}`);
    const parentFolderId = currentMaster.parentReference?.id;
    if (!parentFolderId) return res.json({ ok: false, data: { error: 'Impossible de localiser le dossier du fichier master' } });

    const latestVersion = await ExcelVersion.findOne({}).sort({ version: -1 });
    const nameVersionMatch = currentMaster.name.match(/_V(\d+)\.xlsx$/i);
    const newVersion = Math.max(latestVersion?.version || 0, nameVersionMatch ? parseInt(nameVersionMatch[1], 10) : 0) + 1;
    const baseName = currentMaster.name.replace(/\.xlsx$/i, '').replace(/_V\d+$/i, '');
    const newFileName = `${baseName}_V${newVersion}.xlsx`;

    const newFileId = await uploadFileToFolder(parentFolderId, newFileName, buffer);

    const excelVersion = await ExcelVersion.create({
      file_name: newFileName,
      excel_file_id: newFileId,
      version: newVersion,
      status: 'processing',
      is_active: false,
      uploaded_by_id: req.user._id?.toString(),
      uploaded_by_name: req.user.name || req.user.email,
    });

    // Synchronisation en arrière-plan (best effort, non bloquante pour la réponse)
    runMasterSyncInBackground(excelVersion._id, newFileId);

    res.json({ ok: true, data: excelVersion });
  } catch (error) {
    capture(error);
    res.json({ ok: false, data: { error: error.message } });
  }
});

router.get('/versions', passport.authenticate('admin', { session: false, failWithError: true }), async (req, res) => {
  try {
    const versions = await ExcelVersion.find({}).sort({ version: -1 });
    res.json({ ok: true, data: versions });
  } catch (error) {
    capture(error);
    res.json({ ok: false, data: { error: error.message } });
  }
});

router.get('/versions/:id', passport.authenticate('admin', { session: false, failWithError: true }), async (req, res) => {
  try {
    const version = await ExcelVersion.findById(req.params.id);
    if (!version) return res.status(404).json({ ok: false, code: ERROR_CODES.NOT_FOUND });
    res.json({ ok: true, data: version });
  } catch (error) {
    capture(error);
    res.json({ ok: false, data: { error: error.message } });
  }
});

router.post('/export', passport.authenticate(['admin', 'user'], { session: false, failWithError: true }), async (req, res) => {
  try {
    const { fileId } = req.body;
    if (!fileId) return res.json({ ok: false, data: { error: 'fileId is required' } });
    const result = await exportExcelFile(fileId);
    res.json({ ok: true, data: result });
  } catch (error) {
    capture(error);
    res.json({ ok: false, data: { error: error.message } });
  }
});

module.exports = router;
