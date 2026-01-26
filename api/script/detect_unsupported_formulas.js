/**
 * Script de détection des formules NON IMPLÉMENTABLES avec l'architecture display_condition actuelle
 *
 * L'architecture actuelle supporte:
 * - Une liste plate de conditions avec UN SEUL opérateur (AND ou OR)
 * - Chaque condition: { type, excel_indicator_id, excel_indicator_situation, value, negate }
 *
 * Ce qui N'EST PAS supporté:
 * - Groupes imbriqués: (A OR B) AND C, A AND (B OR C), (A AND B) OR (C AND D)
 * - Opérateurs mixtes sans groupement explicite
 * - Références à des cellules K qui contiennent des conditions avec un opérateur différent
 */

const { getAccessToken } = require("../src/services/microsoftGraph");
const fs = require("fs");

const sharePointSiteName = "selegobv";
const masterFileId = "01IBL4ADIVUZIGVTMVLVCZE36NH3QQKG6T";

const WORKSHEETS = [
  { name: "Remplissage - Sit. Init.", situation: "init" },
  { name: "Remplissage - Sit. Ref.", situation: "ref" },
  { name: "Remplissage - Sit. Prev.", situation: "prev" },
  { name: "Remplissage - Sit. Expost", situation: "expost" },
];

// Récupère la plage utilisée de la feuille de calcul
async function getWorksheetUsedRange(fileId, worksheetName) {
  const token = await getAccessToken();

  const siteResponse = await fetch(`https://graph.microsoft.com/v1.0/sites/${sharePointSiteName}.sharepoint.com`, {
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });

  if (!siteResponse.ok) throw new Error("Site SharePoint not found");
  const site = await siteResponse.json();

  const usedRangeResponse = await fetch(`https://graph.microsoft.com/v1.0/sites/${site.id}/drive/items/${fileId}/workbook/worksheets/${encodeURIComponent(worksheetName)}/usedRange`, {
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });

  if (!usedRangeResponse.ok) throw new Error("Cannot read worksheet used range");
  return await usedRangeResponse.json();
}

