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

module.exports = { getAccessToken, getSharePointExcelFiles, readExcelCells, updateExcelCell };
