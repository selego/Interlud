const { getAccessToken } = require("../src/services/microsoftGraph");
const fs = require("fs");

const sharePointSiteName = "selegobv";

async function getSiteId() {
  const token = await getAccessToken();
  const siteResponse = await fetch(`https://graph.microsoft.com/v1.0/sites/${sharePointSiteName}.sharepoint.com`, {
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });

  if (!siteResponse.ok) {
    const error = await siteResponse.json();
    throw new Error(error.error?.message || "Site SharePoint not found");
  }

  const site = await siteResponse.json();
  return site.id;
}

async function getAllExcelFiles(folderId = "root", path = "") {
  try {
    const token = await getAccessToken();
    const siteId = await getSiteId();

    const endpoint = folderId === "root" ? `https://graph.microsoft.com/v1.0/sites/${siteId}/drive/root/children` : `https://graph.microsoft.com/v1.0/sites/${siteId}/drive/items/${folderId}/children`;

    const response = await fetch(endpoint, {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || "Cannot list files");
    }

    const data = await response.json();
    let excelFiles = [];

    for (const item of data.value) {
      const itemPath = path ? `${path}/${item.name}` : item.name;

      if (item.folder) {
        console.log(`📁 Parcours du dossier: ${itemPath}`);
        const subFiles = await getAllExcelFiles(item.id, itemPath);
        excelFiles = excelFiles.concat(subFiles);
      } else if (item.name.endsWith(".xlsx") || item.name.endsWith(".xls") || item.name.endsWith(".xlsm")) {
        excelFiles.push({
          id: item.id,
          name: item.name,
          path: itemPath,
          size: item.size,
          lastModified: item.lastModifiedDateTime,
          webUrl: item.webUrl,
        });
        console.log(`📊 Fichier Excel trouvé: ${itemPath}`);
      }
    }

    return excelFiles;
  } catch (error) {
    console.error("Erreur lors de la récupération des fichiers:", error);
    throw error;
  }
}

async function getWorksheets(siteId, fileId) {
  try {
    const token = await getAccessToken();

    const worksheetsResponse = await fetch(`https://graph.microsoft.com/v1.0/sites/${siteId}/drive/items/${fileId}/workbook/worksheets`, {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    });

    if (!worksheetsResponse.ok) {
      const error = await worksheetsResponse.json();
      console.log(`  ⚠️ Impossible de lire les feuilles: ${error.error?.message || "Erreur inconnue"}`);
      return [];
    }

    const worksheetsData = await worksheetsResponse.json();
    return worksheetsData.value.map((ws) => ({
      id: ws.id,
      name: ws.name,
      position: ws.position,
      visibility: ws.visibility,
    }));
  } catch (error) {
    console.log(`  ⚠️ Erreur: ${error.message}`);
    return [];
  }
}

async function getAllSheetsFromAllFiles() {
  try {
    console.log("🔍 Recherche de tous les fichiers Excel sur SharePoint...\n");

    const siteId = await getSiteId();
    const excelFiles = await getAllExcelFiles();

    console.log(`\n${"=".repeat(80)}`);
    console.log(`📊 ${excelFiles.length} FICHIERS EXCEL TROUVÉS`);
    console.log(`${"=".repeat(80)}\n`);

    const results = [];

    for (const file of excelFiles) {
      console.log(`\n📄 ${file.name}`);
      console.log(`   ID: ${file.id}`);
      console.log(`   Chemin: ${file.path}`);

      const worksheets = await getWorksheets(siteId, file.id);

      if (worksheets.length > 0) {
        console.log(`   📋 ${worksheets.length} feuille(s):`);
        worksheets.forEach((ws, i) => {
          console.log(`      ${i + 1}. ${ws.name} (${ws.id})`);
        });
      }

      results.push({
        file: {
          id: file.id,
          name: file.name,
          path: file.path,
          size: file.size,
          lastModified: file.lastModified,
          webUrl: file.webUrl,
        },
        worksheets: worksheets,
        sheetsCount: worksheets.length,
      });
    }

    // Sauvegarder les résultats
    const outputData = {
      totalFiles: excelFiles.length,
      totalSheets: results.reduce((acc, r) => acc + r.sheetsCount, 0),
      extractedAt: new Date().toISOString(),
      files: results,
    };

    fs.writeFileSync("./all_excel_sheets.json", JSON.stringify(outputData, null, 2));

    console.log(`\n${"=".repeat(80)}`);
    console.log(`✅ TERMINÉ`);
    console.log(`   📄 ${outputData.totalFiles} fichiers Excel`);
    console.log(`   📋 ${outputData.totalSheets} feuilles au total`);
    console.log(`   💾 Sauvegardé dans 'all_excel_sheets.json'`);
    console.log(`${"=".repeat(80)}`);

    return results;
  } catch (error) {
    console.error("❌ Erreur:", error.message);
    throw error;
  }
}

// Fonction pour récupérer les feuilles d'un seul fichier par son ID
async function getSheetsByFileId(fileId) {
  try {
    const siteId = await getSiteId();
    const token = await getAccessToken();

    // Récupérer les infos du fichier
    const fileResponse = await fetch(`https://graph.microsoft.com/v1.0/sites/${siteId}/drive/items/${fileId}`, {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    });

    if (!fileResponse.ok) {
      const error = await fileResponse.json();
      throw new Error(error.error?.message || "Cannot read file info");
    }

    const fileData = await fileResponse.json();
    const worksheets = await getWorksheets(siteId, fileId);

    console.log(`📄 ${fileData.name}`);
    console.log(`   ID: ${fileId}`);
    console.log(`   📋 ${worksheets.length} feuille(s):`);
    worksheets.forEach((ws, i) => {
      console.log(`      ${i + 1}. ${ws.name} (${ws.id})`);
    });

    return { file: fileData, worksheets };
  } catch (error) {
    console.error("❌ Erreur:", error.message);
    throw error;
  }
}

// Exécuter le script
if (require.main === module) {
  getAllSheetsFromAllFiles()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = {
  getAllSheetsFromAllFiles,
  getSheetsByFileId,
  getWorksheets,
  getAllExcelFiles,
  getSiteId,
};
