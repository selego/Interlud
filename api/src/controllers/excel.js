const express = require('express');
const router = express.Router();
const { capture } = require('../services/sentry');
const { graphFetch, exportExcelFile, sharePointSiteName } = require('../services/microsoftGraph');

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

router.post('/global-gains', async (req, res) => {
  try {
    const { excelFileId } = req.body;
    if (!excelFileId) return res.json({ ok: false, data: { error: 'excelFileId is required' } });
    const siteId = (await graphFetch(`/sites/${sharePointSiteName}.sharepoint.com`)).id;

    const result = await graphFetch(
      `/sites/${siteId}/drive/items/${excelFileId}/workbook/worksheets/${encodeURIComponent(AGGREGATION_WORKSHEET)}/range(address='B7:K39')`
    );
    const allValues = result.values || [];

    const yearsData = allValues.slice(0, 3).map(row => row.slice(0, 2));
    const gainsPrevisionnels = allValues.slice(6, 13).map(row => row.slice(0, 9));
    const gainsReels = allValues.slice(16, 23).map(row => row.slice(0, 10));
    const ecart = allValues.slice(26, 33).map(row => row.slice(1, 4));

    const yearStartIndex = gainsPrevisionnels[0]?.findIndex(h => /^\d{4}$/.test(String(h)));
    const years = yearStartIndex >= 0 && gainsPrevisionnels[0] ? gainsPrevisionnels[0].slice(yearStartIndex) : [];

    const getIndicatorData = (indicatorIndex) => {
      const prevRow = gainsPrevisionnels[indicatorIndex + 1] || [];
      const reelRow = gainsReels[indicatorIndex + 1] || [];
      const ecartRow = ecart[indicatorIndex + 1] || [];

      const evolRelIndex = gainsPrevisionnels[0]?.findIndex(h =>
        String(h).toLowerCase().includes('evolution relative') ||
        String(h).toLowerCase().includes('évolution relative')
      );
      const evolCumIndex = gainsPrevisionnels[0]?.findIndex(h =>
        String(h).toLowerCase().includes('evolution cumulée') ||
        String(h).toLowerCase().includes('évolution cumulée') ||
        String(h).toLowerCase().includes('evolution cumul')
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

    const indicators = [0, 1, 2, 3, 4, 5].map(index => getIndicatorData(index));
    const gesData = indicators[0];
    const energieData = indicators[5];
    const avancementTrajectoire = gesData.evolutionCumuleePrev > 0 ? (gesData.evolutionCumuleeReel / gesData.evolutionCumuleePrev) * 100 : 0;

    res.json({ ok: true, data: { gesData, energieData, avancementTrajectoire, indicators } });
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
    const result = await graphFetch(`/sites/${siteId}/drive/items/${excelFileId}/workbook/worksheets/${encodeURIComponent(AGGREGATION_WORKSHEET)}/range(address='C40:H300')`);
    
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
            const gesValue =parseFloat(String(gesRow[3] || 0).replace(/tCO2e/gi, '').replace(/\s/g, '').replace(',', '.')) || 0;

            const gesPrev =parseFloat(String(gesRow[1] || 0).replace(/tCO2e/gi, '').replace(/\s/g, '').replace(',', '.')) || 0;
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
