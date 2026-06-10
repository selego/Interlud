const ExcelJS = require('exceljs');

const tenantId = process.env.TENANT_ID;
const clientId = process.env.CLIENT_ID;
const clientSecret = process.env.CLIENT_SECRET;
const sharePointSiteName = 'selegobv';
const masterExcelFileId = '01IBL4ADJHP7ORRNDOMREZVCQPBE4I2QZZ';

const WORKSHEETS = {
  init: 'Remplissage - Sit. Init.',
  ref: 'Remplissage - Sit. Ref.',
  prev: 'Remplissage - Sit. Prev.',
  expost: 'Remplissage - Sit. Expost',
};

let _cachedToken = null;
let _tokenExpiresAt = 0;

async function getAccessToken() {
  if (_cachedToken && Date.now() < _tokenExpiresAt) return _cachedToken;

  const url = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
    scope: 'https://graph.microsoft.com/.default',
  });

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  const res = await response.json();
  if (!response.ok) throw new Error(res.error_description || 'Failed to get access token');

  _cachedToken = res.access_token;
  _tokenExpiresAt = Date.now() + (res.expires_in ? (res.expires_in - 120) * 1000 : 50 * 60 * 1000);
  return _cachedToken;
}

let _cachedSiteId = null;

async function getSiteId() {
  if (_cachedSiteId) return _cachedSiteId;
  const site = await graphFetch(`/sites/${sharePointSiteName}.sharepoint.com`);
  _cachedSiteId = site.id;
  return _cachedSiteId;
}

const RETRYABLE_STATUS_CODES = [429, 500, 502, 503, 504];
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 2000;

function isRetryableError(status, errorMessage) {
  if (RETRYABLE_STATUS_CODES.includes(status)) return true;
  if (errorMessage && errorMessage.includes("We're sorry")) return true;
  return false;
}

