const express = require("express");
const router = express.Router();
const passport = require("passport");
const Action = require("../models/action");
const IndicatorValue = require("../models/indicator_value");
const ERROR_CODES = require("../utils/errorCodes");
const { capture } = require("../services/sentry");
const Log = require("../models/log");
const Indicator = require("../models/indicator");

router.get("/:id", passport.authenticate(["admin", "user"], { session: false, failWithError: true }), async (req, res) => {
  try {
    const action = await Action.findById(req.params.id);
    if (!action) return res.status(404).send({ ok: false, code: ERROR_CODES.NOT_FOUND });

    return res.status(200).send({ ok: true, data: action });
  } catch (error) {
    capture(error);
    return res.status(500).send({ ok: false, code: ERROR_CODES.SERVER_ERROR });
  }
});

router.put("/:id", passport.authenticate(["admin", "user"], { session: false, failWithError: true }), async (req, res) => {
  try {
    const action = await Action.findById(req.params.id);
    if (!action) return res.status(404).send({ ok: false, code: ERROR_CODES.NOT_FOUND });

    action.last_modif_by_id = req.user._id;
    action.last_modif_by_name = req.user.name;
    action.last_modif_date = new Date();
    await action.save();

    const logs = [];
    for (const field of Object.keys(req.body)) {
      if (["updatedAt", "__v", "createdAt", "_id", "last_modif_by_name", "last_modif_date", "last_modif_by_id"].includes(field)) continue;
      let newValue = req.body[field];
      const originalValue = action[field];

      if (originalValue instanceof Date && typeof newValue === "string") newValue = new Date(newValue);

      if (JSON.stringify(newValue) === JSON.stringify(originalValue)) continue;

      let logType = typeof newValue;
      if (newValue instanceof Date) logType = "date";
      if (Array.isArray(newValue)) logType = "array";

      logs.push(
        new Log({
          model_name: "action",
          name: action.name,
          field: field,
          operation: "update",
          new_value: { [logType]: newValue },
          previous_value: { [logType]: originalValue },
          type_value: logType,
          date: new Date(),
          user_id: req.user._id,
          user_name: req.user.name,
          user_email: req.user.email,
          action_id: action._id,
          action_name: action.name,
          collectivity_id: action.collectivity_id,
          collectivity_name: action.collectivity_name,
        })
      );
    }

    action.set(req.body);
    await action.save();
    if (logs.length > 0) await Log.insertMany(logs);
    return res.status(200).send({ ok: true, data: action });
  } catch (error) {
    capture(error);
    return res.status(500).send({ ok: false, code: ERROR_CODES.SERVER_ERROR });
  }
});

router.post("/search", passport.authenticate(["admin", "user"], { session: false, failWithError: true }), async (req, res) => {
  try {
    let query = {};

    if (req.body.type) query.type = req.body.type;
    if (req.body.collectivity_id) query.collectivity_id = req.body.collectivity_id;
    if (req.body.status) query.status = req.body.status;
    if (req.body.search) query.name = { $regex: req.body.search, $options: "i" };
    if (req.body.createdAt) query.createdAt = { $gte: new Date(req.body.createdAt) };
    const limit = req.body.limit || 50;
    const skip = req.body.offset || 0;
    const total = await Action.countDocuments(query);
    const data = await Action.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit);
    return res.status(200).send({ ok: true, data, total });
  } catch (error) {
    capture(error);
    return res.status(500).send({ ok: false, code: ERROR_CODES.SERVER_ERROR });
  }
});

router.post("/", passport.authenticate(["admin", "user"], { session: false, failWithError: true }), async (req, res) => {
  try {
    if (!req.body.name) return res.status(400).send({ ok: false, code: ERROR_CODES.INVALID_BODY });
    const action = await Action.create(req.body);
    if (!action) return res.status(400).send({ ok: false, code: ERROR_CODES.INVALID_BODY });

    await Log.create({
      model_name: "action",
      name: action.name,
      operation: "add",
      date: new Date(),
      user_id: req.user._id,
      user_name: req.user.name,
      user_email: req.user.email,
      action_id: action._id,
      action_name: action.name,
      collectivity_id: action.collectivity_id,
      collectivity_name: action.collectivity_name,
    });

    return res.status(200).send({ ok: true, data: action });
  } catch (error) {
    capture(error);
    return res.status(500).send({ ok: false, code: ERROR_CODES.SERVER_ERROR });
  }
});

