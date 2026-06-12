require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
const { graphFetch, duplicateExcelFile } = require("../src/services/microsoftGraph");
const Indicator = require("../src/models/indicator");
const IndicatorValue = require("../src/models/indicator_value");
const IndicatorCategory = require("../src/models/indicator_category");
const Action = require("../src/models/action");
const Collectivity = require("../src/models/collectivity");
const Log = require("../src/models/log");
const mongoose = require("mongoose");
const config = require("../src/config");

const sharePointSiteName = "selegobv";
const masterFileId = "01IBL4ADJHP7ORRNDOMREZVCQPBE4I2QZZ"; // ID du fichier master Excel

function formatLogValue(value) {
  if (value === null || value === undefined) return null;

  if (Array.isArray(value)) return { array: value };
  if (typeof value === "number") return { number: value };
  if (typeof value === "boolean") return { boolean: value };
  if (value instanceof Date) return { date: value };
  if (typeof value === "object") return { string: JSON.stringify(value) };
  return { string: String(value) };
}

// Fonction pour déterminer le type de valeur
function getValueType(value) {
  if (value === null || value === undefined) return "undefined";
  if (Array.isArray(value)) return "array";
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  if (value instanceof Date) return "date";
  if (typeof value === "object") return "object";
  return "string";
}

function normalizeEmptyValue(value) {
  if (value === null || value === undefined || value === "") return null;
  if (Array.isArray(value) && value.length === 0) return null;
  return value;
}

function areValuesEqual(oldValue, newValue) {
  const normalizedOld = normalizeEmptyValue(oldValue);
  const normalizedNew = normalizeEmptyValue(newValue);
  if (normalizedOld === null && normalizedNew === null) return true;
  return JSON.stringify(normalizedOld) === JSON.stringify(normalizedNew);
}

function extractRowNumber(cellRef) {
  const match = cellRef.match(/\$?[A-Z]+\$?(\d+)/i);
  return match ? parseInt(match[1], 10) : null;
}

// Extrait la situation depuis le nom de la feuille
function extractSituationFromSheetName(sheetName) {
  if (!sheetName) return null;
  const lower = sheetName.toLowerCase();
  if (lower.includes("init")) return "init";
  if (lower.includes("ref")) return "ref";
  if (lower.includes("prev")) return "prev";
  if (lower.includes("expost")) return "expost";
  return null;
}

