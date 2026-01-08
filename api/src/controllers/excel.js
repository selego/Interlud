const express = require('express');
const router = express.Router();
const passport = require('passport');
const { capture } = require('../services/sentry');
const { graphFetch, exportExcelFile, sharePointSiteName } = require('../services/microsoftGraph');
const Indicator = require('../models/indicator');
const IndicatorValue = require('../models/indicator_value');
const Log = require('../models/log');

const SITUATION_SHEETS = [
  { sheetName: 'Remplissage - Sit. Init.', situation: 'init' },
  { sheetName: 'Remplissage - Sit. Ref.', situation: 'ref' },
  { sheetName: 'Remplissage - Sit. Prev.', situation: 'prev' },
  { sheetName: 'Remplissage - Sit. Expost', situation: 'expost' },
];

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

// Fetch aggregated gains for a specific action from "Agrégation" sheet
router.post('/action_aggregation', async (req, res) => {
  try {
    const { excelFileId, action } = req.body;
    if (!excelFileId) return res.json({ ok: false, data: { error: 'excelFileId is required' } });
    if (!action) return res.json({ ok: false, data: { error: 'action is required' } });

    // Find the range for this action
    const actionConfig = AGGREGATION_RANGES.find((r) => r.name === action);
    if (!actionConfig) return res.json({ ok: false, data: { error: `Action '${action}' not found` } });

    const siteId = (await graphFetch(`/sites/${sharePointSiteName}.sharepoint.com`)).id;
    const result = await graphFetch(
      `/sites/${siteId}/drive/items/${excelFileId}/workbook/worksheets/${encodeURIComponent(AGGREGATION_WORKSHEET)}/range(address='${actionConfig.range}')`
    );

    const INDICATORS = ['GES', 'PM', 'NOx', 'HC', 'CO', 'Énergie'];
    const UNITS = ['tCO2e/an', 't/an', 't/an', 't/an', 't/an', 'GWh/an'];

    const aggregationData = result.values || [];
    let processedData = {
      ges: { value: 0, trend: 0 },
      energy: { value: 0, trend: 0 },
      pollutants: { value: 0, count: 0 },
      score: 0,
      bestIndicator: { label: "-", val: -1 },
      worstIndicator: { label: "-", val: 9999 },
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

      [1, 2, 3, 4].forEach(idx => {
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

        processedData.indicators.push({ label, unit: row[6] || UNITS[index], objective: row[3], real: row[5], objectiveVal: row[2], realVal: row[4], achievement: hasData ? achievement : null });
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

router.post('/webhook', async (req, res) => {
  try {
    // Validation initiale du webhook par Microsoft Graph
    // Docs: https://learn.microsoft.com/fr-fr/graph/change-notifications-delivery-webhooks
    const validationToken = req.query.validationToken;

    if (validationToken) {
      console.log('Validation webhook reçue');
      return res.status(200).send(validationToken);
    }

    // Afficher toutes les données de la notification
    console.log('=== WEBHOOK NOTIFICATION ===');
    console.log(JSON.stringify(req.body, null, 2));
    console.log('===========================');

    return res.status(202).send();
  } catch (error) {
    capture(error);
    res.status(500).send();
  }
});

module.exports = router;
