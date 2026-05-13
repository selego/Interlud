require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
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

    // Récupérer tous les éléments du dossier
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
        // C'est un dossier, on le parcourt récursivement
        console.log(`📁 Parcours du dossier: ${itemPath}`);
        const subFiles = await getAllExcelFiles(item.id, itemPath);
        excelFiles = excelFiles.concat(subFiles);
      } else if (item.name.endsWith(".xlsx") || item.name.endsWith(".xls") || item.name.endsWith(".xlsm")) {
        // C'est un fichier Excel
        excelFiles.push({
          id: item.id,
          name: item.name,
          path: itemPath,
          size: item.size,
          sizeFormatted: `${(item.size / 1024 / 1024).toFixed(2)} MB`,
          lastModified: item.lastModifiedDateTime,
          webUrl: item.webUrl,
          createdBy: item.createdBy?.user?.displayName || "Unknown",
          lastModifiedBy: item.lastModifiedBy?.user?.displayName || "Unknown",
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

async function main() {
  try {
    console.log("🔍 Recherche de tous les fichiers Excel sur SharePoint...\n");

    const excelFiles = await getAllExcelFiles();

    console.log(`\n${"=".repeat(80)}`);
    console.log(`📊 FICHIERS EXCEL TROUVÉS: ${excelFiles.length}`);
    console.log(`${"=".repeat(80)}\n`);

    excelFiles.forEach((file, index) => {
      console.log(`${index + 1}. 📄 ${file.name}`);
      console.log(`   ID: ${file.id}`);
      console.log(`   Chemin: ${file.path}`);
      console.log(`   Taille: ${file.sizeFormatted}`);
      console.log(`   Modifié: ${new Date(file.lastModified).toLocaleString()}`);
      console.log(`   Par: ${file.lastModifiedBy}`);
      console.log("");
    });

    // Sauvegarder dans un fichier JSON
    const outputData = {
      totalFiles: excelFiles.length,
      extractedAt: new Date().toISOString(),
      files: excelFiles,
    };

    fs.writeFileSync("./excel_files_list.json", JSON.stringify(outputData, null, 2));
    console.log("💾 Liste sauvegardée dans 'excel_files_list.json'");

    // Afficher un résumé rapide pour copier/coller
    console.log("\n📋 RÉSUMÉ (ID → Nom):");
    console.log("-".repeat(80));
    excelFiles.forEach((file) => {
      console.log(`${file.id} → ${file.name}`);
    });

    return excelFiles;
  } catch (error) {
    console.error("❌ Erreur:", error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { getAllExcelFiles, getSiteId };
