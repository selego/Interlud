const express = require('express');
const passport = require('passport');
const router = express.Router();
const { capture } = require('../services/sentry');
const { graphFetch, exportExcelFile, sharePointSiteName } = require('../services/microsoftGraph');
const EconomicActor = require('../models/economic_actor');
const Collectivity = require('../models/collectivity');
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
    let { collectivity } = req.body;
    if (!collectivity) return res.json({ ok: false, data: { error: 'collectivity is required' } });
    if (req.user?.role === 'economic_actor') {
      const economicActor = await EconomicActor.findById(req.user.economic_actor_id);
      if (!economicActor) return res.status(404).send({ ok: false, code: ERROR_CODES.NOT_FOUND });
      collectivity = economicActor.collectivities.find((c) => c.id === collectivity._id);
    }

    if (!collectivity) return res.status(404).send({ ok: false, code: ERROR_CODES.NOT_FOUND });

    const siteId = (await graphFetch(`/sites/${sharePointSiteName}.sharepoint.com`)).id;

    const result = await graphFetch(`/sites/${siteId}/drive/items/${collectivity.excelFileId}/workbook/worksheets/${encodeURIComponent(AGGREGATION_WORKSHEET)}/range(address='B7:K39')`);
    const allValues = result.values || [];

    const yearsData = allValues.slice(0, 3).map((row) => row.slice(0, 2));
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
    let { collectivity } = req.body;
    if (!collectivity) return res.json({ ok: false, data: { error: 'collectivity is required' } });
    if (req.user?.role === 'economic_actor') {
      const economicActor = await EconomicActor.findById(req.user.economic_actor_id);
      if (!economicActor) return res.status(404).send({ ok: false, code: ERROR_CODES.NOT_FOUND });
      collectivity = economicActor.collectivities.find((c) => c.id === collectivity._id);
    }

    if (!collectivity) return res.status(404).send({ ok: false, code: ERROR_CODES.NOT_FOUND });

    const siteId = (await graphFetch(`/sites/${sharePointSiteName}.sharepoint.com`)).id;
    const result = await graphFetch(`/sites/${siteId}/drive/items/${collectivity.excelFileId}/workbook/worksheets/${encodeURIComponent(AGGREGATION_WORKSHEET)}/range(address='C40:H300')`);

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

