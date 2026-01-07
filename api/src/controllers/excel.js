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

const AGGREGATION_WORKSHEET = 'Agrégation';

const GLOBAL_GAINS_RANGES = [
  { name: 'years', range: 'B7:C9' },
  { name: 'gains_previsionnels', range: 'B13:J19' },
  { name: 'gains_reels', range: 'B23:K29' },
  { name: 'ecart', range: 'C33:E39' },
];

const ACTION_GAINS_WORKSHEET = 'Agrégation';
const ACTION_GAINS_RANGE = 'C40:H300';

router.post('/global-gains', async (req, res) => {
  try {
    const { excelFileId } = req.body;
    if (!excelFileId) return res.json({ ok: false, data: { error: 'excelFileId is required' } });
    const siteId = (await graphFetch(`/sites/${sharePointSiteName}.sharepoint.com`)).id;

    const results = await Promise.all(
      GLOBAL_GAINS_RANGES.map(async (descriptor) => {
        const result = await graphFetch(
          `/sites/${siteId}/drive/items/${excelFileId}/workbook/worksheets/${encodeURIComponent(AGGREGATION_WORKSHEET)}/range(address='${descriptor.range}')`
        );
        return { name: descriptor.name, values: result.values || [] };
      })
    );

    res.json({ ok: true, data: results });
  } catch (error) {
    capture(error);
    res.json({ ok: false, data: { error: error.message } });
  }
});

router.post('/action-gains', async (req, res) => {
  try {
    const { excelFileId } = req.body;
    if (!excelFileId) return res.json({ ok: false, data: { error: 'excelFileId is required' } });
    
    const siteId = (await graphFetch(`/sites/${sharePointSiteName}.sharepoint.com`)).id;
    
    const result = await graphFetch(
      `/sites/${siteId}/drive/items/${excelFileId}/workbook/worksheets/${encodeURIComponent(ACTION_GAINS_WORKSHEET)}/range(address='${ACTION_GAINS_RANGE}')`
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
            const rawValue = gesRow[3]; // Colonne F (Situation ex-post - Évolution absolue)
            let cleanedValue = String(rawValue || 0).replace(/tCO2e/gi, '').replace(/\s/g, '').replace(',', '.');
            const gesValue = parseFloat(cleanedValue) || 0;

            const rawValuePrev = gesRow[1]; // Colonne D (Situation prévisionnelle - Évolution absolue)
            let cleanedValuePrev = String(rawValuePrev || 0).replace(/tCO2e/gi, '').replace(/\s/g, '').replace(',', '.');
            const gesPrev = parseFloat(cleanedValuePrev) || 0;
            
            actionGains.push({action: potentialActionName,ges: gesValue,ges_prev: gesPrev,type: gesValue <= 0 ? 'gain' : 'degradation'});
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