router.post("/create_action_with_default_indicators", passport.authenticate(["admin", "user"], { session: false, failWithError: true }), async (req, res) => {
  try {
    if (!req.body.name) return res.status(400).send({ ok: false, code: ERROR_CODES.INVALID_BODY });
    if (!req.body.action_parent_id) return res.status(400).send({ ok: false, code: ERROR_CODES.INVALID_BODY });

    const parentAction = await Action.findById(req.body.action_parent_id);
    if (!parentAction) return res.status(404).send({ ok: false, code: ERROR_CODES.NOT_FOUND });

    const action = await Action.create({ ...req.body, excel_worksheetname: parentAction.excel_worksheetname });
    if (!action) return res.status(400).send({ ok: false, code: ERROR_CODES.INVALID_BODY });

    const indicators = await Indicator.find({ linked_action_id: parentAction._id });

    const allSituations = ["init", "ref", "prev", "expost"];
    const createdIndicatorValues = [];

    for (const indicator of indicators) {
      const situationsForIndicator = allSituations.filter((situation) => indicator.presence_in_excel?.[situation] === true);
      for (const situation of situationsForIndicator) {
        const defaultValue = indicator.value_default?.[situation]?.[indicator.value_type] ?? null;
        const indicatorValue = {
          action_id: action._id,
          action_name: action.name,
          collectivity_id: action.collectivity_id,
          collectivity_name: action.collectivity_name,
          indicator_id: indicator._id,
          indicator_name: indicator.name,
          indicator_type: indicator.value_type,
          situation,
          indicator_value_unit: indicator.value_unit,
          value_default: { [indicator.value_type]: defaultValue },
          indicator_value_possibilities: indicator.value_possibilities || [],
          indicator_category_id: indicator.indicator_category_id,
          indicator_category_name: indicator.indicator_category_name,
          indicator_sub_category_id: indicator.indicator_sub_category_id,
          indicator_sub_category_name: indicator.indicator_sub_category_name,
        };
        createdIndicatorValues.push(indicatorValue);
      }
    }
    if (createdIndicatorValues.length > 0) await IndicatorValue.insertMany(createdIndicatorValues);

    await Log.create({
      model_name: "action",
      name: action.name,
      operation: "add",
      date: new Date(),
      user_id: req.user._id,
      user_name: req.user.name,
      user_email: req.user.email,
      action_id: action._id,
      action_name: action.name,
      collectivity_id: action.collectivity_id,
      collectivity_name: action.collectivity_name,
    });

    return res.status(200).send({ ok: true, data: action });
  } catch (error) {
    capture(error);
    return res.status(500).send({ ok: false, code: ERROR_CODES.SERVER_ERROR });
  }
});

router.delete("/:id", passport.authenticate(["admin", "user"], { session: false, failWithError: true }), async (req, res) => {
  try {
    const action = await Action.findOne({ _id: req.params.id });
    if (!action) return res.status(404).send({ ok: false, code: ERROR_CODES.NOT_FOUND });

    await Log.create({
      model_name: "action",
      name: action.name,
      operation: "delete",
      date: new Date(),
      user_id: req.user._id,
      user_name: req.user.name,
      user_email: req.user.email,
      action_id: action._id,
      action_name: action.name,
      collectivity_id: action.collectivity_id,
      collectivity_name: action.collectivity_name,
    });

    await Action.deleteOne({ _id: req.params.id });

    return res.status(200).send({ ok: true });
  } catch (error) {
    capture(error);
    return res.status(500).send({ ok: false, code: ERROR_CODES.SERVER_ERROR });
  }
});