// Extrait chaque bloc IF(...) d'une formule en équilibrant les parenthèses.
// Ex: "K1632 * IF(F1632=B1632,0,1) * IF(F1632=\"\",0,1)" → ["IF(F1632=B1632,0,1)", "IF(F1632=\"\",0,1)"]
function extractIfFactors(content) {
  const factors = [];
  const re = /IF\s*\(/gi;
  let m;
  while ((m = re.exec(content)) !== null) {
    let depth = 0;
    let i = m.index;
    for (; i < content.length; i++) {
      if (content[i] === "(") depth++;
      if (content[i] === ")") {
        depth--;
        if (depth === 0) break;
      }
    }
    factors.push(content.substring(m.index, i + 1));
    re.lastIndex = i + 1;
  }
  return factors;
}

// Applique fn à chaque feuille d'un arbre de conditions, en préservant la structure des groupes (OR/AND imbriqués).
// Indispensable depuis l'introduction des groupes : appliquer une transfo (situation, negate) via un .map() plat
// la poserait sur le noeud-groupe (ignoré à l'évaluation) au lieu des feuilles.
function mapConditionLeaves(conditions, fn) {
  return conditions.map((cond) => {
    if (Array.isArray(cond.conditions) && cond.conditions.length) return { ...cond, conditions: mapConditionLeaves(cond.conditions, fn) };
    return fn(cond);
  });
}

// Parse une formule de référence simple pour les valeurs possibles dynamiques.
// Exemples acceptés :
//   ='Remplissage - Sit. Init.'!$F$1593  → { excel_indicator_id, situation: 'init' }
//   =$F$1593                              → { excel_indicator_id, situation: <currentSituation> }
// Retourne null si la formule n'est pas une simple référence cellule.
function parsePossibilitiesFormula(formula, currentSituation, rowToIndicatorMap, allRowToIndicatorMaps) {
  if (!formula || typeof formula !== "string") return null;
  const f = formula.trim();
  if (!f.startsWith("=")) return null;
  const content = f.substring(1).trim();

  const sheetRefMatch = content.match(/^['']([^'']+)['']!\$?[A-Z]+\$?(\d+)$/i);
  if (sheetRefMatch) {
    const sourceSituation = extractSituationFromSheetName(sheetRefMatch[1]);
    if (!sourceSituation) return null;
    const targetMap = allRowToIndicatorMaps?.get(sourceSituation);
    if (!targetMap) return null;
    const excelIndicatorId = targetMap.get(parseInt(sheetRefMatch[2], 10));
    if (!excelIndicatorId) return null;
    return { excel_indicator_id: excelIndicatorId, situation: sourceSituation };
  }

  const sameSheetMatch = content.match(/^\$?[A-Z]+\$?(\d+)$/i);
  if (sameSheetMatch) {
    const excelIndicatorId = rowToIndicatorMap.get(parseInt(sameSheetMatch[1], 10));
    if (!excelIndicatorId) return null;
    return { excel_indicator_id: excelIndicatorId, situation: currentSituation };
  }

  return null;
}

function parseExcelFormula(formula, rowToIndicatorMap, getCellValue = null, allRowToIndicatorMaps = null) {
  if (!formula || typeof formula !== "string") return null;

  const f = formula.trim();
  if (!f.startsWith("=")) return null;

  const formulaContent = f.substring(1).trim();

  // CAS 0: Constante numérique. =1 (ou tout non-zéro) → toujours affiché. =0 → jamais affiché.
  if (/^-?\d+(?:\.\d+)?$/.test(formulaContent)) {
    if (parseFloat(formulaContent) === 0) return { _neverVisible: true };
    return { _alwaysVisible: true };
  }

  // Helper pour récupérer le bon rowToIndicatorMap selon la situation
  const getRowToIndicatorMapForSituation = (sheetName) => {
    if (!sheetName || !allRowToIndicatorMaps) return rowToIndicatorMap;
    const situation = extractSituationFromSheetName(sheetName);
    if (situation && allRowToIndicatorMaps.has(situation)) return allRowToIndicatorMaps.get(situation);
    return rowToIndicatorMap;
  };

  // Parse un facteur IF(...) unique en une condition. Renvoie null si non reconnu.
  // negate = true si la branche "vrai" vaut 0 (ex: IF(cond,0,1) → afficher quand cond est FAUX).
  const parseIfFactor = (ifText) => {
    const branchMatch = ifText.match(/,\s*([01])\s*,\s*[01]\s*\)\s*$/);
    const negate = branchMatch ? branchMatch[1] === "0" : false;

    // contains: ISNUMBER(SEARCH("lit", 'Feuille'!$F$xxx)) (préfixe feuille optionnel)
    const containsLit = ifText.match(/SEARCH\s*\(\s*"([^"]+)"\s*,\s*(?:['']([^'']+)['']!)?\$?([A-Z]+)\$?(\d+)/i);
    if (containsLit) {
      const id = getRowToIndicatorMapForSituation(containsLit[2]).get(parseInt(containsLit[4], 10));
      if (!id) return null;
      const c = { type: "contains", excel_indicator_id: id, value: containsLit[1] };
      const sit = extractSituationFromSheetName(containsLit[2]);
      if (sit) c.excel_indicator_situation = sit;
      if (negate) c.negate = true;
      return c;
    }

    // vide: $F$xxx = "" → notEmpty (branche vrai=0) ou isEmpty (branche vrai=1)
    const emptyMatch = ifText.match(/\$?([A-Z]+)\$?(\d+)\s*=\s*""/);
    if (emptyMatch) {
      const id = rowToIndicatorMap.get(parseInt(emptyMatch[2], 10));
      if (!id) return null;
      return { type: negate ? "notEmpty" : "isEmpty", excel_indicator_id: id, value: null };
    }

    // égalité littérale: $F$xxx = "literal"
    const eqLit = ifText.match(/\$?([A-Z]+)\$?(\d+)\s*=\s*"([^"]+)"/);
    if (eqLit) {
      const id = rowToIndicatorMap.get(parseInt(eqLit[2], 10));
      if (!id) return null;
      const c = { type: "equals", excel_indicator_id: id, value: eqLit[3] };
      if (negate) c.negate = true;
      return c;
    }

    // égalité entre deux cellules: $F$xxx = $B$yyy → on lit la valeur littérale de la 2e cellule
    const eqCell = ifText.match(/\$?([A-Z]+)\$?(\d+)\s*=\s*\$?([A-Z]+)\$?(\d+)/);
    if (eqCell && getCellValue) {
      const id = rowToIndicatorMap.get(parseInt(eqCell[2], 10));
      const cmpValue = getCellValue(parseInt(eqCell[4], 10), eqCell[3]);
      if (!id || cmpValue === null || cmpValue === undefined || cmpValue === "") return null;
      const c = { type: "equals", excel_indicator_id: id, value: String(cmpValue).trim() };
      if (negate) c.negate = true;
      return c;
    }

    // comparaison numérique: $F$xxx >/>=/</<= n
    const numMatch = ifText.match(/\$?([A-Z]+)\$?(\d+)\s*(>=|<=|>|<)\s*(-?\d+(?:\.\d+)?)/);
    if (numMatch) {
      const id = rowToIndicatorMap.get(parseInt(numMatch[2], 10));
      if (!id) return null;
      const typeMap = { ">": "greaterThan", "<": "lessThan", ">=": "greaterOrEqual", "<=": "lessOrEqual" };
      const c = { type: typeMap[numMatch[3]], excel_indicator_id: id, value: parseFloat(numMatch[4]) };
      if (negate) c.negate = true;
      return c;
    }

    return null;
  };

  // CAS 1: Référence simple (=K478)
  if (/^\$?[A-Z]+\$?\d+$/i.test(formulaContent)) {
    return { _reference: formulaContent };
  }

  // CAS 1b: Référence avec préfixe de feuille (='Feuille'!K478)
  // On extrait la situation source et le numéro de ligne pour résoudre la condition
  const sheetRefMatch = formulaContent.match(/^['']([^'']+)['']!\$?([A-Z]+)\$?(\d+)$/i);
  if (sheetRefMatch) {
    const sheetName = sheetRefMatch[1];
    const sourceSituation = extractSituationFromSheetName(sheetName);
    const refRowNum = parseInt(sheetRefMatch[3], 10);
    return { _interSheetReference: true, refRowNum, excel_indicator_situation: sourceSituation };
  }

  // CAS 2: IF(OR(...)) - OR
  if (/IF\s*\(\s*OR\s*\(/i.test(formulaContent)) {
    const conditions = [];
    // Accepte les références avec ou sans préfixe de feuille: $F$18 ou 'Feuille'!$F$18
    const regex = /SEARCH\s*\(\s*"([^"]+)"\s*,\s*(?:['']([^'']+)['']!)?\$?([A-Z]+)\$?(\d+)/gi;
    let match;

    while ((match = regex.exec(formulaContent)) !== null) {
      const sheetName = match[2];
      const sourceSituation = extractSituationFromSheetName(sheetName);
      // Utiliser le rowToIndicatorMap de la feuille référencée si inter-feuille
      const targetMap = getRowToIndicatorMapForSituation(sheetName);
      const sourceIndicatorId = targetMap.get(parseInt(match[4], 10));
      if (sourceIndicatorId) {
        const condition = { type: "contains", excel_indicator_id: sourceIndicatorId, value: match[1] };
        if (sourceSituation) condition.excel_indicator_situation = sourceSituation;
        conditions.push(condition);
      }
    }

    if (conditions.length > 0) {
      return { operator: conditions.length > 1 ? "OR" : undefined, conditions };
    }
    return null;
  }

  // CAS 3: référence de tête * un ou plusieurs IF(...) - AND
  // Ex: =K477 * IF(ISNUMBER(SEARCH("Diesel",$F$1089)),1,0)
  // Ex: =K1632 * IF(F1632=B1632,0,1) * IF(F1632="",0,1)  → miroir de K1632 ET valeur ≠ B1632 ET valeur non vide
  if (/^\$?[A-Z]+\$?\d+\s*\*\s*IF\s*\(/i.test(formulaContent)) {
    const refMatch = formulaContent.match(/^(\$?[A-Z]+\$?\d+)\s*\*/i);
    const conditions = extractIfFactors(formulaContent).map(parseIfFactor).filter(Boolean);
    if (conditions.length === 0) return null;
    if (refMatch) return { _referenceToMerge: refMatch[1], conditions };
    return { conditions };
  }

  // CAS 4: IF(...) * IF(...) ou (IF(...))*(IF(...)) - AND entre plusieurs conditions
  // Ex: =IF($F$16="Oui",1,0)*IF(ISNUMBER(SEARCH("Diesel",$F$1089)),1,0)
  // Ex: =(IF(ISNUMBER(SEARCH("C4",$F$18)),1,0))*(IF($F$1838="...",1,0))
  // Accepte aussi les parenthèses supplémentaires et ignore les #REF!
  // Détection améliorée : présence de * entre des blocs IF (gère les parenthèses imbriquées)
  if (/\)\s*\*\s*\(?IF\s*\(/i.test(formulaContent) || /IF\s*\(.*\)\s*\*\s*\(?IF\s*\(/i.test(formulaContent)) {
    const conditions = [];

    // Chercher toutes les conditions "equals": IF($F$16="Oui",1,0)
    const equalsRegex = /IF\s*\(\s*\$?([A-Z]+)\$?(\d+)\s*=\s*"([^"]+)"/gi;
    let equalsMatch;
    while ((equalsMatch = equalsRegex.exec(formulaContent)) !== null) {
      const sourceIndicatorId = rowToIndicatorMap.get(parseInt(equalsMatch[2], 10));
      if (sourceIndicatorId) {
        conditions.push({ type: "equals", excel_indicator_id: sourceIndicatorId, value: equalsMatch[3] });
      }
    }

    // Chercher toutes les conditions "contains": IF(ISNUMBER(SEARCH("texte",$F$1089)),1,0)
    // Accepte les références inter-feuilles et ignore celles avec #REF!
    const containsRegex = /SEARCH\s*\(\s*(?:'[^']+'!)?\$?([A-Z]+)\$?(\d+)\s*,\s*(?:'[^']+'!)?\$?([A-Z]+)\$?(\d+)/gi;
    let containsMatch;
    while ((containsMatch = containsRegex.exec(formulaContent)) !== null) {
      // Lire la valeur de la première cellule (ex: F127) pour obtenir la valeur à chercher
      const valueRow = parseInt(containsMatch[2], 10);
      const valueColumn = containsMatch[1];
      const sourceRow = parseInt(containsMatch[4], 10);
      const sourceIndicatorId = rowToIndicatorMap.get(sourceRow);

      if (sourceIndicatorId && getCellValue) {
        const searchValue = getCellValue(valueRow, valueColumn);
        if (searchValue) {
          conditions.push({ type: "contains", excel_indicator_id: sourceIndicatorId, value: String(searchValue).trim() });
        }
      }
    }

    // Chercher aussi les SEARCH avec chaîne littérale: SEARCH("texte", $F$1089)
    // Mais ignorer ceux avec #REF!
    const containsLiteralRegex = /SEARCH\s*\(\s*"([^"]+)"\s*,\s*(?!'[^']+'!#REF)(?:'[^']+'!)?\$?([A-Z]+)\$?(\d+)/gi;
    let containsLiteralMatch;
    while ((containsLiteralMatch = containsLiteralRegex.exec(formulaContent)) !== null) {
      const sourceIndicatorId = rowToIndicatorMap.get(parseInt(containsLiteralMatch[3], 10));
      if (sourceIndicatorId) {
        conditions.push({ type: "contains", excel_indicator_id: sourceIndicatorId, value: containsLiteralMatch[1] });
      }
    }

    if (conditions.length > 1) {
      return { operator: "AND", conditions };
    } else if (conditions.length === 1) {
      return { conditions };
    }
    return null;
  }

  // CAS 4b: =IFERROR(SEARCH(B1594, $F$1593), 0) [* $K$1593] - contains avec label de cellule, parent ref optionnel
  // Variante française: =SIERREUR(CHERCHE(B1594; $F$1593); 0) [* $K$1593]
  const iferrorSearchMatch = formulaContent.match(/(?:IFERROR|SIERREUR)\s*\(\s*(?:SEARCH|CHERCHE)\s*\(\s*\$?([A-Z]+)\$?(\d+)\s*[,;]\s*(?:'([^']+)'!)?\$?([A-Z]+)\$?(\d+)\s*\)\s*[,;]\s*0\s*\)(?:\s*\*\s*\$?([A-Z]+)\$?(\d+))?/i);
  if (iferrorSearchMatch && getCellValue) {
    const labelColumn = iferrorSearchMatch[1];
    const labelRow = parseInt(iferrorSearchMatch[2], 10);
    const sourceSheet = iferrorSearchMatch[3];
    const sourceRow = parseInt(iferrorSearchMatch[5], 10);
    const parentColumn = iferrorSearchMatch[6];
    const parentRow = iferrorSearchMatch[7];

    const sourceSituation = extractSituationFromSheetName(sourceSheet);
    const targetMap = sourceSheet ? getRowToIndicatorMapForSituation(sourceSheet) : rowToIndicatorMap;
    const sourceIndicatorId = targetMap.get(sourceRow);

    if (sourceIndicatorId) {
      const labelValue = getCellValue(labelRow, labelColumn);
      if (labelValue !== null && labelValue !== undefined && labelValue !== "") {
        const condition = { type: "contains", excel_indicator_id: sourceIndicatorId, value: String(labelValue).trim() };
        if (sourceSituation) condition.excel_indicator_situation = sourceSituation;
        if (parentColumn && parentRow) return { _referenceToMerge: `${parentColumn}${parentRow}`, conditions: [condition] };
        return { conditions: [condition] };
      }
    }
    return null;
  }

  // CAS 5: IF(ISNUMBER(SEARCH...)) - contains simple
  if (/IF\s*\(\s*ISNUMBER\s*\(\s*SEARCH/i.test(formulaContent)) {
    // D'abord essayer avec une chaîne littérale: SEARCH("texte", $F$123) ou SEARCH("texte", 'Feuille'!$F$123)
    const literalMatch = formulaContent.match(/SEARCH\s*\(\s*"([^"]+)"\s*,\s*(?:['']([^'']+)['']!)?\$?([A-Z]+)\$?(\d+)/i);
    if (literalMatch) {
      const sheetName = literalMatch[2];
      const sourceSituation = extractSituationFromSheetName(sheetName);
      // Utiliser le rowToIndicatorMap de la feuille référencée si inter-feuille
      const targetMap = getRowToIndicatorMapForSituation(sheetName);
      const sourceIndicatorId = targetMap.get(parseInt(literalMatch[4], 10));
      if (sourceIndicatorId) {
        const condition = { type: "contains", excel_indicator_id: sourceIndicatorId, value: literalMatch[1] };
        if (sourceSituation) condition.excel_indicator_situation = sourceSituation;
        return { conditions: [condition] };
      }
    }

    // Sinon essayer avec une référence de cellule: SEARCH($B123, $F$456) ou SEARCH(B123, $F$456)
    // Ou avec référence inter-feuilles: SEARCH('Feuille'!$F$127, $F$456) ou SEARCH('Feuille'!$F$127, 'Feuille'!$F$456)
    const cellRefMatch = formulaContent.match(/SEARCH\s*\(\s*(?:['']([^'']+)['']!)?\$?([A-Z]+)\$?(\d+)\s*,\s*(?:['']([^'']+)['']!)?\$?([A-Z]+)\$?(\d+)/i);
    if (cellRefMatch && getCellValue) {
      const valueColumn = cellRefMatch[2];
      const valueRow = parseInt(cellRefMatch[3], 10);
      const targetSheetName = cellRefMatch[4];
      const sourceSituation = extractSituationFromSheetName(targetSheetName);
      // Utiliser le rowToIndicatorMap de la feuille référencée si inter-feuille
      const targetMap = getRowToIndicatorMapForSituation(targetSheetName);
      const sourceIndicatorId = targetMap.get(parseInt(cellRefMatch[6], 10));

      if (sourceIndicatorId) {
        // Lire la valeur directement depuis la cellule
        const searchValue = getCellValue(valueRow, valueColumn);
        if (searchValue !== null && searchValue !== undefined && searchValue !== "") {
          const condition = {
            type: "contains",
            excel_indicator_id: sourceIndicatorId,
            value: String(searchValue).trim(),
          };
          if (sourceSituation) condition.excel_indicator_situation = sourceSituation;
          return { conditions: [condition] };
        }
      }
    }
    return null;
  }

  // CAS 6: IF($F$15="Oui",1,0) - equals simple (chaîne)
  const equalsMatch = formulaContent.match(/IF\s*\(\s*\$?([A-Z]+)\$?(\d+)\s*=\s*"([^"]+)"/i);
  if (equalsMatch) {
    const sourceIndicatorId = rowToIndicatorMap.get(parseInt(equalsMatch[2], 10));
    if (sourceIndicatorId) {
      return { conditions: [{ type: "equals", excel_indicator_id: sourceIndicatorId, value: equalsMatch[3] }] };
    }
    return null;
  }

  // CAS 7: IF($F$9>1,1,0), IF($F$9>=1,1,0), IF($F$9<1,1,0), IF($F$9<=1,1,0) - comparaisons numériques
  const numericCompareMatch = formulaContent.match(/IF\s*\(\s*\$?([A-Z]+)\$?(\d+)\s*(>=|<=|>|<)\s*(-?\d+(?:\.\d+)?)/i);
  if (numericCompareMatch) {
    const sourceIndicatorId = rowToIndicatorMap.get(parseInt(numericCompareMatch[2], 10));
    if (sourceIndicatorId) {
      const operator = numericCompareMatch[3];
      const value = parseFloat(numericCompareMatch[4]);
      const typeMap = { ">": "greaterThan", "<": "lessThan", ">=": "greaterOrEqual", "<=": "lessOrEqual" };
      return { conditions: [{ type: typeMap[operator], excel_indicator_id: sourceIndicatorId, value }] };
    }
    return null;
  }

  // CAS 8: IF(ISBLANK($F$1113),0,1) - notEmpty (afficher si la cellule n'est pas vide)
  const isBlankMatch = formulaContent.match(/IF\s*\(\s*ISBLANK\s*\(\s*\$?([A-Z]+)\$?(\d+)\s*\)\s*,\s*0\s*,\s*1\s*\)/i);
  if (isBlankMatch) {
    const sourceIndicatorId = rowToIndicatorMap.get(parseInt(isBlankMatch[2], 10));
    if (sourceIndicatorId) {
      return { conditions: [{ type: "notEmpty", excel_indicator_id: sourceIndicatorId, value: null }] };
    }
    return null;
  }

  // CAS 9: IF(ISBLANK($F$1113),1,0) - isEmpty (afficher si la cellule est vide)
  const isBlankReverseMatch = formulaContent.match(/IF\s*\(\s*ISBLANK\s*\(\s*\$?([A-Z]+)\$?(\d+)\s*\)\s*,\s*1\s*,\s*0\s*\)/i);
  if (isBlankReverseMatch) {
    const sourceIndicatorId = rowToIndicatorMap.get(parseInt(isBlankReverseMatch[2], 10));
    if (sourceIndicatorId) {
      return { conditions: [{ type: "isEmpty", excel_indicator_id: sourceIndicatorId, value: null }] };
    }
    return null;
  }

  // CAS 10: =N(AND(NOT(K1605), K1603)) - AND avec références et négation
  const andNotMatch = formulaContent.match(/N\s*\(\s*AND\s*\(\s*NOT\s*\(\s*\$?([A-Z]+)\$?(\d+)\s*\)\s*,\s*\$?([A-Z]+)\$?(\d+)\s*\)\s*\)/i);
  if (andNotMatch) {
    const negatedRefRow = parseInt(andNotMatch[2], 10);
    const normalRefRow = parseInt(andNotMatch[4], 10);
    return {
      _andNotReferences: [
        { rowNum: normalRefRow, negate: false },
        { rowNum: negatedRefRow, negate: true },
      ],
    };
  }

  // CAS 10b: =N(AND(K1603, NOT(K1605))) - AND avec références et négation (ordre inversé)
  const andNotReverseMatch = formulaContent.match(/N\s*\(\s*AND\s*\(\s*\$?([A-Z]+)\$?(\d+)\s*,\s*NOT\s*\(\s*\$?([A-Z]+)\$?(\d+)\s*\)\s*\)\s*\)/i);
  if (andNotReverseMatch) {
    const normalRefRow = parseInt(andNotReverseMatch[2], 10);
    const negatedRefRow = parseInt(andNotReverseMatch[4], 10);
    return {
      _andNotReferences: [
        { rowNum: normalRefRow, negate: false },
        { rowNum: negatedRefRow, negate: true },
      ],
    };
  }

  // CAS 11: =N(AND(F1603="...", K1599)) - AND entre égalité de chaîne et référence
  const andEqualsRefMatch = formulaContent.match(/N\s*\(\s*AND\s*\(\s*\$?([A-Z]+)\$?(\d+)\s*=\s*"([^"]+)"\s*,\s*\$?([A-Z]+)\$?(\d+)\s*\)\s*\)/i);
  if (andEqualsRefMatch) {
    const equalsRow = parseInt(andEqualsRefMatch[2], 10);
    const equalsValue = andEqualsRefMatch[3];
    const refRow = parseInt(andEqualsRefMatch[5], 10);
    const sourceIndicatorId = rowToIndicatorMap.get(equalsRow);

    if (sourceIndicatorId) {
      return {
        _andEqualsRef: {
          equalsCondition: { type: "equals", excel_indicator_id: sourceIndicatorId, value: equalsValue },
          refRowNum: refRow,
        },
      };
    }
  }

  // CAS 11b: =N(AND(K1599, F1603="...")) - AND entre référence et égalité de chaîne (ordre inversé)
  const andRefEqualsMatch = formulaContent.match(/N\s*\(\s*AND\s*\(\s*\$?([A-Z]+)\$?(\d+)\s*,\s*\$?([A-Z]+)\$?(\d+)\s*=\s*"([^"]+)"\s*\)\s*\)/i);
  if (andRefEqualsMatch) {
    const refRow = parseInt(andRefEqualsMatch[2], 10);
    const equalsRow = parseInt(andRefEqualsMatch[4], 10);
    const equalsValue = andRefEqualsMatch[5];
    const sourceIndicatorId = rowToIndicatorMap.get(equalsRow);

    if (sourceIndicatorId) {
      return {
        _andEqualsRef: {
          equalsCondition: { type: "equals", excel_indicator_id: sourceIndicatorId, value: equalsValue },
          refRowNum: refRow,
        },
      };
    }
  }

  // CAS 12: =N(NOT(VLOOKUP("Prefix" & Q1599 & "Suffix", 'Sheet'!Range, ...) > 0)) - VLOOKUP avec clé dynamique et référence inter-feuilles
  // Cherche un indicateur par ID construit dynamiquement et vérifie si sa valeur > 0 (avec NOT)
  const vlookupNotMatch = formulaContent.match(/N\s*\(\s*NOT\s*\(\s*VLOOKUP\s*\(\s*"([^"]+)"\s*&\s*\$?([A-Z]+)\$?(\d+)\s*&\s*"([^"]+)"\s*[,;]\s*(?:['']([^'']+)['']!)?\$?[A-Z]+\$?\d+/i);
  if (vlookupNotMatch && getCellValue) {
    const prefix = vlookupNotMatch[1];
    const cellColumn = vlookupNotMatch[2];
    const cellRow = parseInt(vlookupNotMatch[3], 10);
    const suffix = vlookupNotMatch[4];
    const sheetName = vlookupNotMatch[5]; // Nom de la feuille référencée (optionnel)
    const sourceSituation = extractSituationFromSheetName(sheetName);

    // Lire la valeur de la cellule (ex: Q1599)
    const cellValue = getCellValue(cellRow, cellColumn);
    if (cellValue !== null && cellValue !== undefined) {
      // Construire l'ID de l'indicateur: "FretFluvCat" + "56" + "NbBarges" = "FretFluvCat56NbBarges"
      const indicatorId = `${prefix}${cellValue}${suffix}`;
      // NOT(... > 0) signifie <= 0, donc greaterThan avec negate: true
      const condition = { type: "greaterThan", excel_indicator_id: indicatorId, value: 0, negate: true };
      if (sourceSituation) condition.excel_indicator_situation = sourceSituation;
      return { conditions: [condition] };
    }
  }

  // CAS 12b: =N(VLOOKUP("Prefix" & Q1599 & "Suffix", 'Sheet'!Range, ...) > 0) - VLOOKUP sans NOT avec référence inter-feuilles
  const vlookupMatch = formulaContent.match(/N\s*\(\s*VLOOKUP\s*\(\s*"([^"]+)"\s*&\s*\$?([A-Z]+)\$?(\d+)\s*&\s*"([^"]+)"\s*[,;]\s*(?:['']([^'']+)['']!)?\$?[A-Z]+\$?\d+[^)]*\)\s*>\s*(\d+)/i);
  if (vlookupMatch && getCellValue) {
    const prefix = vlookupMatch[1];
    const cellColumn = vlookupMatch[2];
    const cellRow = parseInt(vlookupMatch[3], 10);
    const suffix = vlookupMatch[4];
    const sheetName = vlookupMatch[5]; // Nom de la feuille référencée (optionnel)
    const sourceSituation = extractSituationFromSheetName(sheetName);
    const compareValue = parseFloat(vlookupMatch[6]);

    const cellValue = getCellValue(cellRow, cellColumn);
    if (cellValue !== null && cellValue !== undefined) {
      const indicatorId = `${prefix}${cellValue}${suffix}`;
      const condition = { type: "greaterThan", excel_indicator_id: indicatorId, value: compareValue };
      if (sourceSituation) condition.excel_indicator_situation = sourceSituation;
      return { conditions: [condition] };
    }
  }

  // CAS 13: =VLOOKUP("Prefix" & P1124+1, 'Sit. Init.'!$E$1594:$K$1728, 7, FALSE)
  // Référence dynamique vers la condition d'affichage (colonne K) d'un autre indicateur,
  // dont l'excel_indicator_id = "Prefix" + (valeur de la cellule + 1). On recopiera sa condition (miroir).
  const vlookupRefMatch = formulaContent.match(/^VLOOKUP\s*\(\s*"([^"]+)"\s*&\s*\$?([A-Z]+)\$?(\d+)\s*\+\s*1\s*[,;]\s*(?:['']([^'']+)['']!)?\$?[A-Z]+\$?\d+\s*:\s*\$?[A-Z]+\$?\d+\s*[,;]\s*\d+\s*[,;]\s*FALSE\s*\)$/i);
  if (vlookupRefMatch && getCellValue) {
    const prefix = vlookupRefMatch[1];
    const index = Number(getCellValue(parseInt(vlookupRefMatch[3], 10), vlookupRefMatch[2]));
    if (!isNaN(index)) {
      const sourceSituation = extractSituationFromSheetName(vlookupRefMatch[4]);
      return { _indicatorRefByName: { excel_indicator_id: `${prefix}${index + 1}`, situation: sourceSituation } };
    }
  }

  return null;
}

function resolveAllFormulas(formulasMap, rowToIndicatorMap, getCellValue = null, allSheetsData = null, allRowToIndicatorMaps = null, allFormulasMapsBySituation = null) {
  const resolvedConditions = new Map();
  const parseCache = new Map();

  // Cache des conditions résolues par situation (pour les références inter-feuilles)
  const resolvedBySituation = new Map();

  // Cache des maps inverses excel_indicator_id → ligne, par situation (pour les VLOOKUP par nom)
  const inverseIndicatorMaps = new Map();
  const getRowForIndicatorId = (indicatorId, situation) => {
    if (!inverseIndicatorMaps.has(situation)) {
      const inverse = new Map();
      const map = allRowToIndicatorMaps?.get(situation);
      if (map) for (const [r, id] of map) inverse.set(id, r);
      inverseIndicatorMaps.set(situation, inverse);
    }
    return inverseIndicatorMaps.get(situation).get(indicatorId) || null;
  };

  for (const [rowNum, formula] of formulasMap) {
    parseCache.set(rowNum, parseExcelFormula(formula, rowToIndicatorMap, getCellValue, allRowToIndicatorMaps));
  }

  // Fonction pour résoudre une condition dans une feuille spécifique
  function resolveConditionInSheet(rowNum, targetSituation, visited = new Set()) {
    const visitKey = `${targetSituation}:${rowNum}`;
    if (visited.has(visitKey)) return null;
    visited.add(visitKey);

    // Vérifier le cache par situation
    if (!resolvedBySituation.has(targetSituation)) {
      resolvedBySituation.set(targetSituation, new Map());
    }
    const situationCache = resolvedBySituation.get(targetSituation);
    if (situationCache.has(rowNum)) return situationCache.get(rowNum);

    // Récupérer les données de la feuille cible
    const targetFormulasMap = allFormulasMapsBySituation?.get(targetSituation);
    const targetRowToIndicatorMap = allRowToIndicatorMaps?.get(targetSituation);
    const targetSheetData = allSheetsData?.get(targetSituation);

    if (!targetFormulasMap || !targetRowToIndicatorMap || !targetSheetData) {
      situationCache.set(rowNum, null);
      return null;
    }

    // Parser la formule de la feuille cible
    const formula = targetFormulasMap.get(rowNum);
    if (!formula) {
      situationCache.set(rowNum, null);
      return null;
    }

    // Créer getCellValue pour la feuille cible
    const columnToIndex = { A: 0, B: 1, C: 2, D: 3, E: 4, F: 5, G: 6, H: 7, I: 8, J: 9, K: 10, L: 11, M: 12, N: 13, O: 14, P: 15, Q: 16, R: 17, S: 18, T: 19, U: 20 };
    const targetGetCellValue = (r, column) => {
      const rowIndex = r - targetSheetData.startRow - 1;
      if (rowIndex < 0 || rowIndex >= targetSheetData.dataRows.length) return null;
      const colIndex = columnToIndex[column.toUpperCase()];
      if (colIndex === undefined) return null;
      return targetSheetData.dataRows[rowIndex][colIndex];
    };

    const parsed = parseExcelFormula(formula, targetRowToIndicatorMap, targetGetCellValue, allRowToIndicatorMaps);
    if (!parsed) {
      situationCache.set(rowNum, null);
      return null;
    }

    // Résoudre les références simples dans la feuille cible
    if (parsed._reference) {
      const refRowNum = extractRowNumber(parsed._reference);
      if (refRowNum) {
        const resolved = resolveConditionInSheet(refRowNum, targetSituation, new Set(visited));
        situationCache.set(rowNum, resolved);
        return resolved;
      }
      return null;
    }

    // Résoudre les _referenceToMerge dans la feuille cible (AND avec parent)
    if (parsed._referenceToMerge) {
      const refRowNum = extractRowNumber(parsed._referenceToMerge);
      if (refRowNum) {
        const parentCondition = resolveConditionInSheet(refRowNum, targetSituation, new Set(visited));
        // Parent jamais affiché → AND avec faux → jamais affiché
        if (parentCondition?._neverVisible) {
          situationCache.set(rowNum, { _neverVisible: true });
          return { _neverVisible: true };
        }
        if (parentCondition?.conditions && parsed.conditions) {
          // Si le parent est un OR, on l'imbrique pour préserver (A OR B) AND C au lieu de l'aplatir.
          const result = parentCondition.operator === "OR" ? { operator: "AND", conditions: [{ operator: "OR", conditions: parentCondition.conditions }, ...parsed.conditions] } : { operator: "AND", conditions: [...parentCondition.conditions, ...parsed.conditions] };
          situationCache.set(rowNum, result);
          return result;
        }
      }
      const result = { conditions: parsed.conditions };
      situationCache.set(rowNum, result);
      return result;
    }

    // Pour les autres cas, retourner le résultat parsé
    situationCache.set(rowNum, parsed);
    return parsed;
  }

  function resolveCondition(rowNum, visited = new Set()) {
    if (visited.has(rowNum)) return null;
    visited.add(rowNum);

    if (resolvedConditions.has(rowNum)) return resolvedConditions.get(rowNum);

    const parsed = parseCache.get(rowNum);
    if (!parsed) {
      resolvedConditions.set(rowNum, null);
      return null;
    }

    if (parsed._reference) {
      const refRowNum = extractRowNumber(parsed._reference);
      if (refRowNum) {
        const resolved = resolveCondition(refRowNum, new Set(visited));
        resolvedConditions.set(rowNum, resolved);
        return resolved;
      }
      return null;
    }

    // Référence inter-feuilles - résoudre dans la feuille source et ajouter sourceSituation
    if (parsed._interSheetReference) {
      const { refRowNum, excel_indicator_situation: sourceSituation } = parsed;
      if (refRowNum && sourceSituation && allSheetsData) {
        // Résoudre la condition dans la feuille source
        const refCondition = resolveConditionInSheet(refRowNum, sourceSituation, new Set());
        if (refCondition?._neverVisible) {
          resolvedConditions.set(rowNum, { _neverVisible: true });
          return { _neverVisible: true };
        }
        if (refCondition?.conditions) {
          // Ajouter sourceSituation à chaque feuille (en descendant dans les groupes imbriqués)
          const conditionsWithSource = mapConditionLeaves(refCondition.conditions, (cond) => ({ ...cond, excel_indicator_situation: sourceSituation }));
          const result = { ...refCondition, conditions: conditionsWithSource };
          resolvedConditions.set(rowNum, result);
          return result;
        }
      }
      // Si on ne peut pas résoudre, on ignore
      resolvedConditions.set(rowNum, { _ignored: true });
      return { _ignored: true };
    }

    // Référence dynamique vers un autre indicateur par excel_indicator_id (VLOOKUP) - miroir de sa condition
    if (parsed._indicatorRefByName) {
      const { excel_indicator_id: targetId, situation: refSituation } = parsed._indicatorRefByName;
      const targetRow = getRowForIndicatorId(targetId, refSituation);
      if (!targetRow) {
        resolvedConditions.set(rowNum, { _ignored: true });
        return { _ignored: true };
      }
      const refCondition = resolveConditionInSheet(targetRow, refSituation, new Set());
      if (refCondition?._neverVisible) {
        resolvedConditions.set(rowNum, { _neverVisible: true });
        return { _neverVisible: true };
      }
      if (refCondition?.conditions?.length > 0) {
        const conditionsWithSource = mapConditionLeaves(refCondition.conditions, (cond) => ({ ...cond, excel_indicator_situation: cond.excel_indicator_situation || refSituation }));
        const result = { ...refCondition, conditions: conditionsWithSource };
        resolvedConditions.set(rowNum, result);
        return result;
      }
      // La cible n'a aucune condition → elle est toujours visible → ce miroir l'est aussi
      resolvedConditions.set(rowNum, { _alwaysVisible: true });
      return { _alwaysVisible: true };
    }

    if (parsed._referenceToMerge) {
      const refRowNum = extractRowNumber(parsed._referenceToMerge);
      if (refRowNum) {
        const parentCondition = resolveCondition(refRowNum, new Set(visited));
        // Parent jamais affiché → AND avec faux → jamais affiché
        if (parentCondition?._neverVisible) {
          resolvedConditions.set(rowNum, { _neverVisible: true });
          return { _neverVisible: true };
        }
        if (parentCondition?.conditions && parsed.conditions) {
          // Si le parent est un OR, on l'imbrique pour préserver (A OR B) AND C au lieu de l'aplatir.
          const result = parentCondition.operator === "OR" ? { operator: "AND", conditions: [{ operator: "OR", conditions: parentCondition.conditions }, ...parsed.conditions] } : { operator: "AND", conditions: [...parentCondition.conditions, ...parsed.conditions] };
          resolvedConditions.set(rowNum, result);
          return result;
        }
      }
      const result = { conditions: parsed.conditions };
      resolvedConditions.set(rowNum, result);
      return result;
    }

    // Résoudre les AND avec NOT (références croisées avec négation)
    if (parsed._andNotReferences) {
      const allConditions = [];
      for (const { rowNum: refRowNum, negate } of parsed._andNotReferences) {
        const refCondition = resolveCondition(refRowNum, new Set(visited));
        if (refCondition?.conditions) {
          // Appliquer le flag negate à chaque feuille (en descendant dans les groupes imbriqués)
          allConditions.push(...mapConditionLeaves(refCondition.conditions, (cond) => ({ ...cond, negate: negate ? !cond.negate : cond.negate })));
        }
      }
      if (allConditions.length > 0) {
        const result = { operator: allConditions.length > 1 ? "AND" : undefined, conditions: allConditions };
        resolvedConditions.set(rowNum, result);
        return result;
      }
      resolvedConditions.set(rowNum, null);
      return null;
    }

    // Résoudre les AND entre égalité et référence
    if (parsed._andEqualsRef) {
      const { equalsCondition, refRowNum } = parsed._andEqualsRef;
      const refCondition = resolveCondition(refRowNum, new Set(visited));
      const allConditions = [equalsCondition];

      if (refCondition?.conditions) {
        allConditions.push(...refCondition.conditions);
      }

      const result = { operator: allConditions.length > 1 ? "AND" : undefined, conditions: allConditions };
      resolvedConditions.set(rowNum, result);
      return result;
    }

    resolvedConditions.set(rowNum, parsed);
    return parsed;
  }

  for (const rowNum of formulasMap.keys()) {
    resolveCondition(rowNum);
  }

  return resolvedConditions;
}

// Récupère la plage utilisée de la feuille de calcul (values, formulas, address)
async function getWorksheetUsedRange(fileId, worksheetName) {
  const siteId = (await graphFetch(`/sites/${sharePointSiteName}.sharepoint.com`)).id;
  return graphFetch(`/sites/${siteId}/drive/items/${fileId}/workbook/worksheets/${encodeURIComponent(worksheetName)}/usedRange`);
}

async function createIndicatorsFromExcel(situation, worksheetName, allSheetsData = null) {
  try {
    // Utiliser les données pré-chargées si disponibles, sinon charger
    let dataRows, formulaRows, startRow;

    if (allSheetsData && allSheetsData.has(situation)) {
      const sheetData = allSheetsData.get(situation);
      dataRows = sheetData.dataRows;
      formulaRows = sheetData.formulaRows;
      startRow = sheetData.startRow;
    } else {
      const data = await getWorksheetUsedRange(masterFileId, worksheetName);
      dataRows = data.values.slice(1);
      formulaRows = data.formulas ? data.formulas.slice(1) : null;
      const startRowMatch = data.address?.match(/[A-Z]+(\d+):/i);
      startRow = startRowMatch ? parseInt(startRowMatch[1], 10) : 1;
    }

    // Mapping ligne → excel_indicator_id
    const rowToIndicatorMap = new Map();
    for (let i = 0; i < dataRows.length; i++) {
      const excelIndicatorId = dataRows[i][4];
      if (excelIndicatorId && excelIndicatorId !== "") {
        rowToIndicatorMap.set(startRow + 1 + i, String(excelIndicatorId).trim());
      }
    }

    // Extraire les formules de la colonne K (index 10)
    const formulasMap = new Map();
    if (formulaRows) {
      for (let i = 0; i < formulaRows.length; i++) {
        const formula = formulaRows[i][10];
        if (formula && String(formula).startsWith("=")) formulasMap.set(startRow + 1 + i, String(formula));
        // 0 littéral (pas de formule) → jamais affiché, on le normalise en "=0" pour le parseur
        if (String(formula).trim() === "0") formulasMap.set(startRow + 1 + i, "=0");
      }
      console.log(`📋 ${formulasMap.size} formules d'affichage trouvées`);
    }

    // Fonction pour lire une valeur de cellule depuis les données Excel
    const columnToIndex = { A: 0, B: 1, C: 2, D: 3, E: 4, F: 5, G: 6, H: 7, I: 8, J: 9, K: 10, L: 11, M: 12, N: 13, O: 14, P: 15, Q: 16, R: 17, S: 18, T: 19, U: 20 };
    const getCellValue = (rowNum, column) => {
      const rowIndex = rowNum - startRow - 1; // Convertir numéro de ligne Excel en index dans dataRows
      if (rowIndex < 0 || rowIndex >= dataRows.length) return null;
      const colIndex = columnToIndex[column.toUpperCase()];
      if (colIndex === undefined) return null;
      return dataRows[rowIndex][colIndex];
    };

    // Construire les maps pour toutes les feuilles (pour résoudre les références inter-feuilles)
    const allRowToIndicatorMaps = new Map();
    const allFormulasMapsBySituation = new Map();

    if (allSheetsData) {
      for (const [sit, sheetData] of allSheetsData) {
        // Construire rowToIndicatorMap pour cette feuille
        const sitRowToIndicatorMap = new Map();
        for (let i = 0; i < sheetData.dataRows.length; i++) {
          const excelIndicatorId = sheetData.dataRows[i][4];
          if (excelIndicatorId && excelIndicatorId !== "") {
            sitRowToIndicatorMap.set(sheetData.startRow + 1 + i, String(excelIndicatorId).trim());
          }
        }
        allRowToIndicatorMaps.set(sit, sitRowToIndicatorMap);

        // Construire formulasMap pour cette feuille
        const sitFormulasMap = new Map();
        if (sheetData.formulaRows) {
          for (let i = 0; i < sheetData.formulaRows.length; i++) {
            const formula = sheetData.formulaRows[i][10];
            if (formula && String(formula).startsWith("=")) sitFormulasMap.set(sheetData.startRow + 1 + i, String(formula));
            // 0 littéral (pas de formule) → jamais affiché, on le normalise en "=0" pour le parseur
            if (String(formula).trim() === "0") sitFormulasMap.set(sheetData.startRow + 1 + i, "=0");
          }
        }
        allFormulasMapsBySituation.set(sit, sitFormulasMap);
      }
    }

    // Résoudre les formules (avec accès aux données de toutes les feuilles)
    const resolvedConditions = resolveAllFormulas(formulasMap, rowToIndicatorMap, getCellValue, allSheetsData, allRowToIndicatorMaps, allFormulasMapsBySituation);

    // Vérifier les formules non prises en compte
    const unparsedFormulas = [];
    let ignoredCount = 0;
    for (const [rowNum, formula] of formulasMap) {
      const resolved = resolvedConditions.get(rowNum);
      if (resolved === null) {
        const excelIndicatorId = rowToIndicatorMap.get(rowNum) || "N/A";
        unparsedFormulas.push({ rowNum, formula, excelIndicatorId, situation, worksheetName });
      } else if (resolved?._ignored) {
        console.log(`   ⚠️ Formule non prise en compte: ${formula}`);
        ignoredCount++;
      }
    }

    if (unparsedFormulas.length > 0) {
      console.log(`   ⚠️ ${unparsedFormulas.length} formule(s) non prise(s) en compte`);
    } else {
      const parsedCount = formulasMap.size - ignoredCount;
      console.log(`   ✅ ${parsedCount} formules parsées avec succès${ignoredCount > 0 ? `, ${ignoredCount} références inter-feuilles ignorées` : ""}`);
    }

    // Charger toutes les catégories principales
    const allPrincipalCategories = await IndicatorCategory.find({ type: "principal" });
    const principalCategoriesMap = new Map(allPrincipalCategories.map((cat) => [cat.name, cat]));

    // Charger toutes les sous-catégories
    const allSubCategories = await IndicatorCategory.find({ type: "sub" });
    const subCategoriesMap = new Map(allSubCategories.map((cat) => [`${cat.name}|${cat.principal_category_id}`, cat]));

    // Charger toutes les actions
    const allActions = await Action.find({ type: "global" });
    const actionsMap = new Map(allActions.map((action) => [action.excel_worksheetname, action]));

    // Charger tous les indicateurs existants
    const allExistingIndicators = await Indicator.find({});
    const indicatorsMap = new Map(allExistingIndicators.map((ind) => [ind.excel_indicator_id, ind]));

    console.log(`✅ Données chargées : ${principalCategoriesMap.size} catégories principales, ${subCategoriesMap.size} sous-catégories, ${actionsMap.size} actions, ${indicatorsMap.size} indicateurs`);

    // Maps pour stocker les nouvelles catégories à créer
    const newPrincipalCategories = new Map();
    const newSubCategories = new Map();

    const indicators = [];
    const bulkUpdateOps = [];
    const logsToCreate = [];
    const indicatorValueUpdates = new Map(); // Map<indicator_id, updateData> pour mettre à jour les IndicatorValues

    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];
      const excelRowNumber = startRow + 1 + i;

      // Skip les lignes sans excel_indicator_id
      if (!row[4] || row[4] === "") continue;

      // Vérifier si l'indicateur existe déjà (depuis le cache)
      const existingIndicator = indicatorsMap.get(row[4]);

      // Détecter une formule de référence dans la cellule "valeurs possibles" (colonne G, index 6)
      // Si présente, on stocke la référence vers l'indicateur source pour résolution dynamique au fetch
      const possibilitiesFormula = formulaRows?.[i]?.[6];
      const possibilitiesSourceForSituation = parsePossibilitiesFormula(possibilitiesFormula, situation, rowToIndicatorMap, allRowToIndicatorMaps);

      // Récupérer la condition d'affichage résolue pour cette situation
      const rawCondition = resolvedConditions.get(excelRowNumber) || null;
      let display_condition_for_situation = null;
      // 0 en colonne K → jamais affiché : condition spéciale toujours fausse
      if (rawCondition?._neverVisible) display_condition_for_situation = { conditions: [{ type: "neverVisible" }] };
      if (rawCondition && rawCondition.conditions?.length > 0) {
        display_condition_for_situation = { conditions: rawCondition.conditions };
        if (rawCondition.operator === "OR" || (rawCondition.conditions.length > 1 && rawCondition.operator)) {
          display_condition_for_situation.operator = rawCondition.operator;
        }
      }

      let category = null;
      let subCategory = null;
      let action = null;

      if (row[0] !== "") {
        const categoryName = row[0];
        category = principalCategoriesMap.get(categoryName);
        if (!category) {
          category = await IndicatorCategory.create({ name: categoryName, type: "principal" });
          principalCategoriesMap.set(categoryName, category);
          newPrincipalCategories.set(categoryName, category);
        }
      }

      if (row[1] !== "" && category) {
        const subCategoryKey = `${row[1]}|${category._id}`;
        subCategory = subCategoriesMap.get(subCategoryKey);
        if (!subCategory) {
          subCategory = await IndicatorCategory.create({
            name: row[1],
            type: "sub",
            principal_category_id: category._id,
            principal_category_name: category.name,
          });
          subCategoriesMap.set(subCategoryKey, subCategory);
          newSubCategories.set(subCategoryKey, subCategory);
        }
      }

      if (row[12] !== "") {
        action = actionsMap.get(row[12]);
        if (!action) continue;
      }

      try {
        const valueType = row[9] !== undefined && row[9] !== "" ? row[9] : undefined;
        const defaultValueRaw = row[7] !== undefined && row[7] !== "" ? row[7] : undefined;

        let valueDefaultForSituation = undefined;
        if (defaultValueRaw !== undefined && valueType) {
          if (valueType === "number") {
            const parsedValue = parseFloat(defaultValueRaw);
            valueDefaultForSituation = { [valueType]: !isNaN(parsedValue) ? parsedValue : undefined };
          }
          if (valueType === "text") valueDefaultForSituation = { [valueType]: String(defaultValueRaw).trim() || undefined };
          if (valueType === "radio") valueDefaultForSituation = { [valueType]: String(defaultValueRaw).trim() || undefined };
          if (valueType === "checkbox") {
            const checkboxValues = String(defaultValueRaw)
              .split(",")
              .map((v) => v.trim())
              .filter((v) => v !== "");
            valueDefaultForSituation = { [valueType]: checkboxValues.length > 0 ? checkboxValues : undefined };
          }
        }

        if (existingIndicator) {
          const updatedValueDefault = { ...existingIndicator.value_default };
          if (situation && valueDefaultForSituation) updatedValueDefault[situation] = valueDefaultForSituation;

          const updatedPresenceInExcel = { ...existingIndicator.presence_in_excel };
          if (situation) updatedPresenceInExcel[situation] = true;

          const updatedExcelLineNumber = { ...existingIndicator.excel_line_number };
          if (situation) updatedExcelLineNumber[situation] = excelRowNumber;

          const updatedDisplayCondition = { ...existingIndicator.display_condition };
          if (situation && display_condition_for_situation) updatedDisplayCondition[situation] = display_condition_for_situation;

          const updatedPossibilitiesSource = { ...(existingIndicator.value_possibilities_source || {}) };
          if (situation) updatedPossibilitiesSource[situation] = possibilitiesSourceForSituation || undefined;

          const newData = {
            indicator_category_id: category?._id,
            indicator_category_name: category?.name,
            indicator_sub_category_id: subCategory?._id,
            indicator_sub_category_name: subCategory?.name,
            name: row[2] || undefined,
            description: row[3] || undefined,
            is_primordial: row[14] === true || row[14] === "VRAI",
            value_possibilities: possibilitiesSourceForSituation
              ? []
              : row[6] !== undefined && row[6] !== ""
                ? String(row[6])
                    .split(",")
                    .map((v) => v.trim())
                    .filter((v) => v !== "")
                : [],
            value_default: updatedValueDefault,
            value_unit: row[8] || undefined,
            value_type: valueType,
            linked_action_id: action?._id,
            linked_action_name: action?.name,
            presence_in_excel: updatedPresenceInExcel,
            excel_line_number: updatedExcelLineNumber,
            display_condition: updatedDisplayCondition,
            value_possibilities_source: updatedPossibilitiesSource,
          };

          const fieldsToLog = [
            "indicator_category_id",
            "indicator_category_name",
            "indicator_sub_category_id",
            "indicator_sub_category_name",
            "name",
            "description",
            "value_possibilities",
            "value_unit",
            "value_type",
            "linked_action_id",
            "linked_action_name",
            "is_primordial",
            "presence_in_excel",
            "display_condition",
          ];

          fieldsToLog.forEach((field) => {
            if (!areValuesEqual(existingIndicator[field], newData[field])) {
              logsToCreate.push({
                model_name: "indicator",
                name: "Excel",
                field: field,
                operation: "update",
                previous_value: formatLogValue(existingIndicator[field]),
                new_value: formatLogValue(newData[field]),
                type_value: getValueType(newData[field]),
                date: new Date(),
                indicator_id: existingIndicator._id.toString(),
                indicator_name: existingIndicator.name,
                indicator_category_id: existingIndicator.indicator_category_id?.toString(),
                indicator_category_name: existingIndicator.indicator_category_name,
                action_id: existingIndicator.linked_action_id?.toString(),
                action_name: existingIndicator.linked_action_name,
              });
            }
          });

          if (valueType) {
            if (!areValuesEqual(existingIndicator.value_default?.[situation]?.[valueType], newData.value_default?.[situation]?.[valueType])) {
              logsToCreate.push({
                model_name: "indicator",
                name: "Excel",
                field: `value_default_${situation}`,
                operation: "update",
                previous_value: formatLogValue(existingIndicator.value_default?.[situation]?.[valueType]),
                new_value: formatLogValue(newData.value_default?.[situation]?.[valueType]),
                type_value: getValueType(newData.value_default?.[situation]?.[valueType]),
                date: new Date(),
                indicator_id: existingIndicator._id.toString(),
                indicator_name: existingIndicator.name,
                indicator_category_id: existingIndicator.indicator_category_id?.toString(),
                indicator_category_name: existingIndicator.indicator_category_name,
                action_id: existingIndicator.linked_action_id?.toString(),
                action_name: existingIndicator.linked_action_name,
              });
            }
          }

          bulkUpdateOps.push({ updateOne: { filter: { _id: existingIndicator._id }, update: { $set: newData } } });

          // Stocker la mise à jour avec clé composite indicatorId|situation pour cibler les bons indicator_values
          indicatorValueUpdates.set(`${existingIndicator._id.toString()}|${situation}`, {
            indicator_id: existingIndicator._id.toString(),
            situation: situation,
            updateData: {
              indicator_name: newData.name,
              indicator_description: newData.description,
              indicator_type: newData.value_type,
              indicator_value_possibilities: newData.value_possibilities || [],
              indicator_value_possibilities_source: possibilitiesSourceForSituation || null,
              indicator_category_id: newData.indicator_category_id?.toString(),
              indicator_category_name: newData.indicator_category_name,
              indicator_sub_category_id: newData.indicator_sub_category_id?.toString(),
              indicator_sub_category_name: newData.indicator_sub_category_name,
              indicator_value_unit: newData.value_unit,
              is_primordial: newData.is_primordial,
              excel_line_number: excelRowNumber,
              display_condition: display_condition_for_situation,
            },
          });
        }

        if (!existingIndicator) {
          const valueDefault = situation && valueDefaultForSituation ? { [situation]: valueDefaultForSituation } : undefined;
          const displayCondition = situation && display_condition_for_situation ? { [situation]: display_condition_for_situation } : undefined;
          const excelLineNumber = situation ? { [situation]: excelRowNumber } : undefined;
          const possibilitiesSource = situation && possibilitiesSourceForSituation ? { [situation]: possibilitiesSourceForSituation } : undefined;

          const indicatorData = {
            indicator_category_id: category?._id,
            indicator_category_name: category?.name,
            indicator_sub_category_id: subCategory?._id,
            indicator_sub_category_name: subCategory?.name,
            name: row[2] || undefined,
            description: row[3] || undefined,
            is_primordial: row[14] === true || row[14] === "VRAI",
            excel_indicator_id: row[4] || undefined,
            value_possibilities: possibilitiesSourceForSituation
              ? []
              : row[6] !== undefined && row[6] !== ""
                ? String(row[6])
                    .split(",")
                    .map((v) => v.trim())
                    .filter((v) => v !== "")
                : [],
            value_default: valueDefault,
            value_unit: row[8] || undefined,
            value_type: valueType,
            linked_action_id: action?._id,
            linked_action_name: action?.name,
            presence_in_excel: situation ? { [situation]: true } : undefined,
            excel_line_number: excelLineNumber,
            display_condition: displayCondition,
            value_possibilities_source: possibilitiesSource,
          };

          indicators.push(indicatorData);

          logsToCreate.push({
            model_name: "indicator",
            name: "Excel",
            field: "creation",
            operation: "add",
            new_value: formatLogValue(`Indicateur créé: ${row[2] || row[4]}`),
            previous_value: null,
            type_value: "string",
            date: new Date(),
            indicator_category_id: category?._id?.toString(),
            indicator_category_name: category?.name,
            action_id: action?._id?.toString(),
            action_name: action?.name,
          });
        }
      } catch (error) {
        console.error(`❌ Erreur ligne ${i + 2}:`, error.message);
      }
    }
    // Log des nouvelles catégories créées
    if (newPrincipalCategories.size > 0) {
      console.log(`✅ ${newPrincipalCategories.size} nouvelles catégories principales créées`);
    }
    if (newSubCategories.size > 0) {
      console.log(`✅ ${newSubCategories.size} nouvelles sous-catégories créées`);
    }

    if (indicators.length > 0) {
      await Indicator.insertMany(indicators);
      console.log(`✅ ${indicators.length} nouveaux indicateurs créés`);
    }

    if (bulkUpdateOps.length > 0) {
      await Indicator.bulkWrite(bulkUpdateOps);
      console.log(`✅ ${bulkUpdateOps.length} indicateurs mis à jour`);
    }

    if (indicatorValueUpdates.size > 0) {
      const indicatorValueBulkOps = [];
      for (const [, { indicator_id, situation: sit, updateData }] of indicatorValueUpdates) {
        indicatorValueBulkOps.push({ updateMany: { filter: { indicator_id: indicator_id, situation: sit }, update: { $set: updateData } } });
      }
      const result = await IndicatorValue.bulkWrite(indicatorValueBulkOps);
      console.log(`✅ ${result.modifiedCount} indicator_values mis à jour (${indicatorValueUpdates.size} indicateurs/situations concernés)`);
    }

    let conditionsCount = 0;
    for (const [, condition] of resolvedConditions) {
      if (condition?.conditions?.length > 0) conditionsCount++;
    }
    console.log(`📋 ${conditionsCount} conditions d'affichage générées`);

    if (logsToCreate.length > 0) {
      await Log.insertMany(logsToCreate);
      console.log(`📝 ${logsToCreate.length} logs créés`);
    }
  } catch (error) {
    console.error("❌ Erreur:", error.message);
    throw error;
  }
}

const WORKSHEETS = [
  { name: "Remplissage - Sit. Init.", situation: "init" },
  { name: "Remplissage - Sit. Ref.", situation: "ref" },
  { name: "Remplissage - Sit. Prev.", situation: "prev" },
  { name: "Remplissage - Sit. Expost", situation: "expost" },
];

// Formate la valeur d'un indicator_value pour l'Excel (colonne F - Valeur)
// Retourne null si pas de valeur définie (pour ne pas écraser la valeur par défaut)
function formatIndicatorValue(indicatorValue) {
  if (!indicatorValue.value) return null;
  const val = indicatorValue.value[indicatorValue.indicator_type];
  if (val === undefined || val === null) return null;
  if (Array.isArray(val) && val.length === 0) return null;
  if (Array.isArray(val)) return val.join(", ");
  return String(val);
}

// situationYears: [{ situation: 'init', year: 2020 }, { situation: 'ref', year: 2022 }, ...]
async function syncIndicatorValuesToExcel(excelFileId, collectivityId, situationYears, siteId) {
  // Charger uniquement les indicator_values pertinents (par situation + year)
  const indicatorValues = await IndicatorValue.find({
    collectivity_id: collectivityId,
    $or: situationYears.map((sy) => ({ situation: sy.situation, year: sy.year })),
  });

  if (indicatorValues.length === 0) return 0;

  // Créer une map par situation et indicator_excel_id pour accès rapide
  const valuesMap = new Map();
  for (const iv of indicatorValues) {
    if (!iv.indicator_excel_id || !iv.situation) continue;
    valuesMap.set(`${iv.situation}|${iv.indicator_excel_id}`, iv);
  }

  const relevantSituations = new Set(situationYears.map((sy) => sy.situation));
  let totalUpdated = 0;

  for (const { name: worksheetName, situation } of WORKSHEETS) {
    if (!relevantSituations.has(situation)) continue;

    // Lire la plage utilisée de la feuille (1 seul appel API)
    const usedRange = await graphFetch(`/sites/${siteId}/drive/items/${excelFileId}/workbook/worksheets('${encodeURIComponent(worksheetName)}')/usedRange`);
    const rows = usedRange.values || [];
    const startRow = usedRange.address ? parseInt(usedRange.address.match(/\d+/)?.[0] || 1) : 1;

    // Identifier les lignes à mettre à jour en une passe
    const matchedUpdates = [];
    for (let i = 0; i < rows.length; i++) {
      const excelIndicatorId = rows[i][4];
      if (!excelIndicatorId) continue;

      const indicatorValue = valuesMap.get(`${situation}|${String(excelIndicatorId).trim()}`);
      if (!indicatorValue) continue;

      const formattedValue = formatIndicatorValue(indicatorValue);
      if (formattedValue === null) continue;

      matchedUpdates.push({ rowIndex: i, cellValue: formattedValue });
    }

    if (matchedUpdates.length === 0) continue;

    // Construire un range contigu min..max et PATCH en 1 seul appel
    const minRowIndex = Math.min(...matchedUpdates.map((u) => u.rowIndex));
    const maxRowIndex = Math.max(...matchedUpdates.map((u) => u.rowIndex));
    const updateMap = new Map(matchedUpdates.map((u) => [u.rowIndex, u.cellValue]));

    const rangeValues = [];
    for (let i = minRowIndex; i <= maxRowIndex; i++) {
      rangeValues.push([updateMap.has(i) ? updateMap.get(i) : (rows[i]?.[5] ?? "")]);
    }

    await graphFetch(`/sites/${siteId}/drive/items/${excelFileId}/workbook/worksheets('${encodeURIComponent(worksheetName)}')/range(address='F${startRow + minRowIndex}:F${startRow + maxRowIndex}')`, {
      method: "PATCH",
      body: JSON.stringify({ values: rangeValues }),
    });

    totalUpdated += matchedUpdates.length;
  }

  return totalUpdated;
}

// Crée les IndicatorValue manquants pour les actions déjà créées
async function syncIndicatorsToExistingActions() {
  console.log("\n🔄 Synchronisation des indicateurs avec les actions existantes...");

  // 4 requêtes DB pour tout charger en mémoire
  const [allIndicators, allActions, allIndicatorValues] = await Promise.all([Indicator.find({}), Action.find({}), IndicatorValue.find({}, { indicator_id: 1, action_id: 1, situation: 1, year: 1 })]);

  const linkedIndicators = allIndicators.filter((ind) => ind.linked_action_id);
  const configIndicators = allIndicators.filter((ind) => !ind.linked_action_id);
  const userActions = allActions.filter((a) => a.type !== "config" && a.type !== "global");
  const configActions = allActions.filter((a) => a.type === "config");

  // Index des IVs existants : Set de "actionId_indicatorId_situation_year"
  const existingIVKeys = new Set(allIndicatorValues.map((iv) => `${iv.action_id}_${iv.indicator_id}_${iv.situation}_${iv.year}`));

  console.log(`📋 ${allIndicators.length} indicateurs, ${userActions.length} actions utilisateur, ${configActions.length} actions config, ${allIndicatorValues.length} indicator_values existants`);

  // Index des indicateurs liés par linked_action_id
  const linkedByParent = new Map();
  for (const ind of linkedIndicators) {
    const parentId = ind.linked_action_id?.toString();
    if (!parentId) continue;
    if (!linkedByParent.has(parentId)) linkedByParent.set(parentId, []);
    linkedByParent.get(parentId).push(ind);
  }

  const allNewIVs = [];

  // --- Indicateurs liés à une action (linked_action_id) ---
  for (const action of userActions) {
    if (!action.action_parent_id || !action.year_init || !action.year_prev || !action.year_expost) continue;

    const actionIndicators = linkedByParent.get(action.action_parent_id?.toString());
    if (!actionIndicators || actionIndicators.length === 0) continue;

    const situationYearPairs = [
      { situation: "init", year: action.year_init },
      { situation: "ref", year: action.year_prev },
      { situation: "prev", year: action.year_prev },
      { situation: "expost", year: action.year_expost },
    ];
    if (action.year_expost !== action.year_prev) situationYearPairs.push({ situation: "ref", year: action.year_expost });

    const actionId = action._id.toString();

    for (const indicator of actionIndicators) {
      const pairs = situationYearPairs.filter((p) => indicator.presence_in_excel?.[p.situation] === true);

      for (const { situation, year } of pairs) {
        if (existingIVKeys.has(`${actionId}_${indicator._id.toString()}_${situation}_${year}`)) continue;

        const defaultValue = indicator.value_default?.[situation]?.[indicator.value_type] ?? null;
        const indicatorValue = {
          action_id: action._id,
          action_name: action.name,
          collectivity_id: action.collectivity_id,
          collectivity_name: action.collectivity_name,
          owner: action.owner || "collectivity",
          ...(action.economic_actor_id ? { economic_actor_id: action.economic_actor_id, economic_actor_name: action.economic_actor_name } : {}),
          indicator_id: indicator._id,
          indicator_name: indicator.name,
          indicator_type: indicator.value_type,
          situation,
          year,
          excel_line_number: indicator.excel_line_number?.[situation],
          indicator_value_unit: indicator.value_unit,
          is_primordial: indicator.is_primordial || false,
          value_default: { [indicator.value_type]: defaultValue },
          indicator_value_possibilities: indicator.value_possibilities || [],
          indicator_category_id: indicator.indicator_category_id,
          indicator_category_name: indicator.indicator_category_name,
          indicator_sub_category_id: indicator.indicator_sub_category_id,
          indicator_sub_category_name: indicator.indicator_sub_category_name,
          indicator_excel_id: indicator.excel_indicator_id,
        };
        const displayCondition = indicator.display_condition?.[situation];
        if (displayCondition?.operator || displayCondition?.conditions?.length) indicatorValue.display_condition = displayCondition;
        allNewIVs.push(indicatorValue);
      }
    }
  }

  // --- Indicateurs config (sans linked_action_id) ---
  const userActionsByGroup = new Map();
  for (const ua of userActions) {
    const key = `${ua.collectivity_id}_${ua.owner || "collectivity"}_${ua.economic_actor_id || ""}`;
    if (!userActionsByGroup.has(key)) userActionsByGroup.set(key, []);
    userActionsByGroup.get(key).push(ua);
  }

  for (const configAction of configActions) {
    const groupKey = `${configAction.collectivity_id}_${configAction.owner || "collectivity"}_${configAction.economic_actor_id || ""}`;
    const relatedActions = userActionsByGroup.get(groupKey);
    if (!relatedActions || relatedActions.length === 0) continue;

    // Collecter toutes les paires situation/année uniques
    const allSituationYearPairs = new Set();
    for (const ra of relatedActions) {
      if (ra.year_init) allSituationYearPairs.add(`init_${ra.year_init}`);
      if (ra.year_prev) {
        allSituationYearPairs.add(`ref_${ra.year_prev}`);
        allSituationYearPairs.add(`prev_${ra.year_prev}`);
      }
      if (ra.year_expost) {
        allSituationYearPairs.add(`expost_${ra.year_expost}`);
        if (ra.year_expost !== ra.year_prev) allSituationYearPairs.add(`ref_${ra.year_expost}`);
      }
    }

    const situationYearPairs = Array.from(allSituationYearPairs).map((k) => {
      const [situation, year] = k.split("_");
      return { situation, year: parseInt(year) };
    });

    // Filtrer les indicateurs config par catégorie
    const relevantIndicators = configIndicators.filter((ind) => {
      if (configAction.name === "Données de base") return ind.indicator_category_name === "Données de base";
      if (configAction.name === "Parc types") return ind.indicator_category_name === "Parc types";
      return false;
    });

    const configActionId = configAction._id.toString();

    for (const indicator of relevantIndicators) {
      const pairs = situationYearPairs.filter((p) => indicator.presence_in_excel?.[p.situation] === true);

      for (const { situation, year } of pairs) {
        if (existingIVKeys.has(`${configActionId}_${indicator._id.toString()}_${situation}_${year}`)) continue;

        const defaultValue = indicator.value_default?.[situation]?.[indicator.value_type] ?? null;
        const indicatorValue = {
          action_id: configAction._id,
          action_name: configAction.name,
          collectivity_id: configAction.collectivity_id,
          collectivity_name: configAction.collectivity_name,
          owner: configAction.owner || "collectivity",
          ...(configAction.economic_actor_id ? { economic_actor_id: configAction.economic_actor_id, economic_actor_name: configAction.economic_actor_name } : {}),
          indicator_id: indicator._id,
          indicator_name: indicator.name,
          indicator_type: indicator.value_type,
          situation,
          year,
          indicator_value_unit: indicator.value_unit,
          is_primordial: indicator.is_primordial || false,
          value_default: { [indicator.value_type]: defaultValue },
          indicator_value_possibilities: indicator.value_possibilities || [],
          indicator_category_id: indicator.indicator_category_id,
          indicator_category_name: indicator.indicator_category_name,
          indicator_sub_category_id: indicator.indicator_sub_category_id,
          indicator_sub_category_name: indicator.indicator_sub_category_name,
          indicator_excel_id: indicator.excel_indicator_id,
          excel_line_number: indicator.excel_line_number?.[situation],
        };

        // Pour Parc types, set value = value_default
        if (configAction.name === "Parc types") indicatorValue.value = { [indicator.value_type]: defaultValue };

        const displayCondition = indicator.display_condition?.[situation];
        if (displayCondition?.operator || displayCondition?.conditions?.length) indicatorValue.display_condition = displayCondition;
        allNewIVs.push(indicatorValue);
      }
    }
  }

  // Un seul insertMany pour tout
  if (allNewIVs.length > 0) await IndicatorValue.insertMany(allNewIVs);

  console.log(`✅ Synchronisation terminée: ${allNewIVs.length} indicator_values créés`);
  return allNewIVs.length;
}

async function duplicateMasterExcel(collectivityName) {
  console.log(`\n📋 Duplication du fichier master pour "${collectivityName}"...`);

  // Récupérer les infos du fichier master pour extraire la version
  const siteId = (await graphFetch(`/sites/${sharePointSiteName}.sharepoint.com`)).id;
  const masterFile = await graphFetch(`/sites/${siteId}/drive/items/${masterFileId}`);

  // Extraire la version du nom du master (ex: "Calcul des actions_V10.xlsx" → "V10")
  const masterFileName = masterFile.name.replace(".xlsx", "");
  const versionMatch = masterFileName.match(/_V(\d+)$/);
  const version = versionMatch ? `_V${versionMatch[1]}` : "";

  const newFileName = `${collectivityName}${version}.xlsx`;
  console.log(`📄 Nouveau fichier: ${newFileName}`);

  // Utiliser duplicateExcelFile du service (polling robuste + retry)
  const newFileId = await duplicateExcelFile(newFileName, null, masterFileId);

  console.log(`✅ Fichier créé: ${newFileName} (ID: ${newFileId})`);
  return newFileId;
}

async function generateExcelForAllCollectivities() {
  console.log("\n📊 Régénération des Excel pour toutes les collectivités...");

  const siteId = (await graphFetch(`/sites/${sharePointSiteName}.sharepoint.com`)).id;

  // Extraire la version du master (ex: "Calcul des actions_V12.xlsx" → "_V12")
  const masterFile = await graphFetch(`/sites/${siteId}/drive/items/${masterFileId}`);
  const versionMatch = masterFile.name.replace(".xlsx", "").match(/_V(\d+)$/);
  const versionSuffix = versionMatch ? `_V${versionMatch[1]}` : "";

  const collectivities = await Collectivity.find();
  console.log(`📋 ${collectivities.length} collectivités trouvées (master: ${masterFile.name})`);

  let totalFiles = 0;
  let totalValues = 0;

  for (const collectivity of collectivities) {
    if (!collectivity.sharepoint_folder_id) {
      continue;
    }

    const actions = await Action.find({ collectivity_id: collectivity._id.toString() });
    if (actions.length === 0) continue;

    console.log(`\n🏙️ "${collectivity.name}" : ${actions.length} action(s)`);

    for (const action of actions) {
      // Traiter les fichiers prev
      for (let idx = 0; idx < (action.exel_files_prev || []).length; idx++) {
        const prevFile = action.exel_files_prev[idx];
        if (!prevFile.excel_file_id) continue;

        try {
          // Dupliquer le master pour remplacer l'Excel
          const instanceSuffix = action.instance_number > 1 ? `_${action.instance_number}` : "";
          const ownerPrefix = action.owner === "economic_actor" && action.economic_actor_name ? `${action.economic_actor_name}_` : "";
          const fileName = `${ownerPrefix}${action.name}${instanceSuffix}_Prev${prevFile.year_prev}${versionSuffix}.xlsx`;
          const newFileId = await duplicateExcelFile(fileName, collectivity.sharepoint_folder_id, masterFileId);

          // Sync les valeurs (prev file contient init + ref + prev)
          const situationYears = [
            { situation: "init", year: action.year_init },
            { situation: "ref", year: prevFile.year_ref },
            { situation: "prev", year: prevFile.year_prev },
          ].filter((sy) => sy.year);

          const updated = await syncIndicatorValuesToExcel(newFileId, collectivity._id.toString(), situationYears, siteId);

          // Mettre à jour le excel_file_id dans l'action
          action.exel_files_prev[idx].excel_file_id = newFileId;
          totalFiles++;
          totalValues += updated;
          console.log(`   ✅ ${fileName} : ${updated} valeurs`);
        } catch (error) {
          console.error(`   ❌ Prev ${prevFile.year_prev} pour "${action.name}":`, error.message);
        }
      }

      // Traiter les fichiers expost
      for (let idx = 0; idx < (action.excel_files_expost || []).length; idx++) {
        const expostFile = action.excel_files_expost[idx];
        if (!expostFile.excel_file_id) continue;

        try {
          const instanceSuffix = action.instance_number > 1 ? `_${action.instance_number}` : "";
          const ownerPrefix = action.owner === "economic_actor" && action.economic_actor_name ? `${action.economic_actor_name}_` : "";
          const fileName = `${ownerPrefix}${action.name}${instanceSuffix}_Expost${expostFile.year_expost}${versionSuffix}.xlsx`;
          const newFileId = await duplicateExcelFile(fileName, collectivity.sharepoint_folder_id, masterFileId);

          const situationYears = [
            { situation: "init", year: action.year_init },
            { situation: "ref", year: expostFile.year_ref },
            { situation: "expost", year: expostFile.year_expost },
          ].filter((sy) => sy.year);

          const updated = await syncIndicatorValuesToExcel(newFileId, collectivity._id.toString(), situationYears, siteId);

          action.excel_files_expost[idx].excel_file_id = newFileId;
          totalFiles++;
          totalValues += updated;
          console.log(`   ✅ ${fileName} : ${updated} valeurs`);
        } catch (error) {
          console.error(`   ❌ Expost ${expostFile.year_expost} pour "${action.name}":`, error.message);
        }
      }

      // Sauvegarder l'action avec les nouveaux excel_file_id
      await action.save();
    }
  }

  console.log(`\n🎉 Régénération terminée : ${totalFiles} fichiers Excel, ${totalValues} valeurs synchronisées`);
}

if (require.main === module) {
  const worksheetsToProcess = [
    { worksheetName: "Remplissage - Sit. Init.", situation: "init" },
    { worksheetName: "Remplissage - Sit. Ref.", situation: "ref" },
    { worksheetName: "Remplissage - Sit. Prev.", situation: "prev" },
    { worksheetName: "Remplissage - Sit. Expost", situation: "expost" },
  ];

  (async () => {
    try {
      await mongoose.connect(config.MONGODB_ENDPOINT);

      // Étape 1: Charger toutes les feuilles d'abord (pour les références inter-feuilles)
      console.log("📥 Chargement de toutes les feuilles Excel...");
      const allSheetsData = new Map();

      for (const { worksheetName, situation } of worksheetsToProcess) {
        console.log(`   📄 Chargement de "${worksheetName}"...`);
        const data = await getWorksheetUsedRange(masterFileId, worksheetName);
        allSheetsData.set(situation, {
          worksheetName,
          data,
          dataRows: data.values.slice(1),
          formulaRows: data.formulas ? data.formulas.slice(1) : null,
          startRow: data.address?.match(/[A-Z]+(\d+):/i) ? parseInt(data.address.match(/[A-Z]+(\d+):/i)[1], 10) : 1,
        });
      }
      console.log("✅ Toutes les feuilles chargées!");

      // Étape 2: Traiter chaque feuille avec accès aux données de toutes les feuilles
      for (const { worksheetName, situation } of worksheetsToProcess) {
        console.log(`\n🔄 Traitement de la feuille "${worksheetName}" (situation: ${situation})...`);
        await createIndicatorsFromExcel(situation, worksheetName, allSheetsData);
        console.log(`✅ Feuille "${worksheetName}" traitée avec succès!`);
      }
      // Étape 3: Identifier et supprimer les indicateurs absents de l'Excel
      console.log("\n🗑️ Vérification des indicateurs supprimés...");

      // 3a: Collecter tous les excel_indicator_id présents dans chaque feuille
      const excelIdsBySituation = new Map();
      const allExcelIds = new Set();

      for (const { situation } of worksheetsToProcess) {
        const sheetData = allSheetsData.get(situation);
        const idsInSheet = new Set();
        for (const row of sheetData.dataRows) {
          const excelId = row[4];
          if (excelId && excelId !== "") {
            const trimmedId = String(excelId).trim();
            idsInSheet.add(trimmedId);
            allExcelIds.add(trimmedId);
          }
        }
        excelIdsBySituation.set(situation, idsInSheet);
      }

      console.log(`📋 IDs trouvés: init=${excelIdsBySituation.get("init").size}, ref=${excelIdsBySituation.get("ref").size}, prev=${excelIdsBySituation.get("prev").size}, expost=${excelIdsBySituation.get("expost").size} (total uniques: ${allExcelIds.size})`);

      // 3b: Charger tous les indicateurs existants et détecter les suppressions
      const allDbIndicators = await Indicator.find({});
      console.log(`📋 ${allDbIndicators.length} indicateurs en base de données`);

      const indicatorsToDeleteCompletely = [];
      const indicatorsToUpdatePartially = [];

      for (const indicator of allDbIndicators) {
        const excelId = indicator.excel_indicator_id;
        if (!excelId) continue;

        if (!allExcelIds.has(excelId)) {
          // Indicateur complètement absent de toutes les feuilles Excel
          indicatorsToDeleteCompletely.push(indicator);
        } else {
          // Vérifier les suppressions par situation
          const situationsToRemove = [];
          for (const sit of ["init", "ref", "prev", "expost"]) {
            const wasPresent = indicator.presence_in_excel?.[sit] === true;
            const isNowPresent = excelIdsBySituation.get(sit)?.has(excelId) || false;
            if (wasPresent && !isNowPresent) {
              situationsToRemove.push(sit);
            }
          }
          if (situationsToRemove.length > 0) {
            indicatorsToUpdatePartially.push({ indicator, situationsToRemove });
          }
        }
      }

      // 3c: Exécuter les suppressions complètes
      if (indicatorsToDeleteCompletely.length > 0) {
        const idsToDelete = indicatorsToDeleteCompletely.map((ind) => ind._id);

        const ivDeleteResult = await IndicatorValue.deleteMany({ indicator_id: { $in: idsToDelete.map((id) => id.toString()) } });
        console.log(`🗑️ ${ivDeleteResult.deletedCount} indicator_values supprimés (suppression complète)`);

        const indDeleteResult = await Indicator.deleteMany({ _id: { $in: idsToDelete } });
        console.log(`🗑️ ${indDeleteResult.deletedCount} indicateurs supprimés complètement:`);
        for (const ind of indicatorsToDeleteCompletely) {
          console.log(`   - ${ind.excel_indicator_id} (${ind.name || "sans nom"})`);
        }
      }

      // 3d: Exécuter les suppressions partielles (per-situation)
      if (indicatorsToUpdatePartially.length > 0) {
        const partialBulkOps = [];
        let totalIvDeleted = 0;

        for (const { indicator, situationsToRemove } of indicatorsToUpdatePartially) {
          const updateSet = {};
          const updateUnset = {};

          for (const sit of situationsToRemove) {
            updateSet[`presence_in_excel.${sit}`] = false;
            updateUnset[`excel_line_number.${sit}`] = "";
            updateUnset[`display_condition.${sit}`] = "";
            updateUnset[`value_default.${sit}`] = "";
          }

          partialBulkOps.push({
            updateOne: {
              filter: { _id: indicator._id },
              update: { $set: updateSet, $unset: updateUnset },
            },
          });

          // Supprimer les IndicatorValues pour les situations retirées
          for (const sit of situationsToRemove) {
            const ivResult = await IndicatorValue.deleteMany({ indicator_id: indicator._id.toString(), situation: sit });
            totalIvDeleted += ivResult.deletedCount;
          }

          console.log(`   🔄 ${indicator.excel_indicator_id} (${indicator.name || "sans nom"}): situations retirées [${situationsToRemove.join(", ")}]`);
        }

        if (partialBulkOps.length > 0) {
          await Indicator.bulkWrite(partialBulkOps);
          console.log(`🔄 ${partialBulkOps.length} indicateurs mis à jour (suppression partielle)`);
        }
        if (totalIvDeleted > 0) {
          console.log(`🗑️ ${totalIvDeleted} indicator_values supprimés (suppression partielle)`);
        }
      }

      if (indicatorsToDeleteCompletely.length === 0 && indicatorsToUpdatePartially.length === 0) {
        console.log("✅ Aucun indicateur à supprimer");
      }

      console.log("\n🎉 Toutes les feuilles ont été traitées et nettoyées avec succès!");

      // Étape 4: Synchroniser les indicateurs avec les actions existantes
      await syncIndicatorsToExistingActions();

      // // Étape 5: Générer les fichiers Excel pour toutes les collectivités
      // await generateExcelForAllCollectivities();

      process.exit(0);
    } catch (error) {
      console.error("\n❌ Échec du script:", error.message);
      process.exit(1);
    }
  })();
}

module.exports = { createIndicatorsFromExcel, getWorksheetUsedRange, parseExcelFormula, resolveAllFormulas, syncIndicatorValuesToExcel, syncIndicatorsToExistingActions, duplicateMasterExcel, generateExcelForAllCollectivities };
