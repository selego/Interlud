const tenantId = "efa89c5e-5599-439d-8f01-b4da9ded0a55";
const clientId = "f2924bbc-a975-49fe-a2ca-df4ff711be14";
const clientSecret = "9aG8Q~chbn5ywMYUtx6zd3Z8zUelSoQjsHuiTdq9";
const sharePointSiteName = "selegobv";
const masterExcelFileId = "01IBL4ADMGCIMMRJMFQ5EZRZUPEE63ZCTI";

const ExcelJS = require("exceljs");

const worksheetsToProcess = [
  { worksheetName: "Remplissage - Sit. Init.", situation: "init" },
  { worksheetName: "Remplissage - Sit. Ref.", situation: "ref" },
  { worksheetName: "Remplissage - Sit. Prev.", situation: "prev" },
  { worksheetName: "Remplissage - Sit. Expost", situation: "expost" },
];

async function getAccessToken() {
  const url = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;

  const data = new URLSearchParams();
  data.append("grant_type", "client_credentials");
  data.append("client_id", clientId);
  data.append("client_secret", clientSecret);
  data.append("scope", "https://graph.microsoft.com/.default");

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: data.toString(),
  });

  const res = await response.json();
  if (!response.ok) throw new Error(res.error_description || "Failed to get access token");
  return res.access_token;
}

async function readExcelCells(fileId, worksheetName, range) {
  const token = await getAccessToken();

  const siteResponse = await fetch(`https://graph.microsoft.com/v1.0/sites/${sharePointSiteName}.sharepoint.com`, {
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });

  const site = await siteResponse.json();

  const cellsResponse = await fetch(`https://graph.microsoft.com/v1.0/sites/${site.id}/drive/items/${fileId}/workbook/worksheets/${worksheetName}/range(address='${range}')`, {
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });

  if (!cellsResponse.ok) {
    const error = await cellsResponse.json();
    console.error("Cells error:", error);
    throw new Error(error.error?.message || "Cannot read Excel cells");
  }

  const cellsData = await cellsResponse.json();
  return cellsData;
}

async function updateExcelCellByIndicatorId(fileId, excelIndicatorId, value, situation) {
  const worksheetToProcess = worksheetsToProcess.find((ws) => ws.situation === situation);
  if (!worksheetToProcess) throw new Error(`No worksheet found for situation: ${situation}`);

  const token = await getAccessToken();
  const siteResponse = await fetch(`https://graph.microsoft.com/v1.0/sites/${sharePointSiteName}.sharepoint.com`, {
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });

  if (!siteResponse.ok) {
    const error = await siteResponse.json();
    throw new Error(error.error?.message || "Site SharePoint not found");
  }

  const site = await siteResponse.json();

  const usedRangeResponse = await fetch(
    `https://graph.microsoft.com/v1.0/sites/${site.id}/drive/items/${fileId}/workbook/worksheets/${worksheetToProcess.worksheetName}/usedRange`,
    {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    }
  );

  if (!usedRangeResponse.ok) {
    const error = await usedRangeResponse.json();
    throw new Error(error.error?.message || "Cannot read worksheet used range");
  }

  const usedRangeData = await usedRangeResponse.json();
  const rows = usedRangeData.values || [];

  let rowNumber = null;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (row[4] && String(row[4]).trim() === String(excelIndicatorId).trim()) {
      rowNumber = usedRangeData.address ? parseInt(usedRangeData.address.match(/\d+/)?.[0] || 1) + i : i + 1;
      break;
    }
  }
  if (!rowNumber) throw new Error(`Indicator ID "${excelIndicatorId}" not found in column E`);

  let cellValue = value;
  if (Array.isArray(cellValue)) cellValue = cellValue.join(", ");

  const updateResponse = await fetch(
    `https://graph.microsoft.com/v1.0/sites/${site.id}/drive/items/${fileId}/workbook/worksheets/${worksheetToProcess.worksheetName}/range(address='F${rowNumber}')`,
    {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ values: [[cellValue]] }),
    }
  );

  if (!updateResponse.ok) {
    const error = await updateResponse.json();
    console.error("Update error:", error);
    throw new Error(error.error?.message || "Cannot update Excel cell");
  }
}

