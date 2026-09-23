require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
const fs = require("fs");
const path = require("path");
const { getWorksheetUsedRange, parseExcelFormula, resolveAllFormulas, parsePossibilitiesFormula, parseDefaultSourceFormula, parseNameFormula, loadLookupSheets, LOOKUP_SHEET_NAMES } = require("./scrap_indicator_excel");

// Lecture seule : ce script ne se connecte PAS à Mongo et n'écrit RIEN en base.
// Il reprend le master Excel et rejoue TOUS les parsers de formules de scrap_indicator_excel.js,
// avec les mêmes critères que createIndicatorsFromExcel, pour lister ce qui ne serait pas pris en compte :
//   - colonne C  (titre)              → parseNameFormula          : formule référençant une saisie F mais non reconnue (titre gardé statique)
//   - colonne G  (valeurs possibles)  → parsePossibilitiesFormula : formule référençant une saisie F d'une feuille Remplissage mais non reconnue (liste gardée statique)
//   - colonne H  (valeur par défaut)  → parseDefaultSourceFormula : formule référençant une saisie F d'une feuille Remplissage mais non reconnue (défaut gardé statique)
//   - colonne K  (affichage)          → resolveAllFormulas        : non parsée, ignorée (inter-feuilles) ou parse partiel ("* cellule" perdu)

//V22
const masterFileId = "01IBL4ADJSAPGFGPLDDZCZXBGMLGMP7I37";

const WORKSHEETS = [
  { worksheetName: "Remplissage - Sit. Init.", situation: "init" },
  { worksheetName: "Remplissage - Sit. Ref.", situation: "ref" },
  { worksheetName: "Remplissage - Sit. Prev.", situation: "prev" },
  { worksheetName: "Remplissage - Sit. Expost", situation: "expost" },
];

const TYPES = ["titre", "valeurs possibles", "défaut", "affichage"];

const columnToIndex = { A: 0, B: 1, C: 2, D: 3, E: 4, F: 5, G: 6, H: 7, I: 8, J: 9, K: 10, L: 11, M: 12, N: 13, O: 14, P: 15, Q: 16, R: 17, S: 18, T: 19, U: 20, V: 21, W: 22, X: 23, Y: 24, Z: 25 };

