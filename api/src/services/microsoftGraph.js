const tenantId = "efa89c5e-5599-439d-8f01-b4da9ded0a55";
const clientId = "f2924bbc-a975-49fe-a2ca-df4ff711be14";
const clientSecret = "9aG8Q~chbn5ywMYUtx6zd3Z8zUelSoQjsHuiTdq9";
const sharePointSiteName = "selegobv";

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

async function getSharePointExcelFiles() {
  const token = await getAccessToken();
  const siteResponse = await fetch(`https://graph.microsoft.com/v1.0/sites/${sharePointSiteName}.sharepoint.com`, {
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
  if (!siteResponse.ok) {
    const error = await siteResponse.json();
    console.error("Site error:", error);
    throw new Error(error.error?.message || "Site SharePoint not found");
  }
  const site = await siteResponse.json();
  const filesResponse = await fetch(`https://graph.microsoft.com/v1.0/sites/${site.id}/drive/root/children`, {
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
  if (!filesResponse.ok) {
    const error = await filesResponse.json();
    console.error("Files error:", error);
    throw new Error(error.error?.message || "Cannot access SharePoint files");
  }
  const filesData = await filesResponse.json();
  const excelFiles = filesData.value.filter(
    (file) => file.name.toLowerCase().endsWith(".xlsx") || file.name.toLowerCase().endsWith(".xls"),
  );
  return excelFiles;
}

async function readExcelCells(fileId, worksheetName, range) {
  const token = await getAccessToken();

  const siteResponse = await fetch(`https://graph.microsoft.com/v1.0/sites/${sharePointSiteName}.sharepoint.com`, {
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });

  const site = await siteResponse.json();

  const cellsResponse = await fetch(
    `https://graph.microsoft.com/v1.0/sites/${site.id}/drive/items/${fileId}/workbook/worksheets/${worksheetName}/range(address='${range}')`,
    {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    },
  );

  if (!cellsResponse.ok) {
    const error = await cellsResponse.json();
    console.error("Cells error:", error);
    throw new Error(error.error?.message || "Cannot read Excel cells");
  }

  const cellsData = await cellsResponse.json();
  return cellsData;
}

async function updateExcelCell(fileId, worksheetName, cellAddress, value) {
  const token = await getAccessToken();
  const siteResponse = await fetch(`https://graph.microsoft.com/v1.0/sites/${sharePointSiteName}.sharepoint.com`, {
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });

  const site = await siteResponse.json();
  const updateResponse = await fetch(
    `https://graph.microsoft.com/v1.0/sites/${site.id}/drive/items/${fileId}/workbook/worksheets/${worksheetName}/range(address='${cellAddress}')`,
    {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ values: [[value]] }),
    },
  );

  if (!updateResponse.ok) {
    const error = await updateResponse.json();
    console.error("Update error:", error);
    throw new Error(error.error?.message || "Cannot update Excel cell");
  }

  const result = await updateResponse.json();
  return result;
}

async function updateExcelCellByIndicatorId(fileId, worksheetName, excelIndicatorId, value) {
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
    `https://graph.microsoft.com/v1.0/sites/${site.id}/drive/items/${fileId}/workbook/worksheets/${worksheetName}/usedRange`,
    {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    },
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
      rowNumber = usedRangeData.address ? parseInt(usedRangeData.address.match(/\d+/)?.[0] || 1) + i :  i + 1;
      break;
    }
  }
  if (!rowNumber) throw new Error(`Indicator ID "${excelIndicatorId}" not found in column E`);

  let cellValue = value;
  if (Array.isArray(cellValue)) cellValue = cellValue.join(", ");

  const updateResponse = await fetch(
    `https://graph.microsoft.com/v1.0/sites/${site.id}/drive/items/${fileId}/workbook/worksheets/${worksheetName}/range(address='F${rowNumber}')`,
    {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ values: [[cellValue]] }),
    },
  );

  if (!updateResponse.ok) {
    const error = await updateResponse.json();
    console.error("Update error:", error);
    throw new Error(error.error?.message || "Cannot update Excel cell");
  }
}

async function duplicateExcelFile(sourceFileId, newFileName) {
  const token = await getAccessToken();
  
  const siteResponse = await fetch(`https://graph.microsoft.com/v1.0/sites/${sharePointSiteName}.sharepoint.com`, { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }});

  if (!siteResponse.ok) {
    const error = await siteResponse.json();
    throw new Error(error.error?.message || "Site SharePoint not found");
  }

  const site = await siteResponse.json();

  const sourceFileResponse = await fetch(`https://graph.microsoft.com/v1.0/sites/${site.id}/drive/items/${sourceFileId}`, { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }});

  if (!sourceFileResponse.ok) {
    const error = await sourceFileResponse.json();
    console.error("Source file error:", error);
    throw new Error(error.error?.message || "Cannot access source file");
  }

  const sourceFile = await sourceFileResponse.json();
  const parentReference = sourceFile.parentReference;

  const copyResponse = await fetch( `https://graph.microsoft.com/v1.0/sites/${site.id}/drive/items/${sourceFileId}/copy`,
    {
      method: "POST",
      headers: { 
        Authorization: `Bearer ${token}`, 
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ name: newFileName, parentReference: {
        driveId: parentReference.driveId, id: parentReference.id } }),
  });

  if (!copyResponse.ok) {
    const error = await copyResponse.json();
    console.error("Copy error:", error);
    throw new Error(error.error?.message || "Cannot copy Excel file");
  }

  const monitorUrl = copyResponse.headers.get('Location');
  
  if (!monitorUrl) throw new Error("No monitor URL returned for copy operation");

  await new Promise(resolve => setTimeout(resolve, 2000));
  let copiedFileId = null;
  let attempts = 0;

  while (!copiedFileId && attempts < 20) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const searchResponse = await fetch(`https://graph.microsoft.com/v1.0/sites/${site.id}/drive/root/children?$filter=name eq '${newFileName}'`,
      { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }});

    if (!searchResponse.ok) throw new Error("Cannot search for copied file");

    const searchResult = await searchResponse.json();
    if (searchResult.value && searchResult.value.length > 0) {
      copiedFileId = searchResult.value[0].id;
      console.log("Found copied file:", copiedFileId);
      break;
    }
    
    attempts++;
  }
  if (!copiedFileId) throw new Error("Copy operation timed out - could not find copied file");
  return copiedFileId;
}


module.exports = { getAccessToken, getSharePointExcelFiles, readExcelCells, updateExcelCell, updateExcelCellByIndicatorId, duplicateExcelFile };