async function graphFetch(endpoint, options = {}) {
  let lastError;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const token = await getAccessToken();
    const response = await fetch(`https://graph.microsoft.com/v1.0${endpoint}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (response.ok) {
      if (response.status === 202) return response;
      if (response.status === 204) return null;
      return response.json();
    }

    const error = await response.json().catch(() => ({}));
    const errorMessage = error.error?.message || `Graph API error: ${response.status}`;

    if (attempt < MAX_RETRIES && isRetryableError(response.status, errorMessage)) {
      const retryAfter = response.headers.get('Retry-After');
      const delay = retryAfter ? parseInt(retryAfter) * 1000 : BASE_DELAY_MS * Math.pow(2, attempt);
      console.log(`[Graph API] Tentative ${attempt + 1}/${MAX_RETRIES} échouée (${response.status}), retry dans ${delay}ms...`);
      await new Promise((r) => setTimeout(r, delay));
      continue;
    }

    lastError = new Error(errorMessage);
  }

  throw lastError;
}

async function updateExcelCellByIndicatorId(fileId, excelIndicatorId, value, situation, unit = null) {
  const worksheetName = WORKSHEETS[situation];
  if (!worksheetName) throw new Error(`No worksheet found for situation: ${situation}`);
  const siteId = await getSiteId();

  const usedRange = await graphFetch(`/sites/${siteId}/drive/items/${fileId}/workbook/worksheets/${worksheetName}/usedRange`);
  const rows = usedRange.values || [];

  const rowIndex = rows.findIndex((row) => row[4] && String(row[4]).trim() === String(excelIndicatorId).trim());
  if (rowIndex === -1) throw new Error(`Indicator ID "${excelIndicatorId}" not found in column E`);

  const startRow = usedRange.address ? parseInt(usedRange.address.match(/\d+/)?.[0] || 1) : 1;
  const rowNumber = startRow + rowIndex;

  if (unit === '%' && typeof value === 'number') value = value / 100;
  const cellValue = Array.isArray(value) ? value.join(', ') : value;
  await graphFetch(`/sites/${siteId}/drive/items/${fileId}/workbook/worksheets/${worksheetName}/range(address='F${rowNumber}')`, {
    method: 'PATCH',
    body: JSON.stringify({ values: [[cellValue]] }),
  });
}

// Update multiple cells in batch - updates is array of { excel_indicator_id, value, unit? }
async function updateExcelCellsBatch(fileId, updates, situation) {
  if (!updates || updates.length === 0) return;

  const worksheetName = WORKSHEETS[situation];
  if (!worksheetName) throw new Error(`No worksheet found for situation: ${situation}`);
  const siteId = await getSiteId();

  const usedRange = await graphFetch(`/sites/${siteId}/drive/items/${fileId}/workbook/worksheets/${worksheetName}/usedRange`);
  const rows = usedRange.values || [];
  const startRow = usedRange.address ? parseInt(usedRange.address.match(/\d+/)?.[0] || 1) : 1;

  // Build a map of indicator_id -> row index
  const indicatorRowMap = new Map();
  rows.forEach((row, i) => {
    if (row[4]) indicatorRowMap.set(String(row[4]).trim(), i);
  });

  // Find all updates that match existing rows
  const matchedUpdates = updates
    .map((u) => {
      const rowIndex = indicatorRowMap.get(String(u.excel_indicator_id).trim());
      if (rowIndex === undefined) return null;
      const v = u.unit === '%' && typeof u.value === 'number' ? u.value / 100 : u.value;
      const cellValue = Array.isArray(v) ? v.join(', ') : (v ?? '');
      return { rowIndex, cellValue };
    })
    .filter(Boolean);

  if (matchedUpdates.length === 0) return;

  // Find min and max row indices to create a contiguous range
  const minRowIndex = Math.min(...matchedUpdates.map((u) => u.rowIndex));
  const maxRowIndex = Math.max(...matchedUpdates.map((u) => u.rowIndex));

  // Build the update map
  const updateMap = new Map(matchedUpdates.map((u) => [u.rowIndex, u.cellValue]));

  // Build values array - keep existing values for rows not in updates
  const rangeValues = [];
  for (let i = minRowIndex; i <= maxRowIndex; i++) {
    rangeValues.push([updateMap.has(i) ? updateMap.get(i) : (rows[i]?.[5] ?? '')]);
  }

  // Update the range in one call
  await graphFetch(`/sites/${siteId}/drive/items/${fileId}/workbook/worksheets('${encodeURIComponent(worksheetName)}')/range(address='F${startRow + minRowIndex}:F${startRow + maxRowIndex}')`, {
    method: 'PATCH',
    body: JSON.stringify({ values: rangeValues }),
  });
}

async function createFolder(folderName, parentFolderId = null) {
  const siteId = await getSiteId();

  let endpoint;
  if (parentFolderId) {
    endpoint = `/sites/${siteId}/drive/items/${parentFolderId}/children`;
  } else {
    endpoint = `/sites/${siteId}/drive/root/children`;
  }

  const folder = await graphFetch(endpoint, {
    method: 'POST',
    body: JSON.stringify({
      name: folderName,
      folder: {},
      '@microsoft.graph.conflictBehavior': 'rename',
    }),
  });

  return folder.id;
}

async function duplicateExcelFile(newFileName, targetFolderId = null, sourceFileId = null) {
  const siteId = await getSiteId();
  const fileIdToCopy = sourceFileId || masterExcelFileId;
  const sourceFile = await graphFetch(`/sites/${siteId}/drive/items/${fileIdToCopy}`);
  const parentReference = targetFolderId ? { driveId: sourceFile.parentReference.driveId, id: targetFolderId } : { driveId: sourceFile.parentReference.driveId, id: sourceFile.parentReference.id };

  const copyResponse = await fetch(`https://graph.microsoft.com/v1.0/sites/${siteId}/drive/items/${fileIdToCopy}/copy`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${await getAccessToken()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name: newFileName, parentReference }),
  });

  if (!copyResponse.ok) {
    const error = await copyResponse.json().catch(() => ({}));
    throw new Error(error.error?.message || 'Cannot copy Excel file');
  }
  await new Promise((r) => setTimeout(r, 2000));
  const searchFolderId = targetFolderId || sourceFile.parentReference.id;
  for (let attempts = 0; attempts < 20; attempts++) {
    await new Promise((r) => setTimeout(r, 1000));
    const escapedName = newFileName.replace(/'/g, "''");
    const searchResult = await graphFetch(`/sites/${siteId}/drive/items/${searchFolderId}/children?$filter=name eq '${escapedName}'`);
    if (searchResult.value?.length > 0) return searchResult.value[0].id;
  }

  throw new Error('Copy operation timed out - could not find copied file');
}

async function exportExcelFile(fileId) {
  const siteId = await getSiteId();
  const fileData = await graphFetch(`/sites/${siteId}/drive/items/${fileId}?select=@microsoft.graph.downloadUrl,name`);
  return { downloadUrl: fileData['@microsoft.graph.downloadUrl'], fileName: fileData.name };
}

async function exportExcelFileWithSpecificSheets(fileId, sheetsToKeep) {
  const { downloadUrl, fileName } = await exportExcelFile(fileId);

  const fileResponse = await fetch(downloadUrl);
  if (!fileResponse.ok) throw new Error('Cannot download file from SharePoint');

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.from(await fileResponse.arrayBuffer()));

  const sheetsToRemove = [];
  workbook.eachSheet((ws) => {
    if (!sheetsToKeep.includes(ws.name)) sheetsToRemove.push(ws.id);
  });
  sheetsToRemove.forEach((id) => workbook.removeWorksheet(id));

  return { buffer: Buffer.from(await workbook.xlsx.writeBuffer()), fileName };
}