async function duplicateExcelFile(newFileName) {
  const token = await getAccessToken();

  const siteResponse = await fetch(`https://graph.microsoft.com/v1.0/sites/${sharePointSiteName}.sharepoint.com`, {
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });

  if (!siteResponse.ok) {
    const error = await siteResponse.json();
    throw new Error(error.error?.message || "Site SharePoint not found");
  }

  const site = await siteResponse.json();

  const sourceFileResponse = await fetch(`https://graph.microsoft.com/v1.0/sites/${site.id}/drive/items/${masterExcelFileId}`, {
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });

  if (!sourceFileResponse.ok) {
    const error = await sourceFileResponse.json();
    console.error("Source file error:", error);
    throw new Error(error.error?.message || "Cannot access source file");
  }

  const sourceFile = await sourceFileResponse.json();
  const parentReference = sourceFile.parentReference;

  const copyResponse = await fetch(`https://graph.microsoft.com/v1.0/sites/${site.id}/drive/items/${masterExcelFileId}/copy`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: newFileName,
      parentReference: {
        driveId: parentReference.driveId,
        id: parentReference.id,
      },
    }),
  });

  if (!copyResponse.ok) {
    const error = await copyResponse.json();
    console.error("Copy error:", error);
    throw new Error(error.error?.message || "Cannot copy Excel file");
  }

  const monitorUrl = copyResponse.headers.get("Location");

  if (!monitorUrl) throw new Error("No monitor URL returned for copy operation");

  await new Promise((resolve) => setTimeout(resolve, 2000));
  let copiedFileId = null;
  let attempts = 0;

  while (!copiedFileId && attempts < 20) {
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const searchResponse = await fetch(`https://graph.microsoft.com/v1.0/sites/${site.id}/drive/root/children?$filter=name eq '${newFileName}'`, {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    });

    if (!searchResponse.ok) throw new Error("Cannot search for copied file");

    const searchResult = await searchResponse.json();
    if (searchResult.value && searchResult.value.length > 0) {
      copiedFileId = searchResult.value[0].id;
      break;
    }

    attempts++;
  }
  if (!copiedFileId) throw new Error("Copy operation timed out - could not find copied file");
  return copiedFileId;
}

