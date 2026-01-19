const express = require('express');
const passport = require('passport');
const router = express.Router();
const { capture } = require('../services/sentry');
const { graphFetch, exportExcelFile, sharePointSiteName } = require('../services/microsoftGraph');
const EconomicActor = require('../models/economic_actor');
const ERROR_CODES = require('../utils/errorCodes');

// Ranges for "Agrégation des gains" sheet - gains per action
// Each action block has 2 header rows + 6 data rows (GES, PM, NOx, HC, CO, Énergie)
// Blocks are 11 rows apart
const AGGREGATION_WORKSHEET = 'Agrégation';
const AGGREGATION_RANGES = [
  { name: 'B2', range: 'B46:H53' },
  { name: 'B3', range: 'B57:H64' },
  { name: 'B4', range: 'B68:H75' },
  { name: 'C1', range: 'B79:H86' },
  { name: 'C2', range: 'B90:H97' },
  { name: 'C3', range: 'B101:H108' },
  { name: 'C4', range: 'B112:H119' },
  { name: 'C5', range: 'B123:H130' },
  { name: 'C6', range: 'B134:H141' },
  { name: 'C7', range: 'B145:H152' },
  { name: 'C8', range: 'B156:H163' },
  { name: 'C9', range: 'B167:H174' },
];

const INDICATORS_CONFIG = [
  { key: 'GES', label: 'GES', unit: 'tCO2e' },
  { key: 'PM', label: 'PM', unit: 'tPart' },
  { key: 'HC', label: 'HC', unit: 'tHC' },
  { key: 'NOx', label: 'NOx', unit: 'tNOx' },
  { key: 'CO', label: 'CO', unit: 'tCO' },
  { key: 'Énergie', label: 'Énergie', unit: 'GWh' },
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

    const result = await graphFetch(
      `/sites/${siteId}/drive/items/${collectivity.excelFileId}/workbook/worksheets/${encodeURIComponent(AGGREGATION_WORKSHEET)}/range(address='B7:K39')`
    );
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

      const evolRelIndex = gainsPrevisionnels[0]?.findIndex(
        (h) => String(h).toLowerCase().includes('evolution relative') || String(h).toLowerCase().includes('évolution relative')
      );
      const evolCumIndex = gainsPrevisionnels[0]?.findIndex(
        (h) => String(h).toLowerCase().includes('evolution cumulée') || String(h).toLowerCase().includes('évolution cumulée') || String(h).toLowerCase().includes('evolution cumul')
      );

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
    const result = await graphFetch(
      `/sites/${siteId}/drive/items/${collectivity.excelFileId}/workbook/worksheets/${encodeURIComponent(AGGREGATION_WORKSHEET)}/range(address='C40:H300')`
    );

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
                .replace(',', '.')
            ) || 0;

          const gesPrev =
            parseFloat(
              String(gesRow[1] || 0)
                .replace(/tCO2e/gi, '')
                .replace(/\s/g, '')
                .replace(',', '.')
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

// Fetch aggregated gains for a specific action from "Agrégation" sheet
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

    // Find the range for this action
    const actionConfig = AGGREGATION_RANGES.find((r) => r.name === action);
    if (!actionConfig) return res.json({ ok: false, data: { error: `Action '${action}' not found` } });

    const siteId = (await graphFetch(`/sites/${sharePointSiteName}.sharepoint.com`)).id;
    const result = await graphFetch(
      `/sites/${siteId}/drive/items/${collectivity.excelFileId}/workbook/worksheets/${encodeURIComponent(AGGREGATION_WORKSHEET)}/range(address='${actionConfig.range}')`
    );

    const INDICATORS = ['GES', 'PM', 'NOx', 'HC', 'CO', 'Énergie'];
    const UNITS = ['tCO2e/an', 't/an', 't/an', 't/an', 't/an', 'GWh/an'];

    const aggregationData = result.values || [];
    let processedData = {
      ges: { value: 0, trend: 0 },
      energy: { value: 0, trend: 0 },
      pollutants: { value: 0, count: 0 },
      score: 0,
      bestIndicator: { label: '-', val: -1 },
      worstIndicator: { label: '-', val: 9999 },
      indicators: [],
    };

    if (aggregationData && aggregationData.length > 2) {
      const rows = aggregationData.slice(2);
      if (rows[0]) {
        processedData.ges.value = Math.abs(rows[0][4] || 0);
        processedData.ges.trend = rows[0][5];
      }

      if (rows[5]) {
        processedData.energy.value = Math.abs(rows[5][4] || 0);
        processedData.energy.trend = rows[5][5];
      }

      [1, 2, 3, 4].forEach((idx) => {
        if (rows[idx] && typeof rows[idx][4] === 'number') {
          processedData.pollutants.value += Math.abs(rows[idx][4]);
          processedData.pollutants.count++;
        }
      });

      let totalAchievement = 0;
      let achievementCount = 0;

      rows.forEach((row, index) => {
        if (index > 5 || !row) return;
        const label = row[0] || INDICATORS[index];

        let achievement = 0;
        let hasData = false;

        if (typeof row[3] === 'number' && typeof row[5] === 'number' && row[3] !== 0) {
          achievement = Math.min((row[5] / row[3]) * 100, 100);
          achievement = (row[5] / row[3]) * 100;
          hasData = true;
        }

        if (hasData) {
          totalAchievement += Math.min(achievement, 100);
          achievementCount++;
          if (achievement > processedData.bestIndicator.val) processedData.bestIndicator = { label, val: achievement };
          if (achievement < processedData.worstIndicator.val) processedData.worstIndicator = { label, val: achievement };
        }

        processedData.indicators.push({
          label,
          unit: row[6] || UNITS[index],
          objective: row[3],
          real: row[5],
          objectiveVal: row[2],
          realVal: row[4],
          achievement: hasData ? achievement : null,
        });
      });

      processedData.score = achievementCount > 0 ? Math.round(totalAchievement / achievementCount) : 0;
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