// Extrait le numéro de ligne d'une référence de cellule
function extractRowNumber(cellRef) {
  const match = cellRef.match(/\$?[A-Z]+\$?(\d+)/i);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * Analyse une formule et retourne sa structure logique
 * @returns {Object} { type: 'SIMPLE'|'AND'|'OR'|'NESTED'|'UNKNOWN', conditions: [], nestedStructure: string }
 */
function analyzeFormulaStructure(formula, rowToFormulaMap, depth = 0) {
  if (!formula || typeof formula !== "string") return { type: "EMPTY", conditions: [] };

  const f = formula.trim();
  if (!f.startsWith("=")) return { type: "EMPTY", conditions: [] };

  const formulaContent = f.substring(1).trim();

  // Protection contre la récursion infinie
  if (depth > 10) return { type: "TOO_DEEP", conditions: [], formula: f };

  // CAS 1: Référence simple à une cellule K (=K478)
  const simpleKRef = formulaContent.match(/^\$?K\$?(\d+)$/i);
  if (simpleKRef) {
    const refRow = parseInt(simpleKRef[1], 10);
    const referencedFormula = rowToFormulaMap.get(refRow);
    if (referencedFormula) {
      // Résoudre récursivement
      return analyzeFormulaStructure(referencedFormula, rowToFormulaMap, depth + 1);
    }
    return { type: "UNRESOLVED_REF", conditions: [], kRefRow: refRow };
  }

  // CAS 1b: Référence inter-feuilles (='Remplissage - Sit. Init.'!K473)
  // Supporté dans scrap_indicator_excel.js - résolu via resolveConditionInSheet
  // Note: ['''] matche les guillemets droits ' et courbés ''
  const interSheetRef = formulaContent.match(/^[''']([^''']+)[''']!\$?([A-Z]+)\$?(\d+)$/i);
  if (interSheetRef) {
    // C'est une référence à une autre feuille - supporté par le script principal
    return { type: "INTER_SHEET_REF", sheetName: interSheetRef[1], column: interSheetRef[2], row: parseInt(interSheetRef[3], 10), formula: f };
  }

  // CAS 2: IF(OR(...)) - Condition OR
  if (/^(?:SI|IF)\s*\(\s*(?:OU|OR)\s*\(/i.test(formulaContent)) {
    // Compter les conditions dans le OR
    const searchMatches = [...formulaContent.matchAll(/(?:CHERCHE|SEARCH)\s*\(/gi)];
    const equalsMatches = [...formulaContent.matchAll(/\$?[A-Z]+\$?\d+\s*=\s*"/gi)];
    return {
      type: "OR",
      conditionsCount: Math.max(searchMatches.length, equalsMatches.length, 2),
      formula: f,
    };
  }

  // CAS 3: IF(AND(...)) - Condition AND explicite
  if (/^(?:SI|IF)\s*\(\s*(?:ET|AND)\s*\(/i.test(formulaContent)) {
    const searchMatches = [...formulaContent.matchAll(/(?:CHERCHE|SEARCH)\s*\(/gi)];
    const equalsMatches = [...formulaContent.matchAll(/\$?[A-Z]+\$?\d+\s*=\s*"/gi)];
    return {
      type: "AND",
      conditionsCount: Math.max(searchMatches.length, equalsMatches.length, 2),
      formula: f,
    };
  }

  // CAS 4: IF(Kxxx, IF(...), 0) - Nested IF avec référence K (potentiellement complexe)
  const nestedIfWithK = formulaContent.match(/^(?:SI|IF)\s*\(\s*\$?K\$?(\d+)\s*[;,]\s*(?:SI|IF)\s*\(/i);
  if (nestedIfWithK) {
    const kRefRow = parseInt(nestedIfWithK[1], 10);
    const referencedFormula = rowToFormulaMap.get(kRefRow);

    // Analyser la formule référencée
    const refStructure = referencedFormula ? analyzeFormulaStructure(referencedFormula, rowToFormulaMap, depth + 1) : { type: "UNRESOLVED_REF" };

    // Analyser la condition interne du IF imbriqué
    // Extraire ce qui est après "IF(Kxxx," jusqu'à ",0)"
    const innerMatch = formulaContent.match(/(?:SI|IF)\s*\(\s*\$?K\$?\d+\s*[;,]\s*((?:SI|IF)\s*\([^)]+\)[;,][^;,]+[;,][^)]+)/i);

    let innerType = "SIMPLE";
    if (innerMatch) {
      const innerContent = innerMatch[1];
      if (/(?:OU|OR)\s*\(/i.test(innerContent)) innerType = "OR";
      else if (/(?:ET|AND)\s*\(/i.test(innerContent)) innerType = "AND";
    }

    // La structure finale est: refStructure AND innerCondition
    // Si refStructure est OR et innerType est simple/AND, on a (A OR B) AND C - NESTED!
    // Si refStructure est AND et innerType est OR, on a (A AND B) AND (C OR D) - NESTED!

    const isNested = refStructure.type === "OR" || (refStructure.type === "AND" && innerType === "OR") || innerType === "OR";

    return {
      type: isNested ? "NESTED" : "AND",
      nestedStructure: `(${refStructure.type || "?"}:K${kRefRow}) AND (${innerType})`,
      kRefRow,
      referencedFormula: referencedFormula || "NOT_FOUND",
      refType: refStructure.type,
      innerType,
      formula: f,
    };
  }

  // CAS 5: Kxxx * IF(...) - AND implicite avec multiplication
  const multPattern = formulaContent.match(/^\$?K\$?(\d+)\s*\*\s*(?:SI|IF)\s*\(/i);
  if (multPattern) {
    const kRefRow = parseInt(multPattern[1], 10);
    const referencedFormula = rowToFormulaMap.get(kRefRow);
    const refStructure = referencedFormula ? analyzeFormulaStructure(referencedFormula, rowToFormulaMap, depth + 1) : { type: "UNRESOLVED_REF" };

    // Analyser le IF après la multiplication
    let innerType = "SIMPLE";
    if (/(?:OU|OR)\s*\(/i.test(formulaContent)) innerType = "OR";
    else if (/(?:ET|AND)\s*\(/i.test(formulaContent)) innerType = "AND";

    const isNested = refStructure.type === "OR" || innerType === "OR";

    return {
      type: isNested ? "NESTED" : "AND",
      nestedStructure: `(${refStructure.type || "?"}:K${kRefRow}) * (${innerType})`,
      kRefRow,
      referencedFormula: referencedFormula || "NOT_FOUND",
      refType: refStructure.type,
      innerType,
      formula: f,
    };
  }

  // CAS 6: IF(...) * IF(...) ou (IF(...))*(IF(...)) - AND entre deux IF
  // Détection améliorée pour gérer les parenthèses imbriquées comme ISNUMBER(SEARCH(...))
  // Pattern: présence de * avec des IF de part et d'autre
  if (/(?:SI|IF)\s*\(.*\)\s*\*\s*\(?(?:SI|IF)\s*\(/i.test(formulaContent) || /\)\s*\*\s*\((?:SI|IF)\s*\(/i.test(formulaContent)) {
    // Vérifier si l'un des IF contient un OR ou AND explicite
    const hasOr = /(?:OU|OR)\s*\(/i.test(formulaContent);
    const hasAnd = /(?:ET|AND)\s*\(/i.test(formulaContent);

    if (hasOr && hasAnd) {
      return { type: "NESTED", nestedStructure: "IF_AND * IF_OR", formula: f };
    }
    if (hasOr) {
      // Plusieurs IF avec au moins un OR - potentiellement (A OR B) AND C
      return { type: "NESTED", nestedStructure: "Multiple IF with OR", formula: f };
    }
    // Pas de OR ni AND explicite dans les IF - c'est un simple AND implémentable
    return { type: "AND", formula: f };
  }

  // CAS 7: N(AND(NOT(Kxxx), Kyyy)) - AND avec références croisées
  if (/N\s*\(\s*(?:ET|AND)\s*\(/i.test(formulaContent)) {
    // Extraire les références K
    const kRefs = [...formulaContent.matchAll(/\$?K\$?(\d+)/gi)].map((m) => parseInt(m[1], 10));

    let hasOrRef = false;
    for (const kRef of kRefs) {
      const refFormula = rowToFormulaMap.get(kRef);
      if (refFormula) {
        const refStructure = analyzeFormulaStructure(refFormula, rowToFormulaMap, depth + 1);
        if (refStructure.type === "OR") hasOrRef = true;
      }
    }

    return {
      type: hasOrRef ? "NESTED" : "AND",
      nestedStructure: hasOrRef ? "N(AND(...)) with OR refs" : undefined,
      kRefs,
      formula: f,
    };
  }

  // CAS 8: Condition simple (IF avec une seule condition)
  if (/^(?:SI|IF)\s*\(/i.test(formulaContent)) {
    return { type: "SIMPLE", formula: f };
  }

  // CAS 9: Autre formule non reconnue
  return { type: "UNKNOWN", formula: f };
}

/**
 * Détermine si une structure est implémentable avec l'architecture actuelle
 */
function isImplementable(structure) {
  // Types implémentables
  const implementableTypes = ["EMPTY", "SIMPLE", "AND", "OR", "INTER_SHEET_REF", "UNRESOLVED_REF"];
  return implementableTypes.includes(structure.type);
}

async function main() {
  console.log("🔍 Détection des formules NON IMPLÉMENTABLES avec l'architecture display_condition actuelle\n");
  console.log("=".repeat(100));
  console.log("\n📋 Architecture actuelle supportée:");
  console.log("   - Liste plate de conditions avec UN SEUL opérateur (AND ou OR)");
  console.log("   - Pas de groupes imbriqués: (A OR B) AND C, A AND (B OR C), etc.");
  console.log("=".repeat(100));

  const results = {
    summary: {
      totalFormulas: 0,
      implementable: 0,
      notImplementable: 0,
      byType: {},
    },
    notImplementableFormulas: [],
    unknownFormulas: [],
  };

  for (const { name: worksheetName, situation } of WORKSHEETS) {
    console.log(`\n📄 Feuille: "${worksheetName}" (${situation})`);
    console.log("-".repeat(60));

    try {
      const data = await getWorksheetUsedRange(masterFileId, worksheetName);
      const formulaRows = data.formulas ? data.formulas.slice(1) : [];
      const dataRows = data.values.slice(1);
      const startRowMatch = data.address?.match(/[A-Z]+(\d+):/i);
      const startRow = startRowMatch ? parseInt(startRowMatch[1], 10) : 1;

      // Construire les maps
      const rowToIndicatorMap = new Map();
      const rowToFormulaMap = new Map();

      for (let i = 0; i < dataRows.length; i++) {
        const excelIndicatorId = dataRows[i][4];
        if (excelIndicatorId && excelIndicatorId !== "") {
          rowToIndicatorMap.set(startRow + 1 + i, String(excelIndicatorId).trim());
        }
      }

      for (let i = 0; i < formulaRows.length; i++) {
        const formula = formulaRows[i][10];
        if (formula && String(formula).startsWith("=")) {
          rowToFormulaMap.set(startRow + 1 + i, String(formula));
        }
      }

      let sheetStats = { total: 0, implementable: 0, notImplementable: 0, unknown: 0 };

      for (let i = 0; i < formulaRows.length; i++) {
        const formula = formulaRows[i][10];
        const rowNum = startRow + 1 + i;
        const indicatorId = rowToIndicatorMap.get(rowNum) || "N/A";

        if (!formula || !String(formula).startsWith("=")) continue;

        sheetStats.total++;
        results.summary.totalFormulas++;

        const structure = analyzeFormulaStructure(String(formula), rowToFormulaMap);

        // Compter par type
        results.summary.byType[structure.type] = (results.summary.byType[structure.type] || 0) + 1;

        if (structure.type === "NESTED") {
          sheetStats.notImplementable++;
          results.summary.notImplementable++;
          results.notImplementableFormulas.push({
            situation,
            rowNum,
            indicatorId,
            formula: String(formula),
            structure: structure.nestedStructure,
            kRefRow: structure.kRefRow,
            referencedFormula: structure.referencedFormula,
            refType: structure.refType,
            innerType: structure.innerType,
          });
        } else if (structure.type === "UNKNOWN") {
          sheetStats.unknown++;
          results.unknownFormulas.push({
            situation,
            rowNum,
            indicatorId,
            formula: String(formula),
          });
        } else {
          sheetStats.implementable++;
          results.summary.implementable++;
        }
      }

      console.log(`\n📊 Statistiques de la feuille:`);
      console.log(`   Total formules: ${sheetStats.total}`);
      console.log(`   ✅ Implémentables: ${sheetStats.implementable}`);
      console.log(`   ❌ Non implémentables (NESTED): ${sheetStats.notImplementable}`);
      console.log(`   ❓ Inconnues: ${sheetStats.unknown}`);
    } catch (error) {
      console.error(`❌ Erreur: ${error.message}`);
    }
  }

  // Résumé global
  console.log("\n" + "=".repeat(100));
  console.log("📊 RÉSUMÉ GLOBAL");
  console.log("=".repeat(100));
  console.log(`\nTotal formules analysées: ${results.summary.totalFormulas}`);
  console.log(`\n✅ Implémentables: ${results.summary.implementable} (${((results.summary.implementable / results.summary.totalFormulas) * 100).toFixed(2)}%)`);
  console.log(`❌ Non implémentables: ${results.summary.notImplementable} (${((results.summary.notImplementable / results.summary.totalFormulas) * 100).toFixed(2)}%)`);

  console.log(`\n📈 Répartition par type:`);
  for (const [type, count] of Object.entries(results.summary.byType).sort((a, b) => b[1] - a[1])) {
    const percentage = ((count / results.summary.totalFormulas) * 100).toFixed(2);
    const status = ["EMPTY", "SIMPLE", "AND", "OR", "INTER_SHEET_REF", "UNRESOLVED_REF"].includes(type) ? "✅" : type === "NESTED" ? "❌" : "❓";
    console.log(`   ${status} ${type}: ${count} (${percentage}%)`);
  }

  // Afficher les cas non implémentables
  if (results.notImplementableFormulas.length > 0) {
    console.log(`\n` + "=".repeat(100));
    console.log(`❌ FORMULES NON IMPLÉMENTABLES (${results.notImplementableFormulas.length}):`);
    console.log("=".repeat(100));

    // Grouper par indicateur unique
    const uniqueIndicators = new Map();
    for (const item of results.notImplementableFormulas) {
      const key = item.indicatorId;
      if (!uniqueIndicators.has(key)) {
        uniqueIndicators.set(key, item);
      }
    }

    console.log(`\n📋 ${uniqueIndicators.size} indicateurs uniques concernés:\n`);

    for (const [indicatorId, item] of uniqueIndicators) {
      console.log(`\n🔴 ${indicatorId}`);
      console.log(`   Formule: ${item.formula}`);
      console.log(`   Structure: ${item.structure}`);
      if (item.referencedFormula) {
        console.log(`   Formule référencée (K${item.kRefRow}): ${item.referencedFormula}`);
      }
      console.log(`   → Problème: La structure (${item.refType || "?"}) combinée avec (${item.innerType || "?"}) crée un groupe imbriqué`);
    }
  }

  // Afficher les formules inconnues
  if (results.unknownFormulas.length > 0) {
    console.log(`\n` + "=".repeat(100));
    console.log(`❓ FORMULES NON RECONNUES (${results.unknownFormulas.length}):`);
    console.log("=".repeat(100));

    const uniqueUnknown = new Map();
    for (const item of results.unknownFormulas) {
      if (!uniqueUnknown.has(item.indicatorId)) {
        uniqueUnknown.set(item.indicatorId, item);
      }
    }

    console.log(`\n📋 ${uniqueUnknown.size} indicateurs uniques:\n`);
    for (const [indicatorId, item] of [...uniqueUnknown].slice(0, 20)) {
      console.log(`   ${indicatorId}: ${item.formula}`);
    }
    if (uniqueUnknown.size > 20) {
      console.log(`   ... et ${uniqueUnknown.size - 20} autres`);
    }
  }

  // Export JSON
  const outputPath = "./unsupported_formulas_report.json";
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.log(`\n💾 Rapport détaillé exporté vers: ${outputPath}`);

  // Recommandations
  console.log("\n" + "=".repeat(100));
  console.log("💡 RECOMMANDATIONS:");
  console.log("=".repeat(100));

  if (results.summary.notImplementable === 0) {
    console.log("\n✅ Toutes les formules sont implémentables avec l'architecture actuelle!");
  } else {
    console.log(`\n⚠️  ${results.summary.notImplementable} formules nécessitent une extension de l'architecture.`);
    console.log("\nOptions pour supporter les groupes imbriqués:");
    console.log("   1. Ajouter un champ 'groups' pour des conditions groupées:");
    console.log(`      display_condition: {
        operator: "AND",
        conditions: [...],
        groups: [
          { operator: "OR", conditions: [...] }
        ]
      }`);
    console.log("\n   2. Ou utiliser une structure récursive:");
    console.log(`      display_condition: {
        operator: "AND",
        items: [
          { type: "condition", ... },
          { type: "group", operator: "OR", items: [...] }
        ]
      }`);
  }
}

if (require.main === module) {
  (async () => {
    try {
      await main();
      process.exit(0);
    } catch (error) {
      console.error("\n❌ Échec du script:", error.message);
      process.exit(1);
    }
  })();
}

module.exports = { main, analyzeFormulaStructure, isImplementable };
