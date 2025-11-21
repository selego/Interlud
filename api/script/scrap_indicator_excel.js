const { getAccessToken } = require("../src/services/microsoftGraph");
const Indicator = require("../src/models/indicator");
const IndicatorCategory = require("../src/models/indicator_category");
const Action = require("../src/models/action");
const mongoose = require("mongoose");
const config = require("../src/config");

const sharePointSiteName = "selegobv";
const fileId = "01IBL4ADO73TUHKGZ4EJCJATFUR357PVU4";
const worksheetName = "Remplissage - Sit. Init.";

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
    const usedRangeResponse = await fetch(
      `https://graph.microsoft.com/v1.0/sites/${site.id}/drive/items/${fileId}/workbook/worksheets/${worksheetName}/usedRange`,
      {
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      }
    );

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

async function createIndicatorsFromExcel() {
  try {
    await mongoose.connect(config.MONGODB_ENDPOINT);
    const data = await getWorksheetUsedRange(fileId, worksheetName);
    
    // La première ligne contient les en-têtes, on la skip
    const dataRows = data.values.slice(1); // Toutes les lignes sauf la première
    
    const indicators = [];
    for (let i = 0; i < 2; i++) {
      const row = dataRows[i];

      if (row[4] || row[4] === "") {
        if (await Indicator.findOne({ value_name: row[4] })) continue;
      }

      let category = null;
      let subCategory = null;
      let action = null;

      if (row[0] !== "") {
      category = await IndicatorCategory.findOne({ name: row[0], type: "principal" });
      if (!category) category = await IndicatorCategory.create({ name: row[0], type: "principal" });
      }

      if (row[1] !== "") {
      subCategory = await IndicatorCategory.findOne({ name: row[1], type: "sub", principal_category_id: category._id });
      if (!subCategory) subCategory = await IndicatorCategory.create({ name: row[1], type: "sub", principal_category_id: category._id, principal_category_name: category.name });
      }

      if (row[12] !== "") {
      action = await Action.findOne({ excel_sheet_name: row[12] });
      if (!action) continue;
      }

      try {
        const valueType = row[9] || undefined;
        const defaultValueRaw = row[7] || undefined;
        
        let valueDefault = undefined;
        if (defaultValueRaw !== undefined && defaultValueRaw !== "") {
          if (valueType === "number") valueDefault = { init: { [valueType]: parseFloat(defaultValueRaw) } };
            if (valueType === "text") valueDefault = { init: { [valueType]: String(defaultValueRaw).trim() } };
            if (valueType === "radio" || valueType === "checkbox") valueDefault = { init: { [valueType]: String(defaultValueRaw).split(',').map(v => v.trim()).filter(v => v !== '') } };
          }

        const indicatorData = new Indicator({
          indicator_category_id: category?._id,
          indicator_category_name: category?.name,
          indicator_sub_category_id: subCategory?._id,
          indicator_sub_category_name: subCategory?.name,
          name: row[2] || undefined, // "Titre"
          description: row[3] || undefined, // "Description"
          excel_indicator_id: row[4] || undefined, // "ID de la variable"
          //value: row[5] || '', // "Valeur"
          value_possibilities: row[6] ? row[6].split(',').map(v => v.trim()).filter(v => v !== '') : undefined, // "Valeurs possibles"
          value_default: valueDefault, // "Valeur par défaut" dans init[value_type]
          value_unit: row[8] || undefined, // "Unité"
          value_type: valueType, // "Type"
          linked_action_id: action?._id,
          linked_action_name: action?.name,
        //   display_order: row[10] || 0, // "Affichage"
        //   comment: row[11] || '', // "Commentaire"
        //   display_on_creation: row[13] || 0, // "Affichage à la création"
        //   is_critical: row[14] || '', // "Donnée \"critique\""
      });
        
        indicators.push(indicatorData);
      } catch (error) {
        console.error(`❌ Erreur ligne ${i + 2}:`, error.message);
      }
    }
    await Indicator.insertMany(indicators);

  } catch (error) {
    console.error("❌ Erreur:", error.message);
    throw error;
  }
}

if (require.main === module) {
  createIndicatorsFromExcel()
    .then(() => {
      console.log("\n✅ Script terminé avec succès!");
    })
    .catch((error) => {
      console.error("\n❌ Échec du script:", error.message);
      process.exit(1);
    });
}

module.exports = { createIndicatorsFromExcel, getWorksheetUsedRange };