router.post("/initialize_indicator_values", passport.authenticate(["admin", "user"], { session: false, failWithError: true }), async (req, res) => {
  try {
    if (!req.body.action_id) return res.status(400).send({ ok: false, code: ERROR_CODES.INVALID_BODY });
    if (!req.body.indicator_id) return res.status(400).send({ ok: false, code: ERROR_CODES.INVALID_BODY });

    const existing = await IndicatorValue.findOne({ action_id: req.body.action_id, indicator_id: req.body.indicator_id });
    if (existing) return res.status(400).send({ ok: false, code: ERROR_CODES.INDICATOR_ALREADY_EXISTS });

    const indicator = await Indicator.findById(req.body.indicator_id);
    if (!indicator) return res.status(404).send({ ok: false, code: ERROR_CODES.NOT_FOUND });

    const situations = ["init", "ref", "prev", "expost"];
    const createdIndicatorValues = [];

    for (const situation of situations) {
      const defaultValue = indicator.value_default?.[situation]?.[indicator.value_type] ?? null;
      const indicatorValue = {
        ...req.body,
        situation,
        value_default: { [indicator.value_type]: defaultValue },
        indicator_value_possibilities: indicator.value_possibilities || [],
        indicator_category_id: indicator.indicator_category_id,
        indicator_category_name: indicator.indicator_category_name,
        indicator_sub_category_id: indicator.indicator_sub_category_id,
        indicator_sub_category_name: indicator.indicator_sub_category_name,
        indicator_value_unit: indicator.value_unit,
      };
      createdIndicatorValues.push(indicatorValue);
    }
    await IndicatorValue.insertMany(createdIndicatorValues);
    return res.status(200).send({ ok: true });
  } catch (error) {
    capture(error);
    return res.status(500).send({ ok: false, code: ERROR_CODES.SERVER_ERROR });
  }
});

router.post("/export_indicator_values_excel", passport.authenticate(["admin", "user"], { session: false, failWithError: true }), async (req, res) => {
  try {
    const ExcelJS = require("exceljs");

    if (!req.body.action_id) return res.status(400).send({ ok: false, code: ERROR_CODES.INVALID_BODY });
    const action = await Action.findById(req.body.action_id);
    if (!action) return res.status(404).send({ ok: false, code: ERROR_CODES.NOT_FOUND });

    const indicatorValues = await IndicatorValue.find({ action_id: action._id });

    const indicators = await Indicator.find({ _id: { $in: [...new Set(indicatorValues.map((iv) => iv.indicator_id))] } });
    const indicatorMap = new Map(indicators.map((ind) => [ind._id.toString(), ind]));

    const workbook = new ExcelJS.Workbook();

    const situations = [
      { key: "init", label: "Remplissage - Sit. Init." },
      { key: "ref", label: "Remplissage - Sit. Ref." },
      { key: "prev", label: "Remplissage - Sit. Prev." },
      { key: "expost", label: "Remplissage - Sit. Expost" },
    ];

    const columns = [
      { header: "Catégorie", key: "category", width: 20 },
      { header: "Sous-catégorie", key: "sub_category", width: 20 },
      { header: "Titre", key: "title", width: 30 },
      { header: "Description", key: "description", width: 40 },
      { header: "Nom de la variable", key: "excel_id", width: 20 },
      { header: "Valeur", key: "value", width: 15 },
      { header: "Valeurs possibles", key: "possibilities", width: 25 },
      { header: "Valeur par défaut", key: "default_value", width: 15 },
      { header: "Unité", key: "unit", width: 10 },
      { header: "Type", key: "type", width: 10 },
    ];

    for (const situation of situations) {
      const sheet = workbook.addWorksheet(situation.label);
      sheet.columns = columns;

      sheet.getRow(1).font = { bold: true };
      sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE0E0E0" } };

      const situationValues = indicatorValues.filter((iv) => iv.situation === situation.key);

      for (const indicatorValue of situationValues) {
        const indicator = indicatorMap.get(indicatorValue.indicator_id);
        if (!indicator) continue;

        let value = indicatorValue.value?.[indicator.value_type];
        if (Array.isArray(value)) value = value.join(", ");

        let defaultValue = indicatorValue.value_default?.[indicator.value_type];
        if (Array.isArray(defaultValue)) defaultValue = defaultValue.join(", ");

        sheet.addRow({
          category: indicator.indicator_category_name || "",
          sub_category: indicator.indicator_sub_category_name || "",
          title: indicator.name || "",
          description: indicator.description || "",
          excel_id: indicator.excel_indicator_id || "",
          value: value ?? "",
          possibilities: indicatorValue.indicator_value_possibilities?.join(", ") || "",
          default_value: defaultValue ?? "",
          unit: indicator.value_unit || "",
          type: indicator.value_type || "",
        });
      }
    }

    const buffer = await workbook.xlsx.writeBuffer();

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(`indicateurs_${action.name}.xlsx`)}"`);
    res.setHeader("Content-Length", buffer.length);
    res.end(buffer);
  } catch (error) {
    capture(error);
    return res.status(500).send({ ok: false, code: ERROR_CODES.SERVER_ERROR });
  }
});

module.exports = router;