async function exportExcelFile(fileId) {
  const token = await getAccessToken();

  const siteResponse = await fetch(`https://graph.microsoft.com/v1.0/sites/${sharePointSiteName}.sharepoint.com`, {
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
  if (!siteResponse.ok) {
    const error = await siteResponse.json();
    throw new Error(error.error?.message || "Site SharePoint not found");
  }
  const site = await siteResponse.json();

  const downloadResponse = await fetch(`https://graph.microsoft.com/v1.0/sites/${site.id}/drive/items/${fileId}?select=@microsoft.graph.downloadUrl,name`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!downloadResponse.ok) {
    const error = await downloadResponse.json();
    throw new Error(error.error?.message || "Cannot get download URL");
  }
  const fileData = await downloadResponse.json();

  return { downloadUrl: fileData["@microsoft.graph.downloadUrl"], fileName: fileData.name };
}

async function exportExcelFileWithSpecificSheets(fileId, sheetsToKeep) {
  const token = await getAccessToken();

  const siteResponse = await fetch(`https://graph.microsoft.com/v1.0/sites/${sharePointSiteName}.sharepoint.com`, {
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
  if (!siteResponse.ok) {
    const error = await siteResponse.json();
    throw new Error(error.error?.message || "Site SharePoint not found");
  }
  const site = await siteResponse.json();

  const downloadResponse = await fetch(`https://graph.microsoft.com/v1.0/sites/${site.id}/drive/items/${fileId}?select=@microsoft.graph.downloadUrl,name`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!downloadResponse.ok) {
    const error = await downloadResponse.json();
    throw new Error(error.error?.message || "Cannot get download URL");
  }
  const fileData = await downloadResponse.json();

  const fileResponse = await fetch(fileData["@microsoft.graph.downloadUrl"]);
  if (!fileResponse.ok) throw new Error("Cannot download file from SharePoint");

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.from(await fileResponse.arrayBuffer()));

  const sheetsToRemove = [];
  workbook.eachSheet((ws) => {
    if (!sheetsToKeep.includes(ws.name)) sheetsToRemove.push(ws.id);
  });
  sheetsToRemove.forEach((id) => workbook.removeWorksheet(id));

  return { buffer: Buffer.from(await workbook.xlsx.writeBuffer()), fileName: fileData.name };
}

async function importSheetsToExcelFile(targetFileId, importedFileBuffer, sheets) {
  const token = await getAccessToken();

  const siteResponse = await fetch(`https://graph.microsoft.com/v1.0/sites/${sharePointSiteName}.sharepoint.com`, {
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
  if (!siteResponse.ok) {
    const error = await siteResponse.json();
    throw new Error(error.error?.message || "Site SharePoint not found");
  }
  const site = await siteResponse.json();

  const importedWorkbook = new ExcelJS.Workbook();
  await importedWorkbook.xlsx.load(importedFileBuffer);

  const importedDataBySituation = {};
  for (const { sheetName, situation } of sheets) {
    const sheet = importedWorkbook.getWorksheet(sheetName);
    if (!sheet) continue;

    importedDataBySituation[situation] = new Map();
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const value = row.getCell(6).value;
      if (row.getCell(5).value) importedDataBySituation[situation].set(String(row.getCell(5).value).trim(), value ?? "");
    });
  }

  const extractedData = [];

  for (const { sheetName, situation } of sheets) {
    if (!importedDataBySituation[situation] || importedDataBySituation[situation].size === 0) continue;

    const usedRangeResponse = await fetch(
      `https://graph.microsoft.com/v1.0/sites/${site.id}/drive/items/${targetFileId}/workbook/worksheets('${encodeURIComponent(sheetName)}')/usedRange`,
      { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } }
    );

    if (!usedRangeResponse.ok) {
      const error = await usedRangeResponse.json();
      throw new Error(error.error?.message || `Cannot read sheet ${sheetName}`);
    }

    const usedRangeData = await usedRangeResponse.json();
    const rows = usedRangeData.values || [];
    const startRow = usedRangeData.address ? parseInt(usedRangeData.address.match(/\d+/)?.[0] || 1) : 1;

    for (let i = 0; i < rows.length; i++) {
      const excelIndicatorId = rows[i][4] ? String(rows[i][4]).trim() : "";
      if (!excelIndicatorId || !importedDataBySituation[situation].has(excelIndicatorId)) continue;

      const newValue = importedDataBySituation[situation].get(excelIndicatorId);
      const cellValue = Array.isArray(newValue) ? newValue.join(", ") : newValue;

      const updateResponse = await fetch(
        `https://graph.microsoft.com/v1.0/sites/${site.id}/drive/items/${targetFileId}/workbook/worksheets('${encodeURIComponent(sheetName)}')/range(address='F${startRow + i}')`,
        {
          method: "PATCH",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ values: [[cellValue]] }),
        }
      );

      if (!updateResponse.ok) {
        const error = await updateResponse.json();
        throw new Error(error.error?.message || `Cannot update cell F${startRow + i} in sheet ${sheetName}`);
      }

      extractedData.push({ excel_indicator_id: excelIndicatorId, value: newValue, situation });
    }
  }

  return { success: true, extractedData };
}

module.exports = { getAccessToken, readExcelCells, updateExcelCellByIndicatorId, duplicateExcelFile, exportExcelFile, exportExcelFileWithSpecificSheets, importSheetsToExcelFile };
