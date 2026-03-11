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
const ACTION_GAINS_RANGES = { B2: { emissionHeaderRow: 16, dataStartRow: 19 } };
const EMISSION_TYPES = ['GES', 'PM', 'NOx', 'HC', 'CO', 'Nrj'];

const INDICATORS_CONFIG = [
  { key: 'GES', label: 'GES', unit: 'tCO2e' },
  { key: 'PM', label: 'PM', unit: 'tPart' },
  { key: 'HC', label: 'HC', unit: 'tHC' },
  { key: 'NOx', label: 'NOx', unit: 'tNOx' },
  { key: 'CO', label: 'CO', unit: 'tCO' },
  { key: 'Énergie', label: 'Énergie', unit: 'GWh' },
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
    let { collectivity, action } = req.body;
    if (!action) return res.json({ ok: false, data: { error: 'action is required' } });
    if (!collectivity) return res.json({ ok: false, data: { error: 'collectivity is required' } });
    if (req.user?.role === 'economic_actor') {
      const economicActor = await EconomicActor.findById(req.user.economic_actor_id);
      if (!economicActor) return res.status(404).send({ ok: false, code: ERROR_CODES.NOT_FOUND });
      collectivity = economicActor.collectivities.find((c) => c.id === collectivity._id);
    }

    if (!collectivity) return res.status(404).send({ ok: false, code: ERROR_CODES.NOT_FOUND });

    const actionConfig = ACTION_GAINS_RANGES[action];
    if (!actionConfig) return res.json({ ok: false, data: { error: `Action '${action}' not found in gains configuration` } });

    const collectivityDoc = await Collectivity.findById(collectivity._id || collectivity.id);
    if (!collectivityDoc?.aggregation_excel_file_id) return res.json({ ok: false, data: { error: 'No aggregation Excel file configured for this collectivity' } });

    const siteId = (await graphFetch(`/sites/${sharePointSiteName}.sharepoint.com`)).id;

    const { emissionHeaderRow, dataStartRow } = actionConfig;
    const result = await graphFetch(`/sites/${siteId}/drive/items/${collectivityDoc?.aggregation_excel_file_id}/workbook/worksheets/${encodeURIComponent(GAINS_WORKSHEET)}/range(address='A${emissionHeaderRow}:BZ${dataStartRow + 50}')`);

    const allValues = result.values || [];
    let processedData = {
      ges: { value: 0, trend: 0 },
      energy: { value: 0, trend: 0 },
      pollutants: { value: 0, count: 0 },
      score: 0,
      bestIndicator: { label: '-', val: -1 },
      worstIndicator: { label: '-', val: 9999 },
      indicators: [],
    };

    if (allValues.length === 0) return res.json({ ok: true, data: processedData });

    // Row 0 = emission header row — scan for emission type column positions
    const emissionHeaderValues = allValues[0];
    const emissionCols = {};
    for (let col = 0; col < emissionHeaderValues.length; col++) {
      const header = String(emissionHeaderValues[col] || '').trim();
      if (EMISSION_TYPES.includes(header)) emissionCols[header] = col;
    }

    const yearRows = [];
    for (let i = dataStartRow - emissionHeaderRow; i < allValues.length; i++) {
      const row = allValues[i];
      const year = parseInt(row[2]);
      if (!year || year < 2000 || year > 2100) continue;
      yearRows.push({ year, row });
    }

    // For each emission: Col+0=Écart Réf-Init, Col+1=Écart Prév-Réf, Col+2=Écart Expost-Réf, Col+3=Écart Expost-Prév
    let totalAchievement = 0;
    let achievementCount = 0;

    for (const emissionType of EMISSION_TYPES) {
      const startCol = emissionCols[emissionType];
      if (startCol === undefined) continue;

      const config = INDICATORS_CONFIG.find((c) => c.key === emissionType);

      const yearlyData = yearRows.map(({ year, row }) => ({ year, ecartRefInit: parseNumber(row[startCol]), ecartPrevRef: parseNumber(row[startCol + 1]), ecartExpostRef: parseNumber(row[startCol + 2]), ecartExpostPrev: parseNumber(row[startCol + 3]) }));

      const latestWithExpost = [...yearlyData].reverse().find((d) => d.ecartExpostRef !== 0);
      const objective = latestWithExpost ? Math.abs(latestWithExpost.ecartPrevRef) : 0;
      const real = latestWithExpost ? Math.abs(latestWithExpost.ecartExpostRef) : 0;

      let achievement = null;
      if (objective > 0 && real > 0) achievement = (real / objective) * 100;

      if (achievement !== null) {
        totalAchievement += Math.min(achievement, 100);
        achievementCount++;
        if (achievement > processedData.bestIndicator.val) processedData.bestIndicator = { label: emissionType, val: achievement };
        if (achievement < processedData.worstIndicator.val) processedData.worstIndicator = { label: emissionType, val: achievement };
      }

      processedData.indicators.push({ label: emissionType, unit: config?.unit, objective, real, objectiveVal: objective, realVal: real, achievement, yearlyData });
    }

    // GES summary
    const gesIndicator = processedData.indicators.find((i) => i.label === 'GES');
    if (gesIndicator) {
      processedData.ges.value = gesIndicator.realVal;
      const dataYears = (gesIndicator.yearlyData || []).filter((d) => d.ecartExpostRef !== 0);
      if (dataYears.length >= 2) {
        const latest = dataYears[dataYears.length - 1];
        const previous = dataYears[dataYears.length - 2];
        if (previous.ecartExpostRef !== 0) processedData.ges.trend = (latest.ecartExpostRef - previous.ecartExpostRef) / Math.abs(previous.ecartExpostRef);
      }
    }

    // Energy summary
    const energyIndicator = processedData.indicators.find((i) => i.label === 'Énergie');
    if (energyIndicator) {
      processedData.energy.value = energyIndicator.realVal;
      const dataYears = (energyIndicator.yearlyData || []).filter((d) => d.ecartExpostRef !== 0);
      if (dataYears.length >= 2) {
        const latest = dataYears[dataYears.length - 1];
        const previous = dataYears[dataYears.length - 2];
        if (previous.ecartExpostRef !== 0) {
          processedData.energy.trend = (latest.ecartExpostRef - previous.ecartExpostRef) / Math.abs(previous.ecartExpostRef);
        }
      }
    }

    // Pollutants summary (PM, NOx, HC, CO)
    for (const pollutant of ['PM', 'NOx', 'HC', 'CO']) {
      const ind = processedData.indicators.find((i) => i.label === pollutant);
      if (ind && ind.realVal > 0) {
        processedData.pollutants.value += ind.realVal;
        processedData.pollutants.count++;
      }
    }

    processedData.score = achievementCount > 0 ? Math.round(totalAchievement / achievementCount) : 0;

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