async function importSheetsToExcelFile(targetFileId, importedFileBuffer, sheets) {
  const siteId = await getSiteId();

  const importedWorkbook = new ExcelJS.Workbook();
  await importedWorkbook.xlsx.load(importedFileBuffer);

  const importedDataBySituation = {};
  for (const { sheetName, situation } of sheets) {
    const sheet = importedWorkbook.getWorksheet(sheetName);
    if (!sheet) continue;

    importedDataBySituation[situation] = new Map();
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const indicatorId = row.getCell(5).value;
      if (indicatorId) {
        importedDataBySituation[situation].set(String(indicatorId).trim(), row.getCell(6).value ?? '');
      }
    });
  }

  const extractedData = [];

  for (const { sheetName, situation } of sheets) {
    const dataMap = importedDataBySituation[situation];
    if (!dataMap?.size) continue;

    const usedRange = await graphFetch(`/sites/${siteId}/drive/items/${targetFileId}/workbook/worksheets('${encodeURIComponent(sheetName)}')/usedRange`);

    const rows = usedRange.values || [];
    const startRow = usedRange.address ? parseInt(usedRange.address.match(/\d+/)?.[0] || 1) : 1;

    const updates = rows
      .map((row, i) => {
        const excelIndicatorId = row[4] ? String(row[4]).trim() : '';
        if (!excelIndicatorId || !dataMap.has(excelIndicatorId)) return null;

        const newValue = dataMap.get(excelIndicatorId);
        const cellValue = Array.isArray(newValue) ? newValue.join(', ') : newValue;
        return { rowIndex: i, cellValue, excelIndicatorId, newValue };
      })
      .filter(Boolean);

    if (!updates.length) continue;

    const minRowIndex = Math.min(...updates.map((u) => u.rowIndex));
    const maxRowIndex = Math.max(...updates.map((u) => u.rowIndex));
    const updateMap = new Map(updates.map((u) => [u.rowIndex, u.cellValue]));

    const rangeValues = [];
    for (let i = minRowIndex; i <= maxRowIndex; i++) {
      rangeValues.push([updateMap.has(i) ? updateMap.get(i) : (rows[i][5] ?? '')]);
    }

    await graphFetch(`/sites/${siteId}/drive/items/${targetFileId}/workbook/worksheets('${encodeURIComponent(sheetName)}')/range(address='F${startRow + minRowIndex}:F${startRow + maxRowIndex}')`, {
      method: 'PATCH',
      body: JSON.stringify({ values: rangeValues }),
    });

    for (const update of updates) {
      extractedData.push({ excel_indicator_id: update.excelIndicatorId, value: update.newValue, situation });
    }
  }

  return { success: true, extractedData };
}

// Clear all values in column F for a given worksheet
async function clearWorksheetValues(fileId, situation) {
  const worksheetName = WORKSHEETS[situation];
  if (!worksheetName) throw new Error(`No worksheet found for situation: ${situation}`);

  const siteId = await getSiteId();

  const usedRange = await graphFetch(`/sites/${siteId}/drive/items/${fileId}/workbook/worksheets('${encodeURIComponent(worksheetName)}')/usedRange`);
  const rows = usedRange.values || [];
  const startRow = usedRange.address ? parseInt(usedRange.address.match(/\d+/)?.[0] || 1) : 1;

  // Find all rows that have an indicator ID in column E (index 4)
  const rowsWithIndicators = [];
  rows.forEach((row, i) => {
    if (row[4] && String(row[4]).trim()) rowsWithIndicators.push(i);
  });

  if (rowsWithIndicators.length === 0) return;

  // Find min and max row indices to create a contiguous range
  const minRowIndex = Math.min(...rowsWithIndicators);
  const maxRowIndex = Math.max(...rowsWithIndicators);

  // Create array of empty values
  const rangeValues = [];
  for (let i = minRowIndex; i <= maxRowIndex; i++) {
    rangeValues.push(['']);
  }

  // Clear the range in one call
  await graphFetch(`/sites/${siteId}/drive/items/${fileId}/workbook/worksheets('${encodeURIComponent(worksheetName)}')/range(address='F${startRow + minRowIndex}:F${startRow + maxRowIndex}')`, {
    method: 'PATCH',
    body: JSON.stringify({ values: rangeValues }),
  });
}

async function readExcelDefaultValues(fileId, situation) {
  const worksheetName = WORKSHEETS[situation];
  if (!worksheetName) throw new Error(`No worksheet found for situation: ${situation}`);
  const siteId = await getSiteId();

  const usedRange = await graphFetch(`/sites/${siteId}/drive/items/${fileId}/workbook/worksheets('${encodeURIComponent(worksheetName)}')/usedRange`);
  const rows = usedRange.values || [];

  const defaults = new Map();
  for (const row of rows) {
    const excelIndicatorId = row[4] ? String(row[4]).trim() : '';
    if (!excelIndicatorId) continue;
    defaults.set(excelIndicatorId, row[7] !== undefined && row[7] !== '' ? row[7] : null);
  }
  return defaults;
}

module.exports = {
  getAccessToken,
  graphFetch,
  getSiteId,
  sharePointSiteName,
  createFolder,
  updateExcelCellByIndicatorId,
  updateExcelCellsBatch,
  duplicateExcelFile,
  exportExcelFile,
  exportExcelFileWithSpecificSheets,
  importSheetsToExcelFile,
  clearWorksheetValues,
  readExcelDefaultValues,
};
