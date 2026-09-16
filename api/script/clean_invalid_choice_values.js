require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
const mongoose = require("mongoose");
const IndicatorValue = require("../src/models/indicator_value");
const Indicator = require("../src/models/indicator");
const Action = require("../src/models/action");
const Log = require("../src/models/log");
const config = require("../src/config");
const { computeActionCompletion } = require("../src/utils/completion");
const { updateExcelCellsBatch, createWorkbookSession, closeWorkbookSession } = require("../src/services/microsoftGraph");

// Nettoie les réponses radio/checkbox qui ne correspondent plus à aucune option de la liste des possibilités
// (libellés modifiés dans le master, ancien séparateur ";" dans la liste des choix, valeurs "Obligatoire"...).
// Ces valeurs bloquent les conditions d'affichage (equals/contains stricts) et l'utilisateur ne peut pas les corriger
// lui-même : le Select n'affiche pas une valeur hors liste.
//
// Règles, dans l'ordre :
//   - liste dynamique (indicator_value_possibilities_source) → jamais touché, la liste stockée est vide par construction
//   - action supprimée (IV orpheline) → ignoré, hors périmètre
//   - la valeur correspond à UNE option à la ponctuation/casse près ("<=3,5t" vs "<=3.5t", virgule parasite) → remplacée
//   - checkbox : les entrées collées par ";" sont découpées, on garde celles qui sont des options valides
//   - sinon → vidé
// La valeur est mise à jour en base ET dans la cellule F des fichiers Excel de l'action (même logique que le PUT
// /indicator_value). Un log est écrit avec l'ancienne valeur. Sans --apply, le script ne modifie rien.

const APPLY = process.argv.includes("--apply");
const normalize = (s) => String(s).toLowerCase().replace(/[^a-z0-9àâäéèêëîïôöùûüç]/g, "");

// Option unique équivalente à la ponctuation/casse près, sinon null
const remap = (value, possibilities) => {
  const matches = possibilities.filter((p) => normalize(p) === normalize(value));
  return matches.length === 1 ? matches[0] : null;
};

// Nouvelle valeur pour une IV, ou undefined si rien à faire
const fixValue = (iv) => {
  const poss = iv.indicator_value_possibilities || [];
  if (iv.indicator_type === "radio") {
    const v = iv.value?.radio;
    if (!v || poss.includes(v)) return undefined;
    return remap(v, poss);
  }
  if (iv.indicator_type === "checkbox") {
    const v = Array.isArray(iv.value?.checkbox) ? iv.value.checkbox : [];
    if (v.every((x) => poss.includes(x))) return undefined;
    const fixed = [];
    for (const entry of v) {
      for (const part of String(entry).split(";").map((s) => s.trim()).filter(Boolean)) {
        const target = poss.includes(part) ? part : remap(part, poss);
        if (target && !fixed.includes(target)) fixed.push(target);
      }
    }
    return fixed;
  }
  return undefined;
};

// Fichiers Excel à mettre à jour, même logique que le PUT /indicator_value
const excelFilesFor = async (action, iv) => {
  const filesOf = (a) => {
    const prev = a.exel_files_prev || [];
    const expost = a.excel_files_expost || [];
    if (iv.situation === "init") return [...prev, ...expost];
    if (iv.situation === "prev") return prev.filter((f) => f.year_prev === iv.year);
    if (iv.situation === "ref") return [...prev.filter((f) => f.year_ref === iv.year), ...expost.filter((f) => f.year_ref === iv.year)];
    if (iv.situation === "expost") return expost.filter((f) => f.year_expost === iv.year);
    return [];
  };
  let actions = [action];
  if (action.type === "config") {
    const ownerFilter = { owner: action.owner, ...(action.owner === "economic_actor" ? { economic_actor_id: action.economic_actor_id } : {}) };
    const collectivityFilter = action.owner === "economic_actor" ? {} : { collectivity_id: action.collectivity_id };
    const base = { ...collectivityFilter, type: { $ne: "config" }, ...ownerFilter };
    if (iv.situation === "ref") actions = await Action.find({ ...base, $or: [{ "exel_files_prev.year_ref": iv.year }, { "excel_files_expost.year_ref": iv.year }] });
    if (iv.situation === "prev") actions = await Action.find({ ...base, "exel_files_prev.year_prev": iv.year });
    if (iv.situation === "expost") actions = await Action.find({ ...base, "excel_files_expost.year_expost": iv.year });
    if (iv.situation === "init") actions = await Action.find({ ...base, year_init: iv.year });
  }
  const files = [];
  for (const a of actions) for (const f of filesOf(a)) if (f.excel_file_id) files.push({ action: a, fileId: f.excel_file_id });
  return files;
};