const isFormula = (f) => typeof f === "string" && f.trim().startsWith("=");
// Vrai si la formule (hors chaînes) référence une saisie F de la feuille courante ou d'une feuille 'Remplissage - Sit. X'
// (exclut 'Parcs types'!F12, les références à G/H/R…, les VLOOKUP sans F, etc.)
const referencesValueCell = (f) => [...f.replace(/"[^"]*"/g, "").matchAll(/(?:['']([^'']+)['']!)?\$?([A-Z]{1,3})\$?\d+/gi)].some((m) => m[2].toUpperCase() === "F" && (!m[1] || m[1].startsWith("Remplissage")));

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
    const lookupSheets = await loadLookupSheets(masterFileId, LOOKUP_SHEET_NAMES);
    console.log("✅ Toutes les feuilles chargées!\n");

    // Étape 2 : construire les maps ligne→indicateur et ligne→formule (colonne K) pour chaque situation
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
          // 0 littéral (pas de formule) → jamais affiché, on le normalise en "=0" comme dans scrap_indicator_excel.js
          if (String(formula).trim() === "0") formulasMap.set(sheetData.startRow + 1 + i, "=0");
        }
      }
      allFormulasMapsBySituation.set(sit, formulasMap);
    }

    // Lit valeur + formule d'une cellule de n'importe quelle feuille (même signature que getSheetCell dans scrap_indicator_excel.js)
    const getSheetCell = (sit, rowNum, column) => {
      const sheet = allSheetsData.get(sit);
      if (!sheet) return null;
      const rowIndex = rowNum - sheet.startRow - 1;
      if (rowIndex < 0 || rowIndex >= sheet.dataRows.length) return null;
      const colIndex = columnToIndex[column.toUpperCase()];
      if (colIndex === undefined) return null;
      return { value: sheet.dataRows[rowIndex][colIndex], formula: sheet.formulaRows?.[rowIndex]?.[colIndex] };
    };

    // Étape 3 : rejouer chaque parser par situation et collecter les formules non prises en compte
    const unparsed = [];
    const totals = Object.fromEntries(TYPES.map((t) => [t, 0]));

    for (const { situation, worksheetName } of WORKSHEETS) {
      const sheetData = allSheetsData.get(situation);
      const rowToIndicatorMap = allRowToIndicatorMaps.get(situation);
      const formulasMap = allFormulasMapsBySituation.get(situation);
      const getCellValue = (rowNum, column) => getSheetCell(situation, rowNum, column)?.value ?? null;
      const push = (type, rowNum, reason, formula) => unparsed.push({ type, situation, worksheetName, rowNum, excelIndicatorId: rowToIndicatorMap.get(rowNum) || "N/A", reason, formula });

      // --- Colonnes C / G / H : uniquement sur les lignes avec excel_indicator_id (comme createIndicatorsFromExcel)
      for (let i = 0; i < sheetData.dataRows.length; i++) {
        const row = sheetData.dataRows[i];
        if (!row[4] || row[4] === "") continue;
        const rowNum = sheetData.startRow + 1 + i;
        const formulaRow = sheetData.formulaRows?.[i] || [];

        // Titre (colonne C) : seules les formules référençant une saisie F sont censées devenir dynamiques
        const nameFormula = formulaRow[2];
        if (isFormula(nameFormula) && /(^|[^A-Z])\$?F\$?\d+/.test(nameFormula.replace(/"[^"]*"/g, ""))) {
          totals["titre"]++;
          if (!parseNameFormula(nameFormula, situation, rowToIndicatorMap, allRowToIndicatorMaps, getSheetCell)) push("titre", rowNum, "non reconnue (titre gardé statique)", nameFormula);
        }

        // Valeurs possibles (colonne G). Les TEXTJOIN/CONCAT sur Parcs types, List, C1, C9… sont statiques par construction :
        // le scrap découpe la valeur calculée sur les virgules. Seules les formules référençant une saisie F sont censées devenir dynamiques.
        const possibilitiesFormula = formulaRow[6];
        if (isFormula(possibilitiesFormula) && referencesValueCell(possibilitiesFormula)) {
          totals["valeurs possibles"]++;
          if (!parsePossibilitiesFormula(possibilitiesFormula, situation, rowToIndicatorMap, allRowToIndicatorMaps, getCellValue)) push("valeurs possibles", rowNum, "non reconnue (liste gardée statique)", possibilitiesFormula);
        }

        // Valeur par défaut (colonne H), unité en colonne I pour la conversion des offsets en %.
        // Seules les formules référençant une saisie F d'une feuille Remplissage sont censées devenir dynamiques.
        const defaultFormula = formulaRow[7];
        if (isFormula(defaultFormula) && referencesValueCell(defaultFormula)) {
          totals["défaut"]++;
          if (!parseDefaultSourceFormula(defaultFormula, situation, rowToIndicatorMap, allRowToIndicatorMaps, getCellValue, row[8], { getSheetCell, lookupSheets })) push("défaut", rowNum, "non reconnue (défaut gardé statique)", defaultFormula);
        }
      }

      // --- Colonne K : affichage conditionnel
      const resolvedConditions = resolveAllFormulas(formulasMap, rowToIndicatorMap, getCellValue, allSheetsData, allRowToIndicatorMaps, allFormulasMapsBySituation);
      totals["affichage"] += formulasMap.size;
      for (const [rowNum, formula] of formulasMap) {
        const resolved = resolvedConditions.get(rowNum);
        if (resolved === null) {
          push("affichage", rowNum, "non parsée", formula);
          continue;
        }
        if (resolved?._ignored) {
          push("affichage", rowNum, "ignorée (référence inter-feuilles non résolue)", formula);
          continue;
        }

        // Contrôle de cohérence : la formule contient un facteur "* cellule" (miroir/héritage de la
        // condition d'un parent, ex: "* $K$1114") mais le parse brut n'a pas produit de _referenceToMerge
        // → le facteur a été silencieusement perdu, la condition en base serait incomplète.
        const content = formula.substring(1).trim();
        const hasCellFactor = /\)\s*\*\s*\$?[A-Z]+\$?\d+/i.test(content) || /^\$?[A-Z]+\$?\d+\s*\*/i.test(content);
        if (!hasCellFactor) continue;
        const parsed = parseExcelFormula(formula, rowToIndicatorMap, getCellValue, allRowToIndicatorMaps, allSheetsData);
        if (parsed?._referenceToMerge || parsed?._referencesToAnd || parsed?._factorsToAnd) continue;
        push("affichage", rowNum, 'parse partiel (facteur "* cellule" perdu)', formula);
      }
    }

    // Étape 4 : affichage
    console.log("═══════════════════════════════════════════════════════════");
    for (const type of TYPES) {
      const ko = unparsed.filter((u) => u.type === type).length;
      console.log(`📊 ${type.padEnd(18)} : ${String(totals[type]).padStart(4)} formules · ${String(totals[type] - ko).padStart(4)} OK · ${String(ko).padStart(3)} NON prises en compte`);
    }
    console.log("═══════════════════════════════════════════════════════════");

    for (const type of TYPES) {
      for (const { situation } of WORKSHEETS) {
        const rows = unparsed.filter((u) => u.type === type && u.situation === situation);
        if (rows.length === 0) continue;
        console.log(`\n🔸 [${type}] Situation "${situation}" — ${rows.length} formule(s) non prise(s) en compte :`);
        for (const u of rows) {
          console.log(`   • L${u.rowNum} [${u.excelIndicatorId}] (${u.reason})`);
          console.log(`     ${u.formula}`);
        }
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
