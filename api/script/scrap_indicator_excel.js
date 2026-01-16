const { getAccessToken } = require("../src/services/microsoftGraph");
const Indicator = require("../src/models/indicator");
const IndicatorValue = require("../src/models/indicator_value");
const IndicatorCategory = require("../src/models/indicator_category");
const Action = require("../src/models/action");
const Collectivity = require("../src/models/collectivity");
const mongoose = require("mongoose");
const config = require("../src/config");

const sharePointSiteName = "selegobv";
const masterFileId = "01IBL4ADIVUZIGVTMVLVCZE36NH3QQKG6T"; // ID du fichier master Excel

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
  if (lower.includes('init')) return 'init';
  if (lower.includes('ref')) return 'ref';
  if (lower.includes('prev')) return 'prev';
  if (lower.includes('expost')) return 'expost';
  return null;
}

function parseExcelFormula(formula, rowToIndicatorMap, getCellValue = null) {
  if (!formula || typeof formula !== "string") return null;

  const f = formula.trim();
  if (!f.startsWith("=")) return null;

  const formulaContent = f.substring(1).trim();

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
      const sourceIndicatorId = rowToIndicatorMap.get(parseInt(match[4], 10));
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

  // CAS 3: K477 * IF(...) - AND avec référence cellule (SEARCH ou égalité)
  if (/^\$?[A-Z]+\$?\d+\s*\*\s*IF\s*\(/i.test(formulaContent)) {
    const refMatch = formulaContent.match(/^(\$?[A-Z]+\$?\d+)\s*\*/i);
    
    // Essayer d'abord avec SEARCH (contains)
    const searchMatch = formulaContent.match(/SEARCH\s*\(\s*"([^"]+)"\s*,\s*\$?([A-Z]+)\$?(\d+)/i);
    if (searchMatch) {
      const sourceIndicatorId = rowToIndicatorMap.get(parseInt(searchMatch[3], 10));
      if (sourceIndicatorId) {
        if (refMatch) {
          return {
            _referenceToMerge: refMatch[1],
            conditions: [{ type: "contains", excel_indicator_id: sourceIndicatorId, value: searchMatch[1] }],
          };
        }
        return { conditions: [{ type: "contains", excel_indicator_id: sourceIndicatorId, value: searchMatch[1] }] };
      }
    }

    // Sinon essayer avec égalité de chaîne (equals)
    const equalsMatch = formulaContent.match(/IF\s*\(\s*\$?([A-Z]+)\$?(\d+)\s*=\s*"([^"]+)"/i);
    if (equalsMatch) {
      const sourceIndicatorId = rowToIndicatorMap.get(parseInt(equalsMatch[2], 10));
      if (sourceIndicatorId) {
        if (refMatch) {
          return {
            _referenceToMerge: refMatch[1],
            conditions: [{ type: "equals", excel_indicator_id: sourceIndicatorId, value: equalsMatch[3] }],
          };
        }
        return { conditions: [{ type: "equals", excel_indicator_id: sourceIndicatorId, value: equalsMatch[3] }] };
      }
    }

    return null;
  }

  // CAS 4: IF(...) * IF(...) ou (IF(...))*(IF(...)) - AND entre plusieurs conditions
  // Ex: =IF($F$16="Oui",1,0)*IF(ISNUMBER(SEARCH("Diesel",$F$1089)),1,0)
  // Accepte aussi les parenthèses supplémentaires et ignore les #REF!
  if (/\(?IF\s*\([^)]+\)\)?\s*\*\s*\(?IF\s*\(/i.test(formulaContent)) {
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

  // CAS 5: IF(ISNUMBER(SEARCH...)) - contains simple
  if (/IF\s*\(\s*ISNUMBER\s*\(\s*SEARCH/i.test(formulaContent)) {
    // D'abord essayer avec une chaîne littérale: SEARCH("texte", $F$123) ou SEARCH("texte", 'Feuille'!$F$123)
    const literalMatch = formulaContent.match(/SEARCH\s*\(\s*"([^"]+)"\s*,\s*(?:['']([^'']+)['']!)?\$?([A-Z]+)\$?(\d+)/i);
    if (literalMatch) {
      const sheetName = literalMatch[2];
      const sourceSituation = extractSituationFromSheetName(sheetName);
      const sourceIndicatorId = rowToIndicatorMap.get(parseInt(literalMatch[4], 10));
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
      const sourceIndicatorId = rowToIndicatorMap.get(parseInt(cellRefMatch[6], 10));
      
      if (sourceIndicatorId) {
        // Lire la valeur directement depuis la cellule
        const searchValue = getCellValue(valueRow, valueColumn);
        if (searchValue !== null && searchValue !== undefined && searchValue !== '') {
          const condition = { 
            type: "contains", 
            excel_indicator_id: sourceIndicatorId,
            value: String(searchValue).trim()
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

  return null;
}

function resolveAllFormulas(formulasMap, rowToIndicatorMap, getCellValue = null, allSheetsData = null, allRowToIndicatorMaps = null, allFormulasMapsBySituation = null) {
  const resolvedConditions = new Map();
  const parseCache = new Map();
  
  // Cache des conditions résolues par situation (pour les références inter-feuilles)
  const resolvedBySituation = new Map();

  for (const [rowNum, formula] of formulasMap) {
    parseCache.set(rowNum, parseExcelFormula(formula, rowToIndicatorMap, getCellValue));
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

    const parsed = parseExcelFormula(formula, targetRowToIndicatorMap, targetGetCellValue);
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
        if (refCondition?.conditions) {
          // Ajouter sourceSituation à chaque condition
          const conditionsWithSource = refCondition.conditions.map(cond => ({
            ...cond,
            excel_indicator_situation: sourceSituation
          }));
          const result = { ...refCondition, conditions: conditionsWithSource };
          resolvedConditions.set(rowNum, result);
          return result;
        }
      }
      // Si on ne peut pas résoudre, on ignore
      resolvedConditions.set(rowNum, { _ignored: true });
      return { _ignored: true };
    }

    if (parsed._referenceToMerge) {
      const refRowNum = extractRowNumber(parsed._referenceToMerge);
      if (refRowNum) {
        const parentCondition = resolveCondition(refRowNum, new Set(visited));
        if (parentCondition?.conditions && parsed.conditions) {
          const result = { operator: "AND", conditions: [...parentCondition.conditions, ...parsed.conditions] };
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
          // Ajouter les conditions avec le flag negate si nécessaire
          for (const cond of refCondition.conditions) {
            allConditions.push({ ...cond, negate: negate ? !cond.negate : cond.negate });
          }
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

    // Récupérer la plage utilisée (inclut values, formulas, address par défaut)
    const usedRangeResponse = await fetch(
      `https://graph.microsoft.com/v1.0/sites/${site.id}/drive/items/${fileId}/workbook/worksheets/${encodeURIComponent(worksheetName)}/usedRange`,
      { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } }
    );

    if (!usedRangeResponse.ok) {
      const error = await usedRangeResponse.json();
      throw new Error(error.error?.message || "Cannot read worksheet used range");
    }

    const usedRangeData = await usedRangeResponse.json();
    return usedRangeData; // Contient: { values, formulas, address, ... }
  } catch (error) {
    console.error("Erreur lors de la récupération des données:", error);
    throw error;
  }
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
        if (formula && String(formula).startsWith("=")) {
          formulasMap.set(startRow + 1 + i, String(formula));
        }
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
            if (formula && String(formula).startsWith("=")) {
              sitFormulasMap.set(sheetData.startRow + 1 + i, String(formula));
            }
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
      console.log(`   ✅ ${parsedCount} formules parsées avec succès${ignoredCount > 0 ? `, ${ignoredCount} références inter-feuilles ignorées` : ''}`);
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

      // Récupérer la condition d'affichage résolue pour cette situation
      const rawCondition = resolvedConditions.get(excelRowNumber) || null;
      let display_condition_for_situation = null;
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

          const updatedDisplayCondition = { ...existingIndicator.display_condition };
          if (situation && display_condition_for_situation) updatedDisplayCondition[situation] = display_condition_for_situation;

          const newData = {
            indicator_category_id: category?._id,
            indicator_category_name: category?.name,
            indicator_sub_category_id: subCategory?._id,
            indicator_sub_category_name: subCategory?.name,
            name: row[2] || undefined,
            description: row[3] || undefined,
            value_possibilities:
              row[6] !== undefined && row[6] !== ""
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
            display_condition: updatedDisplayCondition,
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
              indicator_type: newData.value_type,
              indicator_value_possibilities: newData.value_possibilities || [],
              indicator_category_id: newData.indicator_category_id?.toString(),
              indicator_category_name: newData.indicator_category_name,
              indicator_sub_category_id: newData.indicator_sub_category_id?.toString(),
              indicator_sub_category_name: newData.indicator_sub_category_name,
              indicator_value_unit: newData.value_unit,
              display_condition: display_condition_for_situation,
            },
          });
        }

        if (!existingIndicator) {
          const valueDefault = situation && valueDefaultForSituation ? { [situation]: valueDefaultForSituation } : undefined;
          const displayCondition = situation && display_condition_for_situation ? { [situation]: display_condition_for_situation } : undefined;

          const indicatorData = {
            indicator_category_id: category?._id,
            indicator_category_name: category?.name,
            indicator_sub_category_id: subCategory?._id,
            indicator_sub_category_name: subCategory?.name,
            name: row[2] || undefined,
            description: row[3] || undefined,
            excel_indicator_id: row[4] || undefined,
            value_possibilities:
              row[6] !== undefined && row[6] !== ""
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
            display_condition: displayCondition,
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
        indicatorValueBulkOps.push({updateMany: { filter: { indicator_id: indicator_id, situation: sit },update: { $set: updateData }},
        });
      }
      const result = await IndicatorValue.bulkWrite(indicatorValueBulkOps);
      console.log(`✅ ${result.modifiedCount} indicator_values mis à jour (${indicatorValueUpdates.size} indicateurs/situations concernés)`);
    }

    let conditionsCount = 0;
    for (const [, condition] of resolvedConditions) {
      if (condition?.conditions?.length > 0) conditionsCount++;
    }
    console.log(`📋 ${conditionsCount} conditions d'affichage générées`);

    // if (logsToCreate.length > 0) {
    //   await Log.insertMany(logsToCreate);
    //   console.log(`📝 ${logsToCreate.length} logs créés`);
    // }
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

async function syncIndicatorValuesToExcel(excelFileId, collectivityId) {
  console.log(`\n🔄 Synchronisation des valeurs pour la collectivité ${collectivityId}...`);

  const token = await getAccessToken();

  // Récupérer le site SharePoint
  const siteResponse = await fetch(`https://graph.microsoft.com/v1.0/sites/${sharePointSiteName}.sharepoint.com`, {
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
  const site = await siteResponse.json();

  // Récupérer tous les indicator_values de cette collectivité
  const indicatorValues = await IndicatorValue.find({ collectivity_id: collectivityId });
  console.log(`📋 ${indicatorValues.length} indicator_values trouvés`);

  if (indicatorValues.length === 0) return console.log("⏭️ Aucune valeur à synchroniser");

  // Créer une map par situation et indicator_excel_id pour accès rapide
  const valuesMap = new Map();
  for (const iv of indicatorValues) {
    if (!iv.indicator_excel_id || !iv.situation) continue;
    const key = `${iv.situation}|${iv.indicator_excel_id}`;
    valuesMap.set(key, iv);
  }

  let totalUpdated = 0;

  for (const { name: worksheetName, situation } of WORKSHEETS) {
    console.log(`\n📄 Traitement de la feuille "${worksheetName}" (${situation})...`);

    // Lire la plage utilisée de la feuille
    const usedRangeResponse = await fetch(`https://graph.microsoft.com/v1.0/sites/${site.id}/drive/items/${excelFileId}/workbook/worksheets/${encodeURIComponent(worksheetName)}/usedRange`, { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } });

    if (!usedRangeResponse.ok) continue;

    const usedRange = await usedRangeResponse.json();
    const rows = usedRange.values || [];
    const startRow = usedRange.address ? parseInt(usedRange.address.match(/\d+/)?.[0] || 1) : 1;

    let updatedInSheet = 0;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const excelIndicatorId = row[4]; // Colonne E - ID indicateur
      if (!excelIndicatorId) continue;

      const key = `${situation}|${String(excelIndicatorId).trim()}`;
      const indicatorValue = valuesMap.get(key);
      if (!indicatorValue) continue;

      const formattedValue = formatIndicatorValue(indicatorValue);

      if (formattedValue === null) continue;

      const currentValue = row[5] || ""; // Colonne F - Valeur actuelle

      // Ne mettre à jour que si la valeur a changé
      if (String(currentValue) !== formattedValue) {
        console.log(`🔄 Mise à jour de la valeur pour la ligne ${i}: "${formattedValue}"`);
        const rowNumber = startRow + i;
        const response = await fetch(`https://graph.microsoft.com/v1.0/sites/${site.id}/drive/items/${excelFileId}/workbook/worksheets/${encodeURIComponent(worksheetName)}/range(address='F${rowNumber}')`, {
          method: "PATCH",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ values: [[formattedValue]] }),
        });

        if (response.ok) {
          updatedInSheet++;
        } else {
          console.log(`   ❌ Erreur ligne ${rowNumber}`);
        }
      }
    }

    if (updatedInSheet > 0) {
      console.log(`   📊 ${updatedInSheet} valeurs mises à jour`);
      totalUpdated += updatedInSheet;
    }
  }

  console.log(`\n✅ Synchronisation terminée: ${totalUpdated} valeurs mises à jour au total`);
}

async function duplicateMasterExcel(collectivityName) {
  console.log(`\n📋 Duplication du fichier master pour "${collectivityName}"...`);

  const token = await getAccessToken();

  // Récupérer le site SharePoint
  const siteResponse = await fetch(`https://graph.microsoft.com/v1.0/sites/${sharePointSiteName}.sharepoint.com`, {
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
  const site = await siteResponse.json();

  // Récupérer les infos du fichier master
  const masterFileResponse = await fetch(`https://graph.microsoft.com/v1.0/sites/${site.id}/drive/items/${masterFileId}`, {
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
  const masterFile = await masterFileResponse.json();
  const parentFolderId = masterFile.parentReference.id;

  // Extraire la version du nom du master (ex: "Calcul des actions_V10.xlsx" → "V10")
  const masterFileName = masterFile.name.replace(".xlsx", "");
  const versionMatch = masterFileName.match(/_V(\d+)$/);
  const version = versionMatch ? `_V${versionMatch[1]}` : "";

  // Dupliquer le fichier avec le nom de la collectivité + version
  const newFileName = `${collectivityName}${version}.xlsx`;
  console.log(`📄 Nouveau fichier: ${newFileName}`);

  const copyResponse = await fetch(`https://graph.microsoft.com/v1.0/sites/${site.id}/drive/items/${masterFileId}/copy`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      parentReference: { id: parentFolderId },
      name: newFileName,
    }),
  });

  if (!copyResponse.ok && copyResponse.status !== 202) {
    const error = await copyResponse.json();
    throw new Error(error.error?.message || "Erreur lors de la duplication");
  }

  // La copie est asynchrone, on attend un peu puis on cherche le fichier
  console.log("⏳ Copie en cours...");
  await new Promise((resolve) => setTimeout(resolve, 3000));

  // Chercher le fichier créé
  const filesResponse = await fetch(`https://graph.microsoft.com/v1.0/sites/${site.id}/drive/items/${parentFolderId}/children`, {
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
  const filesData = await filesResponse.json();
  const newFile = filesData.value.find((f) => f.name === newFileName);

  if (!newFile) {
    throw new Error(`Fichier "${newFileName}" non trouvé après duplication`);
  }

  console.log(`✅ Fichier créé: ${newFile.name} (ID: ${newFile.id})`);
  return newFile.id;
}

async function generateExcelForAllCollectivities() {
  console.log("\n📊 Génération des  Excel pour toutes les collectivités...");

  const collectivities = await Collectivity.find({ name: "TestCollectivity" });
  console.log(`📋 ${collectivities.length} collectivités trouvées`);

  for (const collectivity of collectivities) {
    console.log(`\n🏙️ Traitement de "${collectivity.name}"...`);

    try {
      // 1. Dupliquer le master Excel
      const newExcelFileId = await duplicateMasterExcel(collectivity.name);

      // 2. Synchroniser les valeurs vers le nouveau fichier Excel
      await syncIndicatorValuesToExcel(newExcelFileId, collectivity._id.toString());

      // 3. Mettre à jour la collectivité avec le nouvel excelFileId
      await Collectivity.findByIdAndUpdate(collectivity._id, { excelFileId: newExcelFileId });
      console.log(`✅ Collectivité "${collectivity.name}" mise à jour avec excelFileId: ${newExcelFileId}`);
    } catch (error) {
      console.error(`❌ Erreur pour "${collectivity.name}":`, error.message);
    }
  }

  console.log("\n🎉 Génération terminée pour toutes les collectivités!");
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
      console.log("\n🎉 Toutes les feuilles ont été traitées avec succès!");

      // // Étape 2: Générer les fichiers Excel pour toutes les collectivités
      // await generateExcelForAllCollectivities();

      process.exit(0);
    } catch (error) {
      console.error("\n❌ Échec du script:", error.message);
      process.exit(1);
    }
  })();
}

module.exports = { createIndicatorsFromExcel, getWorksheetUsedRange, syncIndicatorValuesToExcel, duplicateMasterExcel, generateExcelForAllCollectivities };
