const { getAccessToken } = require("../src/services/microsoftGraph");

const sharePointSiteName = "selegobv";
const fileId = "01IBL4ADO73TUHKGZ4EJCJATFUR357PVU4";

async function getAllWorksheets(fileId) {
  try {
    const token = await getAccessToken();
    
    // Récupérer les informations du site SharePoint
    const siteResponse = await fetch(`https://graph.microsoft.com/v1.0/sites/${sharePointSiteName}.sharepoint.com`, {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    });

    if (!siteResponse.ok) {
      const error = await siteResponse.json();
      throw new Error(error.error?.message || "Site SharePoint not found");
    }

    const site = await siteResponse.json();

    // Récupérer la liste de toutes les feuilles de calcul
    const worksheetsResponse = await fetch(
      `https://graph.microsoft.com/v1.0/sites/${site.id}/drive/items/${fileId}/workbook/worksheets`,
      {
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      }
    );

    if (!worksheetsResponse.ok) {
      const error = await worksheetsResponse.json();
      throw new Error(error.error?.message || "Cannot read worksheets");
    }

    const worksheetsData = await worksheetsResponse.json();
    return worksheetsData.value;
  } catch (error) {
    console.error("Erreur lors de la récupération des feuilles:", error);
    throw error;
  }
}

async function getFileInfo(fileId) {
  try {
    const token = await getAccessToken();
    
    // Récupérer les informations du site SharePoint
    const siteResponse = await fetch(`https://graph.microsoft.com/v1.0/sites/${sharePointSiteName}.sharepoint.com`, {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    });

    if (!siteResponse.ok) {
      const error = await siteResponse.json();
      throw new Error(error.error?.message || "Site SharePoint not found");
    }

    const site = await siteResponse.json();

    // Récupérer les informations du fichier
    const fileResponse = await fetch(
      `https://graph.microsoft.com/v1.0/sites/${site.id}/drive/items/${fileId}`,
      {
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      }
    );

    if (!fileResponse.ok) {
      const error = await fileResponse.json();
      throw new Error(error.error?.message || "Cannot read file info");
    }

    const fileData = await fileResponse.json();
    return fileData;
  } catch (error) {
    console.error("Erreur lors de la récupération des infos du fichier:", error);
    throw error;
  }
}

async function getAllSheetsInfo() {
  try {
    console.log("🔍 Récupération des informations du fichier et des feuilles...");
    
    // Récupérer les infos du fichier
    const fileInfo = await getFileInfo(fileId);
    console.log("📄 Informations du fichier:");
    console.log(`  - Nom: ${fileInfo.name}`);
    console.log(`  - ID: ${fileInfo.id}`);
    console.log(`  - Taille: ${(fileInfo.size / 1024 / 1024).toFixed(2)} MB`);
    console.log(`  - Dernière modification: ${new Date(fileInfo.lastModifiedDateTime).toLocaleString()}`);
    console.log(`  - URL: ${fileInfo.webUrl}`);
    
    // Récupérer toutes les feuilles
    const worksheets = await getAllWorksheets(fileId);
    
    console.log(`\n📊 Feuilles de calcul trouvées (${worksheets.length}):`);
    
    worksheets.forEach((worksheet, index) => {
      console.log(`\n${index + 1}. 📋 ${worksheet.name}`);
      console.log(`   - ID: ${worksheet.id}`);
      console.log(`   - Position: ${worksheet.position}`);
      console.log(`   - Visibilité: ${worksheet.visibility}`);
    });

    // Sauvegarder les informations dans un fichier JSON
    const fs = require('fs');
    const outputData = {
      file: {
        id: fileInfo.id,
        name: fileInfo.name,
        size: fileInfo.size,
        lastModified: fileInfo.lastModifiedDateTime,
        webUrl: fileInfo.webUrl
      },
      worksheets: worksheets.map(ws => ({
        id: ws.id,
        name: ws.name,
        position: ws.position,
        visibility: ws.visibility
      })),
      totalSheets: worksheets.length,
      extractedAt: new Date().toISOString()
    };
    
    fs.writeFileSync('./file_sheets_info.json', JSON.stringify(outputData, null, 2));
    console.log("\n💾 Informations sauvegardées dans 'file_sheets_info.json'");

    return { fileInfo, worksheets };
  } catch (error) {
    console.error("❌ Erreur:", error.message);
    throw error;
  }
}

// Fonction utilitaire pour obtenir une feuille spécifique par nom
async function getWorksheetByName(worksheetName) {
  try {
    const { worksheets } = await getAllSheetsInfo();
    const worksheet = worksheets.find(ws => ws.name === worksheetName);
    
    if (!worksheet) {
      console.log(`❌ Feuille "${worksheetName}" non trouvée`);
      console.log("📋 Feuilles disponibles:");
      worksheets.forEach(ws => console.log(`  - ${ws.name}`));
      return null;
    }
    
    console.log(`✅ Feuille trouvée: ${worksheet.name} (ID: ${worksheet.id})`);
    return worksheet;
  } catch (error) {
    console.error("❌ Erreur:", error.message);
    throw error;
  }
}

// Exécuter le script
if (require.main === module) {
  getAllSheetsInfo()
    .then(({ fileInfo, worksheets }) => {
      console.log("\n✅ Script terminé avec succès!");
      console.log(`📄 Fichier: ${fileInfo.name}`);
      console.log(`📊 ${worksheets.length} feuilles trouvées`);
      
      // Afficher un résumé rapide
      console.log("\n📋 Résumé des feuilles:");
      worksheets.forEach((ws, i) => {
        console.log(`  ${i + 1}. ${ws.name} (${ws.id})`);
      });
    })
    .catch((error) => {
      console.error("\n❌ Échec du script:", error.message);
      process.exit(1);
    });
}

module.exports = { 
  getAllSheetsInfo, 
  getAllWorksheets, 
  getFileInfo, 
  getWorksheetByName 
};