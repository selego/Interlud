require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
const fs = require("fs");
const path = require("path");
const { getWorksheetUsedRange, parseExcelFormula, resolveAllFormulas } = require("./scrap_indicator_excel");

// Lecture seule : ce script ne se connecte PAS à Mongo et n'écrit RIEN en base.
// Il reprend le master Excel et liste toutes les formules d'affichage (colonne K)
// que le parser de scrap_indicator_excel.js ne sait pas interpréter.

const masterFileId = "01IBL4ADPW52VMA7PAEVDIZGBCDDPTODA3"; // même ID que scrap_indicator_excel.js

const WORKSHEETS = [
  { worksheetName: "Remplissage - Sit. Init.", situation: "init" },
  { worksheetName: "Remplissage - Sit. Ref.", situation: "ref" },
  { worksheetName: "Remplissage - Sit. Prev.", situation: "prev" },
  { worksheetName: "Remplissage - Sit. Expost", situation: "expost" },
];

const columnToIndex = { A: 0, B: 1, C: 2, D: 3, E: 4, F: 5, G: 6, H: 7, I: 8, J: 9, K: 10, L: 11, M: 12, N: 13, O: 14, P: 15, Q: 16, R: 17, S: 18, T: 19, U: 20 };

(async () => {
  try {
    // Étape 1 : charger toutes les feuilles (nécessaire pour les références inter-feuilles)
    console.log("📥 Chargement de toutes les feuilles Excel (lecture seule)...");
    const allSheetsData = new Map();
    for (const { worksheetName, situation } of WORKSHEETS) {
      console.log(`   📄 Chargement de "${worksheetName}"...`);
      const data = await getWorksheetUsedRange(masterFileId, worksheetName);
      allSheetsData.set(situation, {
        worksheetName,
        dataRows: data.values.slice(1),
        formulaRows: data.formulas ? data.formulas.slice(1) : null,
        startRow: data.address?.match(/[A-Z]+(\d+):/i) ? parseInt(data.address.match(/[A-Z]+(\d+):/i)[1], 10) : 1,
      });
    }
    console.log("✅ Toutes les feuilles chargées!\n");

    // Étape 2 : construire les maps ligne→indicateur et ligne→formule pour chaque situation
    const allRowToIndicatorMaps = new Map();
    const allFormulasMapsBySituation = new Map();
    for (const [sit, sheetData] of allSheetsData) {
      const rowToIndicatorMap = new Map();
      for (let i = 0; i < sheetData.dataRows.length; i++) {
        const excelIndicatorId = sheetData.dataRows[i][4];
        if (excelIndicatorId && excelIndicatorId !== "") rowToIndicatorMap.set(sheetData.startRow + 1 + i, String(excelIndicatorId).trim());
      }
      allRowToIndicatorMaps.set(sit, rowToIndicatorMap);

      const formulasMap = new Map();
      if (sheetData.formulaRows) {
        for (let i = 0; i < sheetData.formulaRows.length; i++) {
          const formula = sheetData.formulaRows[i][10];
          if (formula && String(formula).startsWith("=")) formulasMap.set(sheetData.startRow + 1 + i, String(formula));
        }
      }
      allFormulasMapsBySituation.set(sit, formulasMap);
    }

    // Étape 3 : rejouer la résolution par situation et collecter les formules non prises en compte
    const unparsed = [];
    let totalFormulas = 0;
    let totalParsed = 0;

    for (const { situation, worksheetName } of WORKSHEETS) {
      const sheetData = allSheetsData.get(situation);
      const rowToIndicatorMap = allRowToIndicatorMaps.get(situation);
      const formulasMap = allFormulasMapsBySituation.get(situation);

      const getCellValue = (rowNum, column) => {
        const rowIndex = rowNum - sheetData.startRow - 1;
        if (rowIndex < 0 || rowIndex >= sheetData.dataRows.length) return null;
        const colIndex = columnToIndex[column.toUpperCase()];
        if (colIndex === undefined) return null;
        return sheetData.dataRows[rowIndex][colIndex];
      };

      const resolvedConditions = resolveAllFormulas(formulasMap, rowToIndicatorMap, getCellValue, allSheetsData, allRowToIndicatorMaps, allFormulasMapsBySituation);

      totalFormulas += formulasMap.size;
      for (const [rowNum, formula] of formulasMap) {
        const resolved = resolvedConditions.get(rowNum);
        if (resolved === null) {
          unparsed.push({ situation, worksheetName, rowNum, excelIndicatorId: rowToIndicatorMap.get(rowNum) || "N/A", reason: "non parsée", formula });
          continue;
        }
        if (resolved?._ignored) {
          unparsed.push({ situation, worksheetName, rowNum, excelIndicatorId: rowToIndicatorMap.get(rowNum) || "N/A", reason: "ignorée (référence inter-feuilles non résolue)", formula });
          continue;
        }
        totalParsed++;
      }
    }

    // Étape 4 : affichage
    console.log("═══════════════════════════════════════════════════════════");
    console.log(`📊 ${totalFormulas} formules trouvées · ${totalParsed} parsées · ${unparsed.length} NON prises en compte`);
    console.log("═══════════════════════════════════════════════════════════\n");

    for (const { situation } of WORKSHEETS) {
      const rows = unparsed.filter((u) => u.situation === situation);
      if (rows.length === 0) continue;
      console.log(`\n🔸 Situation "${situation}" — ${rows.length} formule(s) non prise(s) en compte :`);
      for (const u of rows) {
        console.log(`   • L${u.rowNum} [${u.excelIndicatorId}] (${u.reason})`);
        console.log(`     ${u.formula}`);
      }
    }

    // Étape 5 : export JSON à côté du script (pour réutilisation)
    const outPath = path.resolve(__dirname, "unparsed_formulas.json");
    fs.writeFileSync(outPath, JSON.stringify(unparsed, null, 2));
    console.log(`\n💾 Détail exporté dans ${outPath}`);

    process.exit(0);
  } catch (error) {
    console.error("\n❌ Échec du script:", error.message);
    process.exit(1);
  }
})();
