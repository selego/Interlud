const ExcelJS = require('exceljs');

const tenantId = 'efa89c5e-5599-439d-8f01-b4da9ded0a55';
const clientId = 'f2924bbc-a975-49fe-a2ca-df4ff711be14';
const clientSecret = '9aG8Q~chbn5ywMYUtx6zd3Z8zUelSoQjsHuiTdq9';
const sharePointSiteName = 'selegobv';
const masterExcelFileId = '01IBL4ADM2GGWQITUEAZDYF3Y4Q66XTJB7';

const WORKSHEETS = {
  init: 'Remplissage - Sit. Init.',
  ref: 'Remplissage - Sit. Ref.',
  prev: 'Remplissage - Sit. Prev.',
  expost: 'Remplissage - Sit. Expost',
};

async function getAccessToken() {
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
  return res.access_token;
}

async function graphFetch(endpoint, options = {}) {
  const token = await getAccessToken();
  const response = await fetch(`https://graph.microsoft.com/v1.0${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error?.message || `Graph API error: ${response.status}`);
  }

  if (response.status === 202) return response;

  return response.json();
}

async function updateExcelCellByIndicatorId(fileId, excelIndicatorId, value, situation) {
  const worksheetName = WORKSHEETS[situation];
  if (!worksheetName) throw new Error(`No worksheet found for situation: ${situation}`);
  const siteId = (await graphFetch(`/sites/${sharePointSiteName}.sharepoint.com`)).id;

  const usedRange = await graphFetch(`/sites/${siteId}/drive/items/${fileId}/workbook/worksheets/${worksheetName}/usedRange`);
  const rows = usedRange.values || [];

  const rowIndex = rows.findIndex((row) => row[4] && String(row[4]).trim() === String(excelIndicatorId).trim());
  if (rowIndex === -1) throw new Error(`Indicator ID "${excelIndicatorId}" not found in column E`);

  const startRow = usedRange.address ? parseInt(usedRange.address.match(/\d+/)?.[0] || 1) : 1;
  const rowNumber = startRow + rowIndex;

  const cellValue = Array.isArray(value) ? value.join(', ') : value;
  await graphFetch(`/sites/${siteId}/drive/items/${fileId}/workbook/worksheets/${worksheetName}/range(address='F${rowNumber}')`, {
    method: 'PATCH',
    body: JSON.stringify({ values: [[cellValue]] }),
  });
}

async function duplicateExcelFile(newFileName) {
  const siteId = (await graphFetch(`/sites/${sharePointSiteName}.sharepoint.com`)).id;

  const sourceFile = await graphFetch(`/sites/${siteId}/drive/items/${masterExcelFileId}`);

  const copyResponse = await fetch(`https://graph.microsoft.com/v1.0/sites/${siteId}/drive/items/${masterExcelFileId}/copy`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${await getAccessToken()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: newFileName,
      parentReference: {
        driveId: sourceFile.parentReference.driveId,
        id: sourceFile.parentReference.id,
      },
    }),
  });

  if (!copyResponse.ok) {
    const error = await copyResponse.json().catch(() => ({}));
    throw new Error(error.error?.message || 'Cannot copy Excel file');
  }

  await new Promise((r) => setTimeout(r, 2000));

  for (let attempts = 0; attempts < 20; attempts++) {
    await new Promise((r) => setTimeout(r, 1000));

    const searchResult = await graphFetch(`/sites/${siteId}/drive/root/children?$filter=name eq '${newFileName}'`);
    if (searchResult.value?.length > 0) return searchResult.value[0].id;
  }

  throw new Error('Copy operation timed out - could not find copied file');
}

async function exportExcelFile(fileId) {
  const siteId = (await graphFetch(`/sites/${sharePointSiteName}.sharepoint.com`)).id;
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
  const siteId = (await graphFetch(`/sites/${sharePointSiteName}.sharepoint.com`)).id;

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
      rangeValues.push([updateMap.has(i) ? updateMap.get(i) : rows[i][5] ?? '']);
    }

    await graphFetch(
      `/sites/${siteId}/drive/items/${targetFileId}/workbook/worksheets('${encodeURIComponent(sheetName)}')/range(address='F${startRow + minRowIndex}:F${startRow + maxRowIndex}')`,
      {
        method: 'PATCH',
        body: JSON.stringify({ values: rangeValues }),
      }
    );

    for (const update of updates) {
      extractedData.push({ excel_indicator_id: update.excelIndicatorId, value: update.newValue, situation });
    }
  }

  return { success: true, extractedData };
}

module.exports = {
  getAccessToken,
  graphFetch,
  sharePointSiteName,
  updateExcelCellByIndicatorId,
  duplicateExcelFile,
  exportExcelFile,
  exportExcelFileWithSpecificSheets,
  importSheetsToExcelFile,
};