// Fetch aggregated gains for a specific action from "4. Gains par action" sheet (collectivity aggregation file)
router.post('/action_aggregation', passport.authenticate(['admin', 'user'], { session: false, failWithError: true }), async (req, res) => {
  try {
    let { collectivity, action, date_start, date_end } = req.body;
    if (!action) return res.json({ ok: false, data: { error: 'action is required' } });
    if (!collectivity) return res.json({ ok: false, data: { error: 'collectivity is required' } });
    const instanceOffset = INSTANCE_COL_OFFSET[action.instance_number || 1] || INSTANCE_COL_OFFSET[1];
    const endCol = INSTANCE_END_COL[action.instance_number || 1] || INSTANCE_END_COL[1];
    const wsName = action.excel_worksheetname;

    const yearStart = date_start ? new Date(date_start).getFullYear() : null;
    const yearEnd = date_end ? new Date(date_end).getFullYear() : null;
    if (req.user?.role === 'economic_actor') {
      const economicActor = await EconomicActor.findById(req.user.economic_actor_id);
      if (!economicActor) return res.status(404).send({ ok: false, code: ERROR_CODES.NOT_FOUND });
      collectivity = economicActor.collectivities.find((c) => c.id === collectivity._id);
    }

    if (!collectivity) return res.status(404).send({ ok: false, code: ERROR_CODES.NOT_FOUND });

    if (!ACTION_GAINS_RANGES[wsName]) return res.json({ ok: false, data: { error: `Action '${wsName}' not found in gains configuration` } });

    const collectivityDoc = await Collectivity.findById(collectivity._id || collectivity.id);
    if (!collectivityDoc?.aggregation_excel_file_id) return res.json({ ok: false, data: { error: 'No aggregation Excel file configured for this collectivity' } });

    const siteId = (await graphFetch(`/sites/${sharePointSiteName}.sharepoint.com`)).id;

    // --- GAINS ("4. Gains par action") ---
    const gainsValues =
      (await graphFetch(`/sites/${siteId}/drive/items/${collectivityDoc.aggregation_excel_file_id}/workbook/worksheets/${encodeURIComponent(GAINS_WORKSHEET)}/range(address='A${ACTION_GAINS_RANGES[wsName].dataStartRow}:${endCol}${ACTION_GAINS_RANGES[wsName].dataStartRow + 50}')`))
        .values || [];

    let processedData = { score: 0, indicators: {}, emissions: { indicators: {} } };

    if (gainsValues.length === 0) return res.json({ ok: true, data: processedData });

    const gainsYearRows = [];
    let gainsLastYear = 0;
    for (let i = 0; i < gainsValues.length; i++) {
      const year = parseInt(gainsValues[i][2]);
      if (!year || year < 2000 || year > 2100) continue;
      if (year < gainsLastYear) break;
      gainsLastYear = year;
      if (yearStart && year < yearStart) continue;
      if (yearEnd && year > yearEnd) continue;
      gainsYearRows.push({ year, row: gainsValues[i] });
    }

    let totalAchievement = 0;
    let achievementCount = 0;

    for (const emissionType of EMISSION_TYPES) {
      if (INSTANCE_EMISSION_COL[emissionType] === undefined) continue;
      const col = instanceOffset + INSTANCE_EMISSION_COL[emissionType];

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

      processedData.indicators[emissionType] = { label: emissionType, unit: INDICATORS_CONFIG.find((c) => c.key === emissionType)?.unit, objective, real, objectiveVal: objective, realVal: real, achievement, yearlyData };
    }

    processedData.score = achievementCount > 0 ? Math.round(totalAchievement / achievementCount) : 0;

    // --- EMISSIONS ("3. Émissions par action") ---
    const emValues =
      (
        await graphFetch(
          `/sites/${siteId}/drive/items/${collectivityDoc.aggregation_excel_file_id}/workbook/worksheets/${encodeURIComponent(EMISSIONS_WORKSHEET)}/range(address='A${ACTION_EMISSIONS_RANGES[wsName].dataStartRow}:${endCol}${ACTION_EMISSIONS_RANGES[wsName].dataStartRow + 50}')`,
        )
      ).values || [];

    const emYearRows = [];
    let emLastYear = 0;
    for (let i = 0; i < emValues.length; i++) {
      const year = parseInt(emValues[i][2]);
      if (!year || year < 2000 || year > 2100) continue;
      if (year < emLastYear) break;
      emLastYear = year;
      if (yearStart && year < yearStart) continue;
      if (yearEnd && year > yearEnd) continue;
      emYearRows.push({ year, row: emValues[i] });
    }

    for (const emissionType of EMISSION_TYPES) {
      if (INSTANCE_EMISSION_COL[emissionType] === undefined) continue;
      const emCol = instanceOffset + INSTANCE_EMISSION_COL[emissionType];

      const yearlyData = emYearRows.map((d) => ({
        year: d.year,
        initiale: parseNumber(d.row[emCol]),
        reference: parseNumber(d.row[emCol + 1]),
        previsionnelle: parseNumber(d.row[emCol + 2]),
        expost: parseNumber(d.row[emCol + 3]),
      }));

      processedData.emissions.indicators[emissionType] = { label: emissionType, unit: INDICATORS_CONFIG.find((c) => c.key === emissionType)?.unit, yearlyData };
    }

    res.json({ ok: true, data: processedData });
  } catch (error) {
    capture(error);
    res.json({ ok: false, data: { error: error.message } });
  }
});

router.post('/export', async (req, res) => {
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
