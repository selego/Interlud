const { getAccessToken } = require("../src/services/microsoftGraph");
const Action = require("../src/models/action");
const mongoose = require("mongoose");
const config = require("../src/config");

const sharePointSiteName = "selegobv";
const fileId = "01IBL4ADO73TUHKGZ4EJCJATFUR357PVU4";
const worksheetName = "C9";

const CELLS_TO_READ = [
  "C2",
];

async function readSpecificCells(fileId, worksheetName, cellAddresses) {
  try {
    const token = await getAccessToken();
    
    const siteResponse = await fetch(`https://graph.microsoft.com/v1.0/sites/${sharePointSiteName}.sharepoint.com`, {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    });

    if (!siteResponse.ok) {
      const error = await siteResponse.json();
      throw new Error(error.error?.message || "Site SharePoint not found");
    }

    const site = await siteResponse.json();

    const cellValues = {};
    
    for (const cellAddress of cellAddresses) {
      try {
        const encodedWorksheetName = encodeURIComponent(worksheetName);
        const cellResponse = await fetch(
          `https://graph.microsoft.com/v1.0/sites/${site.id}/drive/items/${fileId}/workbook/worksheets/${encodedWorksheetName}/range(address='${cellAddress}')`,
          {
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          }
        );

        if (!cellResponse.ok) {
          const error = await cellResponse.json();
          console.warn(`⚠️ Impossible de lire la cellule ${cellAddress}: ${error.error?.message}`);
          cellValues[cellAddress] = null;
          continue;
        }

        const cellData = await cellResponse.json();
        
        // La valeur est dans cellData.values[0][0]
        const value = cellData.values && cellData.values[0] && cellData.values[0][0];
        cellValues[cellAddress] = value;        
      } catch (error) {
        console.error(`❌ Erreur lecture cellule ${cellAddress}:`, error.message);
        cellValues[cellAddress] = null;
      }
    }

    return cellValues;
  } catch (error) {
    console.error("Erreur lors de la récupération des cellules:", error);
    throw error;
  }
}

async function getWorksheetInfo(fileId, worksheetName) {
  try {
    const token = await getAccessToken();
    
    const siteResponse = await fetch(`https://graph.microsoft.com/v1.0/sites/${sharePointSiteName}.sharepoint.com`, {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    });

    if (!siteResponse.ok) {
      const error = await siteResponse.json();
      throw new Error(error.error?.message || "Site SharePoint not found");
    }

    const site = await siteResponse.json();
    const encodedWorksheetName = encodeURIComponent(worksheetName);
    const worksheetResponse = await fetch(
      `https://graph.microsoft.com/v1.0/sites/${site.id}/drive/items/${fileId}/workbook/worksheets/${encodedWorksheetName}`,
      {
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      }
    );

    if (!worksheetResponse.ok) {
      const error = await worksheetResponse.json();
      throw new Error(error.error?.message || `Cannot read worksheet "${worksheetName}"`);
    }

    const worksheetData = await worksheetResponse.json();
    return worksheetData;
  } catch (error) {
    console.error("Erreur lors de la récupération des infos de la feuille:", error);
    throw error;
  }
}

async function readCellsFromWorksheet() {
  try {
    await mongoose.connect(config.MONGODB_ENDPOINT);
    const worksheetInfo = await getWorksheetInfo(fileId, worksheetName);
    const cellValues = await readSpecificCells(fileId, worksheetName, CELLS_TO_READ);
    
    const action = await Action.create({
      type: "global",
      excel_sheet_id: worksheetInfo.id.replace(/[{}]/g, ''),
        excel_sheet_name: worksheetInfo.name,
        name: cellValues.C2,
      });

    console.log(action);


    return;
  } catch (error) {
    console.error("❌ Erreur:", error.message);
    throw error;
  }
}

if (require.main === module) {


  readCellsFromWorksheet()
    .then(() => {
      console.log("Script terminé avec succès!");
    })
    .catch((error) => {
      console.error("Échec du script:", error.message);
      process.exit(1);
    });
}

module.exports = { 
  readCellsFromWorksheet, 
  readSpecificCells, 
  getWorksheetInfo 
};