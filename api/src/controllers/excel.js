const express = require("express");
const router = express.Router();
const passport = require("passport");
const { capture } = require("../services/sentry");
const { readExcelCells, exportExcelFile, exportExcelFileWithSpecificSheets, importSheetsToExcelFile } = require("../services/microsoftGraph");
const Indicator = require("../models/indicator");
const IndicatorValue = require("../models/indicator_value");
const Log = require("../models/log");

const SITUATION_SHEETS = [
  { sheetName: "Remplissage - Sit. Init.", situation: "init" },
  { sheetName: "Remplissage - Sit. Ref.", situation: "ref" },
  { sheetName: "Remplissage - Sit. Prev.", situation: "prev" },
  { sheetName: "Remplissage - Sit. Expost", situation: "expost" },
];

const FIXED_RANGES = [
  { name: "gains_environnementaux", range: "C13:H18" },
  { name: "emissions_GES", range: "E26:H29" },
  { name: "emissions_PM", range: "J26:M29" },
  { name: "emissions_NOx", range: "O26:R29" },
  { name: "emissions_HC", range: "T26:W29" },
  { name: "emissions_CO", range: "Y26:AB29" },
  { name: "emissions_Energie", range: "AD26:AG29" },
  { name: "calculs_Surface_de_la_ZFE", range: "E39:H41" },
  { name: "calculs_Seuil_de_la_ZFE", range: "K39:N41" },
  { name: "calculs_Part_des_distance_effectuée_dans_la_ZFE", range: "P39:S41" },
];

router.post("/values", async (req, res) => {
  try {
    const { worksheetName, excelFileId } = req.body;
    if (!worksheetName) return res.json({ ok: false, data: { error: "worksheetName is required" } });
    if (!excelFileId) return res.json({ ok: false, data: { error: "excelFileId is required" } });

    const ranges = await Promise.all(
      FIXED_RANGES.map(async (descriptor) => {
        const result = await readExcelCells(excelFileId, worksheetName, descriptor.range);
        return { name: descriptor.name, values: result.values || [] };
      })
    );
    res.json({ ok: true, data: ranges });
  } catch (error) {
    capture(error);
    res.json({ ok: false, data: { error: error.message } });
  }
});

router.post("/export", async (req, res) => {
  try {
    const { fileId } = req.body;
    if (!fileId) return res.json({ ok: false, data: { error: "fileId is required" } });
    const result = await exportExcelFile(fileId);
    res.json({ ok: true, data: result });
  } catch (error) {
    capture(error);
    res.json({ ok: false, data: { error: error.message } });
  }
});

router.post("/importIndicatorValues", passport.authenticate(["admin", "user"], { session: false, failWithError: true }), async (req, res) => {
  try {
    const { fileBase64, collectivity } = req.body;
    if (!fileBase64) return res.status(400).json({ ok: false, data: { error: "fileBase64 is required" } });
    if (!collectivity) return res.status(400).json({ ok: false, data: { error: "collectivity is required" } });

    const fileBuffer = Buffer.from(fileBase64, "base64");

    const { extractedData } = await importSheetsToExcelFile(collectivity.excelFileId, fileBuffer, SITUATION_SHEETS);
    if (!extractedData || extractedData.length === 0) return res.status(200).json({ ok: true });

    console.log(extractedData);

    const indicators = await Indicator.find({ excel_indicator_id: { $in: [...new Set(extractedData.map((d) => d.excel_indicator_id))] } });
    const indicatorMap = new Map(indicators.map((ind) => [ind.excel_indicator_id, ind]));

    const indicatorValues = await IndicatorValue.find({
      indicator_id: { $in: indicators.map((ind) => ind._id.toString()) },
      collectivity_id: collectivity._id,
      situation: { $in: [...new Set(extractedData.map((d) => d.situation))] },
    });

    const indicatorValueMap = new Map();
    for (const iv of indicatorValues) {
      const key = `${iv.indicator_id}_${iv.situation}`;
      if (!indicatorValueMap.has(key)) indicatorValueMap.set(key, []);
      indicatorValueMap.get(key).push(iv);
    }

    const bulkOps = [];
    const logs = [];

    for (const data of extractedData) {
      const indicator = indicatorMap.get(data.excel_indicator_id);
      if (!indicator) continue;

      const matchingValues = indicatorValueMap.get(`${indicator._id.toString()}_${data.situation}`) || [];

      for (const indicatorValue of matchingValues) {
        if (indicatorValue.indicator_type === "number") data.value = isNaN(parseFloat(data.value)) ? null : parseFloat(data.value);
        if (indicatorValue.indicator_type === "checkbox") {
          const strValue = data.value != null ? String(data.value) : "";
          data.value = strValue
            .split(/[,;.]/)
            .map((v) => v.trim())
            .filter((v) => v);
        }
        if (indicatorValue.indicator_type === "radio" || indicatorValue.indicator_type === "text") data.value = data.value != null ? String(data.value).trim() : "";

        const oldValue = indicatorValue.value?.[indicatorValue.indicator_type];
        if (JSON.stringify(oldValue) === JSON.stringify(data.value)) continue;

        const newLogType = Array.isArray(data.value) ? "array" : typeof data.value;
        const oldLogType = Array.isArray(oldValue) ? "array" : typeof oldValue;
        logs.push(
          new Log({
            model_name: "indicator_value",
            name: indicator.name,
            field: "value",
            operation: "update",
            new_value: { [newLogType]: data.value },
            previous_value: { [oldLogType]: oldValue },
            type_value: newLogType,
            date: new Date(),
            user_id: req.user.id,
            user_name: req.user.name,
            user_email: req.user.email,
            collectivity_id: indicatorValue.collectivity_id,
            collectivity_name: indicatorValue.collectivity_name,
            action_id: indicatorValue.action_id,
            action_name: indicatorValue.action_name,
            indicator_id: indicatorValue.indicator_id,
            indicator_name: indicatorValue.indicator_name,
            indicator_value_id: indicatorValue._id.toString(),
            indicator_value_name: indicatorValue.name,
          })
        );
        bulkOps.push({ updateOne: { filter: { _id: indicatorValue._id }, update: { $set: { [`value.${indicatorValue.indicator_type}`]: data.value } } } });
      }
    }

    if (bulkOps.length > 0) await IndicatorValue.bulkWrite(bulkOps);
    if (logs.length > 0) await Log.insertMany(logs);

    res.status(200).json({ ok: true });
  } catch (error) {
    capture(error);
    res.status(500).json({ ok: false, data: { error: error.message } });
  }
});

router.post("/webhook", async (req, res) => {
  try {
    // Validation initiale du webhook par Microsoft Graph
    // Docs: https://learn.microsoft.com/fr-fr/graph/change-notifications-delivery-webhooks
    const validationToken = req.query.validationToken;

    if (validationToken) {
      console.log("Validation webhook reçue");
      return res.status(200).send(validationToken);
    }

    // Afficher toutes les données de la notification
    console.log("=== WEBHOOK NOTIFICATION ===");
    console.log(JSON.stringify(req.body, null, 2));
    console.log("===========================");

    return res.status(202).send();
  } catch (error) {
    capture(error);
    res.status(500).send();
  }
});

module.exports = router;
