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

const FIXED_RANGES = [
  { name: 'gains_environnementaux', range: 'C13:H18' },
  { name: 'emissions_GES', range: 'E26:H29' },
  { name: 'emissions_PM', range: 'J26:M29' },
  { name: 'emissions_NOx', range: 'O26:R29' },
  { name: 'emissions_HC', range: 'T26:W29' },
  { name: 'emissions_CO', range: 'Y26:AB29' },
  { name: 'emissions_Energie', range: 'AD26:AG29' },
  { name: 'calculs_Surface_de_la_ZFE', range: 'E39:H41' },
  { name: 'calculs_Seuil_de_la_ZFE', range: 'K39:N41' },
  { name: 'calculs_Part_des_distance_effectuée_dans_la_ZFE', range: 'P39:S41' },
];

router.post('/values', async (req, res) => {
  try {
    const { worksheetName, excelFileId } = req.body;
    if (!worksheetName) return res.json({ ok: false, data: { error: 'worksheetName is required' } });
    if (!excelFileId) return res.json({ ok: false, data: { error: 'excelFileId is required' } });

    const siteId = (await graphFetch(`/sites/${sharePointSiteName}.sharepoint.com`)).id;
    const ranges = await Promise.all(
      FIXED_RANGES.map(async (descriptor) => {
        const result = await graphFetch(`/sites/${siteId}/drive/items/${excelFileId}/workbook/worksheets/${worksheetName}/range(address='${descriptor.range}')`);
        return { name: descriptor.name, values: result.values || [] };
      })
    );
    res.json({ ok: true, data: ranges });
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
