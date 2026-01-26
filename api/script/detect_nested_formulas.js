/**
 * Script de détection des formules imbriquées complexes dans la colonne K
 *
 * Détecte les patterns de type:
 * - =SI(K1100;SI(F1104="Non";1;0);0) où K1100 contient une autre condition
 * - Cela crée des conditions AND imbriquées: X AND (Y OR Y1)
 */

const { getAccessToken } = require("../src/services/microsoftGraph");

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

    const usedRangeResponse = await fetch(`https://graph.microsoft.com/v1.0/sites/${site.id}/drive/items/${fileId}/workbook/worksheets/${encodeURIComponent(worksheetName)}/usedRange`, { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } });

    if (!usedRangeResponse.ok) {
      const error = await usedRangeResponse.json();
      throw new Error(error.error?.message || "Cannot read worksheet used range");
    }

    return await usedRangeResponse.json();
  } catch (error) {
    console.error("Erreur lors de la récupération des données:", error);
    throw error;
  }
}

// Extrait le numéro de ligne d'une référence de cellule
function extractRowNumber(cellRef) {
  const match = cellRef.match(/\$?[A-Z]+\$?(\d+)/i);
  return match ? parseInt(match[1], 10) : null;
}

// Détecte si une formule est de type SI(Kxxx;SI(...);0) - condition imbriquée avec référence K
function detectNestedIfWithKReference(formula) {
  if (!formula || typeof formula !== "string") return null;

  const f = formula.trim();
  if (!f.startsWith("=")) return null;

  // Pattern: =SI(K123;SI(...);0) ou =IF(K123,IF(...),0)
  // Le premier argument est une référence à la colonne K
  const nestedIfPattern = /^=(?:SI|IF)\s*\(\s*\$?K\$?(\d+)\s*[;,]\s*(?:SI|IF)\s*\(/i;
  const match = f.match(nestedIfPattern);

  if (match) {
    return {
      type: "nested_if_with_k_reference",
      kRefRow: parseInt(match[1], 10),
      formula: f,
    };
  }

  return null;
}

// Détecte si une formule est de type SI(OU(...)) - condition OR
function detectOrCondition(formula) {
  if (!formula || typeof formula !== "string") return null;

  const f = formula.trim();
  if (!f.startsWith("=")) return null;

  // Pattern: =SI(OU(...);1;0) ou =IF(OR(...),1,0)
  const orPattern = /^=(?:SI|IF)\s*\(\s*(?:OU|OR)\s*\(/i;

  if (orPattern.test(f)) {
    return {
      type: "or_condition",
      formula: f,
    };
  }

  return null;
}

// Détecte si une formule est une référence simple à la colonne K
function detectSimpleKReference(formula) {
  if (!formula || typeof formula !== "string") return null;

  const f = formula.trim();
  if (!f.startsWith("=")) return null;

  // Pattern: =K123 (référence simple)
  const simpleRefPattern = /^=\$?K\$?(\d+)$/i;
  const match = f.match(simpleRefPattern);

  if (match) {
    return {
      type: "simple_k_reference",
      kRefRow: parseInt(match[1], 10),
      formula: f,
    };
  }

  return null;
}

// Analyse toutes les formules de la colonne K
function analyzeFormulas(formulaRows, startRow, dataRows) {
  const stats = {
    total: 0,
    nestedIfWithKRef: [], // SI(K...;SI(...);0)
    orConditions: [], // SI(OU(...))
    simpleKReferences: [], // =K123
    otherFormulas: [], // Autres formules
    noFormula: 0, // Cellules sans formule
  };

  // Map rowNum -> excel_indicator_id
  const rowToIndicatorMap = new Map();
  for (let i = 0; i < dataRows.length; i++) {
    const excelIndicatorId = dataRows[i][4];
    if (excelIndicatorId && excelIndicatorId !== "") {
      rowToIndicatorMap.set(startRow + 1 + i, String(excelIndicatorId).trim());
    }
  }

  // Map rowNum -> formula (pour résoudre les références)
  const rowToFormulaMap = new Map();
  for (let i = 0; i < formulaRows.length; i++) {
    const formula = formulaRows[i][10]; // Colonne K
    if (formula && String(formula).startsWith("=")) {
      rowToFormulaMap.set(startRow + 1 + i, String(formula));
    }
  }

  for (let i = 0; i < formulaRows.length; i++) {
    const formula = formulaRows[i][10]; // Colonne K (index 10)
    const rowNum = startRow + 1 + i;
    const indicatorId = rowToIndicatorMap.get(rowNum) || "N/A";

    if (!formula || !String(formula).startsWith("=")) {
      stats.noFormula++;
      continue;
    }

    stats.total++;
    const f = String(formula);

    // Détection des différents types
    const nestedIf = detectNestedIfWithKReference(f);
    if (nestedIf) {
      // Résoudre la formule référencée pour comprendre la structure complète
      const referencedFormula = rowToFormulaMap.get(nestedIf.kRefRow);
      const referencedIndicatorId = rowToIndicatorMap.get(nestedIf.kRefRow) || "N/A";

      stats.nestedIfWithKRef.push({
        rowNum,
        indicatorId,
        formula: f,
        kRefRow: nestedIf.kRefRow,
        referencedFormula: referencedFormula || "NOT_FOUND",
        referencedIndicatorId,
        // Vérifier si la formule référencée est un OR
        isAndWithOr: referencedFormula && detectOrCondition(referencedFormula) !== null,
      });
      continue;
    }

    const orCond = detectOrCondition(f);
    if (orCond) {
      stats.orConditions.push({
        rowNum,
        indicatorId,
        formula: f,
      });
      continue;
    }

    const simpleRef = detectSimpleKReference(f);
    if (simpleRef) {
      const referencedFormula = rowToFormulaMap.get(simpleRef.kRefRow);
      const referencedIndicatorId = rowToIndicatorMap.get(simpleRef.kRefRow) || "N/A";

      stats.simpleKReferences.push({
        rowNum,
        indicatorId,
        formula: f,
        kRefRow: simpleRef.kRefRow,
        referencedFormula: referencedFormula || "NOT_FOUND",
        referencedIndicatorId,
      });
      continue;
    }

    // Autres formules
    stats.otherFormulas.push({
      rowNum,
      indicatorId,
      formula: f,
    });
  }

  return stats;
}

// Fonction principale
async function main() {
  console.log("🔍 Analyse des formules imbriquées dans la colonne K\n");
  console.log("=".repeat(80));

  const globalStats = {
    totalFormulas: 0,
    totalNestedIfWithKRef: 0,
    totalAndWithOr: 0, // Les cas complexes: X AND (Y OR Y1)
    totalOrConditions: 0,
    totalSimpleKRefs: 0,
    allNestedIfWithKRef: [],
    allAndWithOr: [], // Les cas les plus complexes
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

      const stats = analyzeFormulas(formulaRows, startRow, dataRows);

      console.log(`\n📊 Statistiques:`);
      console.log(`   Total formules: ${stats.total}`);
      console.log(`   SI(K...;SI(...);0) - Imbriquées avec ref K: ${stats.nestedIfWithKRef.length}`);
      console.log(`   SI(OU(...)) - Conditions OR: ${stats.orConditions.length}`);
      console.log(`   =Kxxx - Références simples: ${stats.simpleKReferences.length}`);
      console.log(`   Autres formules: ${stats.otherFormulas.length}`);

      // Compter les cas AND avec OR (les plus complexes)
      const andWithOrCases = stats.nestedIfWithKRef.filter((item) => item.isAndWithOr);
      console.log(`\n   ⚠️  CAS COMPLEXES (X AND (Y OR Y1)): ${andWithOrCases.length}`);

      globalStats.totalFormulas += stats.total;
      globalStats.totalNestedIfWithKRef += stats.nestedIfWithKRef.length;
      globalStats.totalAndWithOr += andWithOrCases.length;
      globalStats.totalOrConditions += stats.orConditions.length;
      globalStats.totalSimpleKRefs += stats.simpleKReferences.length;

      // Ajouter à la liste globale avec la situation
      for (const item of stats.nestedIfWithKRef) {
        globalStats.allNestedIfWithKRef.push({ ...item, situation });
      }
      for (const item of andWithOrCases) {
        globalStats.allAndWithOr.push({ ...item, situation });
      }

      // Afficher quelques exemples des cas imbriqués
      if (stats.nestedIfWithKRef.length > 0) {
        console.log(`\n   📋 Exemples de formules SI(K...;SI(...);0):`);
        const examples = stats.nestedIfWithKRef.slice(0, 5);
        for (const ex of examples) {
          console.log(`\n   Ligne ${ex.rowNum} (${ex.indicatorId}):`);
          console.log(`      Formule: ${ex.formula}`);
          console.log(`      Référence K${ex.kRefRow}: ${ex.referencedFormula}`);
          if (ex.isAndWithOr) {
            console.log(`      ⚠️  COMPLEXE: Structure X AND (Y OR Y1)`);
          }
        }
      }
    } catch (error) {
      console.error(`❌ Erreur: ${error.message}`);
    }
  }

  // Résumé global
  console.log("\n" + "=".repeat(80));
  console.log("📊 RÉSUMÉ GLOBAL");
  console.log("=".repeat(80));
  console.log(`\nTotal formules analysées: ${globalStats.totalFormulas}`);
  console.log(`\nTypes de formules:`);
  console.log(`   SI(K...;SI(...);0) - Imbriquées avec ref K: ${globalStats.totalNestedIfWithKRef}`);
  console.log(`   SI(OU(...)) - Conditions OR: ${globalStats.totalOrConditions}`);
  console.log(`   =Kxxx - Références simples: ${globalStats.totalSimpleKRefs}`);

  console.log(`\n⚠️  CAS COMPLEXES À TRAITER (X AND (Y OR Y1)): ${globalStats.totalAndWithOr}`);
  console.log(`   Pourcentage: ${((globalStats.totalAndWithOr / globalStats.totalFormulas) * 100).toFixed(2)}%`);

  // Afficher tous les cas complexes
  if (globalStats.allAndWithOr.length > 0) {
    console.log(`\n📋 LISTE COMPLÈTE DES CAS COMPLEXES:`);
    console.log("-".repeat(80));

    for (const item of globalStats.allAndWithOr) {
      console.log(`\n[${item.situation.toUpperCase()}] Ligne ${item.rowNum} - ${item.indicatorId}`);
      console.log(`   Formule principale: ${item.formula}`);
      console.log(`   Formule référencée (K${item.kRefRow}): ${item.referencedFormula}`);
    }
  }

  // Export en JSON pour analyse plus poussée
  const outputPath = "./nested_formulas_report.json";
  const fs = require("fs");
  fs.writeFileSync(
    outputPath,
    JSON.stringify(
      {
        summary: {
          totalFormulas: globalStats.totalFormulas,
          nestedIfWithKRef: globalStats.totalNestedIfWithKRef,
          andWithOrCases: globalStats.totalAndWithOr,
          orConditions: globalStats.totalOrConditions,
          simpleKRefs: globalStats.totalSimpleKRefs,
        },
        complexCases: globalStats.allAndWithOr,
        allNestedIfWithKRef: globalStats.allNestedIfWithKRef,
      },
      null,
      2
    )
  );
  console.log(`\n💾 Rapport détaillé exporté vers: ${outputPath}`);
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

module.exports = { main, analyzeFormulas };
