const { getAccessToken } = require("../src/services/microsoftGraph");
const Indicator = require("../src/models/indicator");
const IndicatorCategory = require("../src/models/indicator_category");
const Action = require("../src/models/action");
const Log = require("../src/models/log");
const mongoose = require("mongoose");
const config = require("../src/config");

const sharePointSiteName = "selegobv";
const fileId = "01IBL4ADM2GGWQITUEAZDYF3Y4Q66XTJB7";

// Fonction helper pour formater les valeurs de log selon leur type
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

async function getWorksheetUsedRange(fileId, worksheetName) {
  try {
    const token = await getAccessToken();

    // Récupérer les informations du site SharePoint
    const siteResponse = await fetch(`https://graph.microsoft.com/v1.0/sites/${sharePointSiteName}.sharepoint.com`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    if (!siteResponse.ok) {
      const error = await siteResponse.json();
      throw new Error(error.error?.message || "Site SharePoint not found");
    }

    const site = await siteResponse.json();

    // Récupérer la plage utilisée de la feuille de calcul
    const usedRangeResponse = await fetch(`https://graph.microsoft.com/v1.0/sites/${site.id}/drive/items/${fileId}/workbook/worksheets/${worksheetName}/usedRange`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
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

async function createIndicatorsFromExcel(situation, worksheetName) {
  try {
    await mongoose.connect(config.MONGODB_ENDPOINT);
    const data = await getWorksheetUsedRange(fileId, worksheetName);

    // La première ligne contient les en-têtes, on la skip
    const dataRows = data.values.slice(1); // Toutes les lignes sauf la première

    // Charger toutes les catégories principales
    const allPrincipalCategories = await IndicatorCategory.find({
      type: "principal",
    });
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

    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];

      // Skip les lignes vides
      if (!row || row.length === 0 || !row[4]) continue;

      // Vérifier si l'indicateur existe déjà (depuis le cache)
      const existingIndicator = indicatorsMap.get(row[4]);

      let category = null;
      let subCategory = null;
      let action = null;

      if (row[0] !== "") {
        category = principalCategoriesMap.get(row[0]);
        if (!category) {
          category = newPrincipalCategories.get(row[0]);
          if (!category) {
            category = { _id: new mongoose.Types.ObjectId(), name: row[0], type: "principal" };
            newPrincipalCategories.set(row[0], category);
          }
        }
      }

      if (row[1] !== "" && category) {
        const subCatKey = `${row[1]}|${category._id}`;
        subCategory = subCategoriesMap.get(subCatKey);
        if (!subCategory) {
          subCategory = newSubCategories.get(subCatKey);
          if (!subCategory) {
            subCategory = {
              _id: new mongoose.Types.ObjectId(),
              name: row[1],
              type: "sub",
              principal_category_id: category._id,
              principal_category_name: category.name,
            };
            newSubCategories.set(subCatKey, subCategory);
          }
        }
      }

      if (row[12] !== "") {
        action = actionsMap.get(row[12]);
        if (!action) continue;
      }

      try {
        const valueType = row[9] || undefined;
        const defaultValueRaw = row[7] || undefined;

        let valueDefaultForSituation = undefined;
        if (defaultValueRaw !== undefined && defaultValueRaw !== "" && valueType) {
          if (valueType === "number") valueDefaultForSituation = { [valueType]: parseFloat(defaultValueRaw) || undefined };
          if (valueType === "text") valueDefaultForSituation = { [valueType]: String(defaultValueRaw).trim() || undefined };
          if (valueType === "radio") valueDefaultForSituation = { [valueType]: String(defaultValueRaw).trim() || undefined };
          if (valueType === "checkbox")
            valueDefaultForSituation = {
              [valueType]:
                String(defaultValueRaw)
                  .split(",")
                  .map((v) => v.trim())
                  .filter((v) => v !== "") || undefined,
            };
        }

        // Parse colonne P (index 15) - "Affichage conditionnel"
        // Format: "LogChantChoix = Proposer un ordre de grandeur commun..."
        let display_indicator_excel_id = undefined;
        let display_condition_indicator_value = undefined;
        const displayConditionRaw = row[15];
        if (displayConditionRaw && displayConditionRaw !== "") {
          const equalIndex = String(displayConditionRaw).indexOf("=");
          if (equalIndex !== -1) {
            display_indicator_excel_id = String(displayConditionRaw).substring(0, equalIndex).trim() || undefined;
            display_condition_indicator_value =
              String(displayConditionRaw)
                .substring(equalIndex + 1)
                .trim() || undefined;
          }
        }

        if (existingIndicator) {
          // Mettre à jour la valeur par défaut pour cette situation
          const updatedValueDefault = { ...existingIndicator.value_default };
          if (situation && valueDefaultForSituation) updatedValueDefault[situation] = valueDefaultForSituation;

          // Mettre à jour la présence pour cette situation
          const updatedPresenceInExcel = { ...existingIndicator.presence_in_excel };
          if (situation) updatedPresenceInExcel[situation] = true;

          // Préparer les nouvelles valeurs
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
                : undefined,
            value_default: updatedValueDefault,
            value_unit: row[8] || undefined,
            value_type: valueType,
            linked_action_id: action?._id,
            linked_action_name: action?.name,
            presence_in_excel: updatedPresenceInExcel,
            display_indicator_excel_id,
            display_condition_indicator_value,
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
            "display_indicator_excel_id",
            "display_condition_indicator_value",
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
        } else {
          const valueDefault = situation && valueDefaultForSituation ? { [situation]: valueDefaultForSituation } : undefined;

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
                : undefined,
            value_default: valueDefault,
            value_unit: row[8] || undefined,
            value_type: valueType,
            linked_action_id: action?._id,
            linked_action_name: action?.name,
            presence_in_excel: situation ? { [situation]: true } : undefined,
            display_indicator_excel_id,
            display_condition_indicator_value,
          };

          indicators.push(indicatorData);

          // Créer un log pour la création de l'indicateur
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

    if (newPrincipalCategories.size > 0) {
      console.log(`🔄 Création de ${newPrincipalCategories.size} nouvelles catégories principales...`);
      await IndicatorCategory.insertMany(Array.from(newPrincipalCategories.values()));
    }

    if (newSubCategories.size > 0) {
      console.log(`🔄 Création de ${newSubCategories.size} nouvelles sous-catégories...`);
      await IndicatorCategory.insertMany(Array.from(newSubCategories.values()));
    }

    if (indicators.length > 0) {
      await Indicator.insertMany(indicators);
      console.log(`✅ ${indicators.length} nouveaux indicateurs créés`);
    }

    if (bulkUpdateOps.length > 0) {
      await Indicator.bulkWrite(bulkUpdateOps);
      console.log(`✅ ${bulkUpdateOps.length} indicateurs mis à jour`);
    }

    if (logsToCreate.length > 0) {
      await Log.insertMany(logsToCreate);
      console.log(`📝 ${logsToCreate.length} logs créés`);
    }
  } catch (error) {
    console.error("❌ Erreur:", error.message);
    throw error;
  }
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
      for (const { worksheetName, situation } of worksheetsToProcess) {
        console.log(`\n🔄 Traitement de la feuille "${worksheetName}" (situation: ${situation})...`);
        await createIndicatorsFromExcel(situation, worksheetName);
        console.log(`✅ Feuille "${worksheetName}" traitée avec succès!`);
      }
      console.log("\n🎉 Toutes les feuilles ont été traitées avec succès!");
      process.exit(0);
    } catch (error) {
      console.error("\n❌ Échec du script:", error.message);
      process.exit(1);
    }
  })();
}

module.exports = { createIndicatorsFromExcel, getWorksheetUsedRange };
