const { getAccessToken } = require("../src/services/microsoftGraph");
const fs = require("fs");

const sharePointSiteName = "selegobv";
const fileId = "01IBL4ADM2GGWQITUEAZDYF3Y4Q66XTJB7";

const worksheetsToProcess = [
  { worksheetName: "Remplissage - Sit. Init.", situation: "init" },
  { worksheetName: "Remplissage - Sit. Ref.", situation: "ref" },
  { worksheetName: "Remplissage - Sit. Prev.", situation: "prev" },
  { worksheetName: "Remplissage - Sit. Expost", situation: "expost" },
];

// Colonnes à comparer (exclut la colonne "Valeur" qui est différente par nature)
const COLUMNS_TO_COMPARE = [
  { index: 0, name: "Catégorie" },
  { index: 1, name: "Sous-catégorie" },
  { index: 2, name: "Titre" },
  { index: 3, name: "Description" },
  // index 4 = excel_indicator_id (clé de comparaison)
  // index 5 = Valeur (on l'exclut)
  { index: 6, name: "Valeurs possibles" },
  // index 7 = Valeur par défaut (peut légitimement différer entre situations)
  { index: 8, name: "Unité" },
  { index: 9, name: "Type" },
  // index 10, 11 = autres colonnes
  { index: 12, name: "Action liée" },
  // index 13, 14 = autres colonnes
  //   { index: 15, name: "Affichage conditionnel" },
];

async function getWorksheetUsedRange(fileId, worksheetName) {
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

    const usedRangeResponse = await fetch(`https://graph.microsoft.com/v1.0/sites/${site.id}/drive/items/${fileId}/workbook/worksheets/${worksheetName}/usedRange`, {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    });

    if (!usedRangeResponse.ok) {
      const error = await usedRangeResponse.json();
      throw new Error(error.error?.message || "Cannot read worksheet used range");
    }

    const usedRangeData = await usedRangeResponse.json();
    return usedRangeData;
  } catch (error) {
    console.error("Erreur lors de la récupération des données:", error);
    throw error;
  }
}

function normalizeValue(value) {
  if (value === null || value === undefined || value === "") return "";
  return String(value).trim();
}

async function loadAllSituations() {
  const allData = {};

  for (const { worksheetName, situation } of worksheetsToProcess) {
    console.log(`📊 Chargement de "${worksheetName}"...`);
    const data = await getWorksheetUsedRange(fileId, worksheetName);
    const dataRows = data.values.slice(1); // Skip header

    for (const row of dataRows) {
      const excelIndicatorId = row[4];
      if (!excelIndicatorId || excelIndicatorId === "") continue;

      if (!allData[excelIndicatorId]) allData[excelIndicatorId] = {};

      allData[excelIndicatorId][situation] = row;
    }
  }

  return allData;
}

function findDifferences(allData) {
  const differences = [];
  const situations = ["init", "ref", "prev", "expost"];

  for (const [excelIndicatorId, situationData] of Object.entries(allData)) {
    const presentSituations = situations.filter((s) => situationData[s]);

    // Skip si l'indicateur n'est présent que dans une seule situation
    if (presentSituations.length < 2) continue;

    for (const column of COLUMNS_TO_COMPARE) {
      const values = {};
      let hasDifference = false;
      let firstValue = null;

      for (const situation of presentSituations) {
        const row = situationData[situation];
        const value = normalizeValue(row[column.index]);
        values[situation] = value;

        if (firstValue === null) firstValue = value;
        if (value !== firstValue) hasDifference = true;
      }

      if (hasDifference) {
        differences.push({
          excel_indicator_id: excelIndicatorId,
          column_name: column.name,
          column_index: column.index,
          init: values.init || "(absent)",
          ref: values.ref || "(absent)",
          prev: values.prev || "(absent)",
          expost: values.expost || "(absent)",
        });
      }
    }
  }

  return differences;
}

function generateCSV(differences) {
  const headers = ["excel_indicator_id", "Colonne", "Init", "Ref", "Prev", "Expost"];
  const rows = [headers.join(";")];

  for (const diff of differences) {
    const row = [`"${diff.excel_indicator_id}"`, `"${diff.column_name}"`, `"${diff.init.replace(/"/g, '""')}"`, `"${diff.ref.replace(/"/g, '""')}"`, `"${diff.prev.replace(/"/g, '""')}"`, `"${diff.expost.replace(/"/g, '""')}"`];
    rows.push(row.join(";"));
  }

  return rows.join("\n");
}

async function main() {
  try {
    // Charger toutes les données
    const allData = await loadAllSituations();
    console.log(`\n✅ ${Object.keys(allData).length} indicateurs chargés\n`);

    // Trouver les différences
    const differences = findDifferences(allData);

    if (differences.length === 0) {
      console.log("✅ Aucune différence trouvée entre les situations!");
      return;
    }

    console.log(`⚠️ ${differences.length} différences trouvées\n`);

    // Grouper par indicateur pour le résumé console
    const byIndicator = {};
    for (const diff of differences) {
      if (!byIndicator[diff.excel_indicator_id]) byIndicator[diff.excel_indicator_id] = [];
      byIndicator[diff.excel_indicator_id].push(diff);
    }

    // Générer le CSV
    const csv = generateCSV(differences);
    const filename = `rapport_differences_indicateurs_${new Date().toISOString().split("T")[0]}.csv`;
    fs.writeFileSync(filename, csv, "utf-8");

    return differences;
  } catch (error) {
    console.error("❌ Erreur:", error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { loadAllSituations, findDifferences, generateCSV };