(async () => {
  await mongoose.connect(config.MONGODB_ENDPOINT);
  const ivs = await IndicatorValue.find({ indicator_type: { $in: ["radio", "checkbox"] } });
  const actionIds = [...new Set(ivs.map((iv) => String(iv.action_id)))];
  const actions = new Map((await Action.find({ _id: { $in: actionIds } })).map((a) => [String(a._id), a]));

  let skippedDyn = 0, skippedOrphan = 0, remapped = 0, cleared = 0, excelOk = 0, excelKo = 0;
  const touchedActions = new Set();

  for (const iv of ivs) {
    const newValue = fixValue(iv);
    if (newValue === undefined) continue;
    if (iv.indicator_value_possibilities_source?.excel_indicator_id) { skippedDyn++; continue; }
    const action = actions.get(String(iv.action_id));
    if (!action) { skippedOrphan++; continue; }
    const indicator = await Indicator.findById(iv.indicator_id);
    if (!indicator) { skippedOrphan++; continue; }

    const oldValue = iv.value[iv.indicator_type];
    const isClear = newValue === null || (Array.isArray(newValue) && newValue.length === 0);
    const files = await excelFilesFor(action, iv);
    const fmt = (v) => (v == null ? "(vide)" : Array.isArray(v) ? `[${v.join(" | ")}]` : `"${v}"`).slice(0, 80);
    console.log(`${APPLY ? "✏️ " : "👀"} ${isClear ? "VIDE  " : "REMAP "} ${iv.collectivity_name}${iv.economic_actor_name ? " / " + iv.economic_actor_name : ""} | ${iv.indicator_excel_id} [${iv.situation} ${iv.year}] | ${fmt(oldValue)} → ${fmt(newValue)} | Excel: ${files.length} fichier(s)`);
    isClear ? cleared++ : remapped++;
    if (!APPLY) continue;

    const logType = Array.isArray(newValue) ? "array" : "string";
    await Log.create({
      model_name: "indicator_value", name: indicator.name, field: "value", operation: "update",
      new_value: { [logType]: newValue }, previous_value: { [logType]: oldValue }, type_value: logType, date: new Date(),
      source: "synchronization", user_name: "script clean_invalid_choice_values",
      collectivity_id: iv.collectivity_id, collectivity_name: iv.collectivity_name, action_id: iv.action_id, action_name: iv.action_name,
      indicator_id: iv.indicator_id, indicator_name: iv.indicator_name, indicator_value_id: iv._id, indicator_value_name: iv.name,
    });
    await IndicatorValue.updateOne({ _id: iv._id }, { $set: { [`value.${iv.indicator_type}`]: newValue } });
    for (const { action: a } of files) touchedActions.add(String(a._id));
    touchedActions.add(String(action._id));

    for (const { fileId } of files) {
      let sessionId = null;
      try {
        sessionId = await createWorkbookSession(fileId);
        await updateExcelCellsBatch(fileId, [{ excel_indicator_id: indicator.excel_indicator_id, value: isClear ? "" : newValue, unit: indicator.value_unit }], iv.situation, sessionId);
        excelOk++;
      } catch (e) {
        excelKo++;
        console.log(`     ❌ Excel ${fileId} : ${e.message}`);
      } finally {
        await closeWorkbookSession(fileId, sessionId).catch(() => {});
      }
    }
  }
  for (const actionId of touchedActions) await computeActionCompletion(actionId);

  console.log(`\nRésumé : ${remapped} remappée(s), ${cleared} vidée(s) | ignorées : ${skippedDyn} liste dynamique, ${skippedOrphan} orpheline(s)`);
  if (APPLY) console.log(`Excel : ${excelOk} cellule(s) écrite(s), ${excelKo} échec(s) | ${touchedActions.size} action(s) recalculée(s)`);
  else console.log("Dry-run terminé. Relancer avec --apply pour écrire.");
  await mongoose.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
