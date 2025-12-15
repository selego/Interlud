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
router.post('/aggregation', async (req, res) => {
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
    res.json({ ok: true, data: result.values || [] });
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
