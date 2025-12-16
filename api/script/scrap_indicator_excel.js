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

    // Récupérer la plage utilisée de la feuille de calcul
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

async function createIndicatorsFromExcel(situation, worksheetName) {
  try {
    const data = await getWorksheetUsedRange(masterFileId, worksheetName);

    // La première ligne contient les en-têtes, on la skip
    const dataRows = data.values.slice(1);

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

      // Skip les lignes sans excel_indicator_id
      if (!row[4] || row[4] === "") continue;

      // Vérifier si l'indicateur existe déjà (depuis le cache)
      const existingIndicator = indicatorsMap.get(row[4]);

      let category = null;
      let subCategory = null;
      let action = null;

      if (row[0] !== "") {
        const categoryName = row[0];
        category = principalCategoriesMap.get(categoryName);
        if (!category) {
          // Créer seulement si pas dans le cache (1 seule création par catégorie)
          category = await IndicatorCategory.create({ name: categoryName, type: "principal" });
          principalCategoriesMap.set(categoryName, category); // Mettre en cache
          newPrincipalCategories.set(categoryName, category);
        }
      }

      // Utiliser le cache pour les sous-catégories
      if (row[1] !== "" && category) {
        const subCategoryKey = `${row[1]}|${category._id}`;
        subCategory = subCategoriesMap.get(subCategoryKey);
        if (!subCategory) {
          // Créer seulement si pas dans le cache (1 seule création par sous-catégorie)
          subCategory = await IndicatorCategory.create({
            name: row[1],
            type: "sub",
            principal_category_id: category._id,
            principal_category_name: category.name,
          });
          subCategoriesMap.set(subCategoryKey, subCategory); // Mettre en cache
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

        // Parse colonne P (index 15) - "Affichage conditionnel"
        // Format: "LogChantChoix = Valeur1, LogChantAccDirTC16 = Valeur2"
        let display_conditions = [];
        const displayConditionRaw = row[15];
        if (displayConditionRaw && displayConditionRaw !== "") {
          const conditions = String(displayConditionRaw).split(",");
          for (const condition of conditions) {
            const equalIndex = condition.indexOf("=");
            if (equalIndex !== -1) {
              const indicator_excel_id = condition.substring(0, equalIndex).trim();
              const value = condition.substring(equalIndex + 1).trim();
              if (indicator_excel_id && value) {
                display_conditions.push({ indicator_excel_id, value });
              }
            }
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
                : [],
            value_default: updatedValueDefault,
            value_unit: row[8] || undefined,
            value_type: valueType,
            linked_action_id: action?._id,
            linked_action_name: action?.name,
            presence_in_excel: updatedPresenceInExcel,
            display_conditions,
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
            "display_conditions",
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

          // Préparer la mise à jour des IndicatorValues liés
          indicatorValueUpdates.set(existingIndicator._id.toString(), {
            indicator_name: newData.name,
            indicator_type: newData.value_type,
            indicator_value_possibilities: newData.value_possibilities || [],
            indicator_category_id: newData.indicator_category_id?.toString(),
            indicator_category_name: newData.indicator_category_name,
            indicator_sub_category_id: newData.indicator_sub_category_id?.toString(),
            indicator_sub_category_name: newData.indicator_sub_category_name,
            indicator_value_unit: newData.value_unit,
            display_conditions: newData.display_conditions || [],
          });
        }
        if (!existingIndicator) {
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
                : [],
            value_default: valueDefault,
            value_unit: row[8] || undefined,
            value_type: valueType,
            linked_action_id: action?._id,
            linked_action_name: action?.name,
            presence_in_excel: situation ? { [situation]: true } : undefined,
            display_conditions,
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

    // Mettre à jour les IndicatorValues liés aux indicateurs modifiés
    if (indicatorValueUpdates.size > 0) {
      const indicatorValueBulkOps = [];
      for (const [indicatorId, updateData] of indicatorValueUpdates) {
        indicatorValueBulkOps.push({ updateMany: { filter: { indicator_id: indicatorId }, update: { $set: updateData } } });
      }
      const result = await IndicatorValue.bulkWrite(indicatorValueBulkOps);
      console.log(`✅ ${result.modifiedCount} indicator_values mis à jour (${indicatorValueUpdates.size} indicateurs concernés)`);
    }

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

        if (!response.ok) console.log(`   ❌ Erreur ligne ${rowNumber}`);
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

      // Étape 1: Mettre à jour les indicateurs dans MongoDB depuis le master Excel
      for (const { worksheetName, situation } of worksheetsToProcess) {
        console.log(`\n🔄 Traitement de la feuille "${worksheetName}" (situation: ${situation})...`);
        await createIndicatorsFromExcel(situation, worksheetName);
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
