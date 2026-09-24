require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
const mongoose = require("mongoose");
const config = require("../src/config");
const Action = require("../src/models/action");
const Collectivity = require("../src/models/collectivity");
const IndicatorValue = require("../src/models/indicator_value");
const { graphFetch, getSiteId } = require("../src/services/microsoftGraph");
const { isPercentUnit, resolveDynamicDefaults } = require("../src/utils/indicators");

// Vérification LECTURE SEULE de la cohérence base ↔ fichiers Excel d'une ou plusieurs collectivités, après une migration.
// Pour chaque fichier Excel (prev / expost) de chaque action, et pour chaque feuille du fichier :
//   - colonne F (valeur saisie)      ↔ IndicatorValue.value          (même conversion que syncIndicatorValuesToExcel)
//   - colonne H (valeur par défaut)  ↔ IndicatorValue.value_default  (même conversion que parseDefaultValue)
//       · défaut statique  : value_default tel qu'en base
//       · défaut dynamique : value_default résolu par resolveDynamicDefaults, exactement comme l'API au fetch → teste la chaîne complète
// Ne recalcule pas le classeur, n'écrit rien nulle part.
//
//   node script/check_excel_db_consistency.js "Saint-Etienne" "Nîmes"          → vérifie ces collectivités
//   node script/check_excel_db_consistency.js "Saint-Etienne" --details=50     → affiche jusqu'à 50 écarts par fichier (défaut 15)
//   node script/check_excel_db_consistency.js "Saint-Etienne" --version=V38    → alerte si un fichier n'a pas ce suffixe (défaut V38)

const SHEETS = { init: "Remplissage - Sit. Init.", ref: "Remplissage - Sit. Ref.", prev: "Remplissage - Sit. Prev.", expost: "Remplissage - Sit. Expost" };
const args = process.argv.slice(2);
const opt = (name, fallback) => args.find((a) => a.startsWith(`--${name}=`))?.split("=")[1] ?? fallback;
const MAX_DETAILS = parseInt(opt("details", "15"), 10);
const EXPECTED_VERSION = opt("version", "V38");
const names = args.filter((a) => !a.startsWith("--"));

const isEmpty = (v) => v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0);
const numbersEqual = (a, b) => Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(a), Math.abs(b));

// Valeur DB → valeur attendue en colonne F (cf. formatIndicatorValue / updateExcelCellsBatch)
const expectedCellValue = (iv) => {
  const val = iv.value?.[iv.indicator_type];
  if (isEmpty(val)) return null;
  if (Array.isArray(val)) return val.join(", ");
  if (isPercentUnit(iv.indicator_value_unit) && typeof val === "number") return val / 100;
  return val;
};

// Cellule H → défaut attendu en DB (cf. parseDefaultValue dans controllers/action.js)
const parseDefaultCell = (raw, type, unit) => {
  if (raw === null || raw === undefined || raw === "") return null;
  if (typeof raw === "string" && raw.startsWith("#")) return null;
  if (type === "number") {
    const p = parseFloat(raw);
    if (isNaN(p)) return null;
    return isPercentUnit(unit) ? p * 100 : p;
  }
  if (type === "text" || type === "radio") return String(raw).trim() || null;
  if (type === "checkbox") return String(raw).split(",").map((v) => v.trim()).filter((v) => v !== "");
  return null;
};

const sameValue = (a, b) => {
  if (isEmpty(a) && isEmpty(b)) return true;
  if (isEmpty(a) || isEmpty(b)) return false;
  if (typeof a === "number" || typeof b === "number") {
    const na = typeof a === "number" ? a : parseFloat(a);
    const nb = typeof b === "number" ? b : parseFloat(b);
    if (Number.isFinite(na) && Number.isFinite(nb)) return numbersEqual(na, nb);
  }
  if (Array.isArray(a) || Array.isArray(b)) return JSON.stringify([].concat(a)) === JSON.stringify([].concat(b));
  return String(a).trim() === String(b).trim();
};

const fmt = (v) => (isEmpty(v) ? "∅" : JSON.stringify(v));

(async () => {
  try {
    if (names.length === 0) throw new Error('Usage : node script/check_excel_db_consistency.js "Nom collectivité" ["Autre"…] [--details=N] [--version=V38]');
    await mongoose.connect(config.MONGODB_ENDPOINT);
    const siteId = await getSiteId();
    const grand = { files: 0, badVersion: 0, compared: 0, valueMismatch: 0, defaultMismatch: 0, dynamicCompared: 0, dynamicMismatch: 0, excelErrors: 0, missingIV: 0 };

    for (const name of names) {
      const collectivity = await Collectivity.findOne({ name: { $regex: name, $options: "i" } });
      if (!collectivity) {
        console.log(`\n❌ Collectivité introuvable : ${name}`);
        continue;
      }
      const actions = await Action.find({ collectivity_id: collectivity._id.toString(), type: { $nin: ["config", "global"] } });
      const configActions = await Action.find({ collectivity_id: collectivity._id.toString(), type: "config" });
      console.log(`\n${"═".repeat(100)}\n🏙️ ${collectivity.name} — SIREN ${collectivity.siren ?? "∅"} — ${actions.length} action(s)`);

      for (const action of actions) {
        const configIds = configActions.filter((c) => (c.owner || "collectivity") === (action.owner || "collectivity") && String(c.economic_actor_id || "") === String(action.economic_actor_id || "")).map((c) => c._id.toString());
        const files = [
          ...(action.exel_files_prev || []).filter((f) => f.excel_file_id).map((f) => ({ kind: `Prev ${f.year_prev}`, fileId: f.excel_file_id, situationYears: [{ situation: "init", year: action.year_init }, { situation: "ref", year: f.year_ref }, { situation: "prev", year: f.year_prev }] })),
          ...(action.excel_files_expost || []).filter((f) => f.excel_file_id).map((f) => ({ kind: `Expost ${f.year_expost}`, fileId: f.excel_file_id, situationYears: [{ situation: "init", year: action.year_init }, { situation: "ref", year: f.year_ref }, { situation: "expost", year: f.year_expost }] })),
        ];

        for (const file of files) {
          const situationYears = file.situationYears.filter((sy) => sy.year);
          let meta;
          try {
            meta = await graphFetch(`/sites/${siteId}/drive/items/${file.fileId}`);
          } catch (e) {
            console.log(`\n📄 ${action.name} — ${file.kind} : ❌ fichier ${file.fileId} inaccessible (${e.message})`);
            continue;
          }
          grand.files++;
          const versionOk = meta.name.includes(`_${EXPECTED_VERSION}`);
          if (!versionOk) grand.badVersion++;
          console.log(`\n📄 ${action.name} — ${file.kind} — ${meta.name} ${versionOk ? "✅" : `⚠️ pas en ${EXPECTED_VERSION}`} (modifié ${meta.lastModifiedDateTime})`);

          const ivs = await IndicatorValue.find({ action_id: { $in: [action._id.toString(), ...configIds] }, indicator_excel_id: { $exists: true, $ne: null }, $or: situationYears.map((sy) => ({ situation: sy.situation, year: sy.year })) });
          // Défauts dynamiques : résolus en mémoire comme au fetch API (lecture seule, les IVs ne sont pas sauvegardées)
          await resolveDynamicDefaults(ivs);
          const ivMap = new Map(ivs.map((iv) => [`${iv.situation}|${iv.indicator_excel_id}`, iv]));

          const stats = { compared: 0, valueMismatch: 0, defaultMismatch: 0, dynamicCompared: 0, dynamicMismatch: 0, excelErrors: 0, missingIV: 0 };
          const details = [];
          for (const { situation } of situationYears) {
            const usedRange = await graphFetch(`/sites/${siteId}/drive/items/${file.fileId}/workbook/worksheets('${encodeURIComponent(SHEETS[situation])}')/usedRange`);
            const rows = usedRange.values || [];
            const startRow = parseInt(usedRange.address?.match(/[A-Z]+(\d+):/i)?.[1] || "1", 10);
            rows.forEach((row, i) => {
              const excelId = row[4] ? String(row[4]).trim() : "";
              if (!excelId || excelId === "Nom de la variable") return;
              const iv = ivMap.get(`${situation}|${excelId}`);
              if (!iv) {
                stats.missingIV++;
                return;
              }
              stats.compared++;
              const line = `L${startRow + i}`;
              const rawF = row[5];
              const rawH = row[7];
              if (typeof rawH === "string" && rawH.startsWith("#")) stats.excelErrors++;

              const expectedF = expectedCellValue(iv);
              if (!sameValue(rawF, expectedF)) {
                stats.valueMismatch++;
                details.push(`   ✗ F  ${situation} ${line} ${excelId} [${iv.action_name}] : Excel ${fmt(rawF)} ≠ base ${fmt(iv.value?.[iv.indicator_type])}`);
              }

              const expectedDefault = parseDefaultCell(rawH, iv.indicator_type, iv.indicator_value_unit);
              const dbDefault = iv.value_default?.[iv.indicator_type] ?? null;
              const isDynamic = Boolean(iv.indicator_value_default_source?.excel_indicator_id);
              if (isDynamic) stats.dynamicCompared++;
              if (sameValue(expectedDefault, dbDefault)) return;
              if (isDynamic) {
                stats.dynamicMismatch++;
                const src = iv.indicator_value_default_source;
                details.push(`   ✗ H~ ${situation} ${line} ${excelId} [${iv.action_name}] dynamique ← ${src.excel_indicator_id}/${src.situation}${src.factor ? ` ×${src.factor}` : ""}${src.offset ? ` +${src.offset}` : ""}${src.growth_source?.excel_indicator_id ? ` ×(1+${src.growth_source.excel_indicator_id})` : ""} : Excel ${fmt(rawH)} → attendu ${fmt(expectedDefault)} ≠ résolu API ${fmt(dbDefault)}`);
                return;
              }
              stats.defaultMismatch++;
              details.push(`   ✗ H  ${situation} ${line} ${excelId} [${iv.action_name}] : Excel ${fmt(rawH)} → attendu ${fmt(expectedDefault)} ≠ base ${fmt(dbDefault)}`);
            });
          }

          const ok = stats.valueMismatch === 0 && stats.defaultMismatch === 0 && stats.dynamicMismatch === 0;
          console.log(`   ${ok ? "✅" : "❌"} ${stats.compared} lignes comparées — écarts valeur (F) : ${stats.valueMismatch} — écarts défaut statique (H) : ${stats.defaultMismatch} — défauts dynamiques (H~) : ${stats.dynamicMismatch} écart(s) sur ${stats.dynamicCompared} — cellules H en erreur : ${stats.excelErrors} — lignes Excel sans IV : ${stats.missingIV}`);
          for (const d of details.slice(0, MAX_DETAILS)) console.log(d);
          if (details.length > MAX_DETAILS) console.log(`   … ${details.length - MAX_DETAILS} autre(s) écart(s) (--details=N pour en voir plus)`);

          for (const k of ["compared", "valueMismatch", "defaultMismatch", "dynamicCompared", "dynamicMismatch", "excelErrors", "missingIV"]) grand[k] += stats[k];
        }
      }
    }

    console.log(`\n${"═".repeat(100)}\n📊 Total : ${grand.files} fichier(s) (${grand.badVersion} pas en ${EXPECTED_VERSION}), ${grand.compared} lignes comparées, ${grand.valueMismatch} écart(s) valeur, ${grand.defaultMismatch} écart(s) défaut statique, ${grand.dynamicMismatch} écart(s) défaut dynamique sur ${grand.dynamicCompared}, ${grand.excelErrors} cellule(s) H en erreur, ${grand.missingIV} ligne(s) Excel sans IV en base.`);
    process.exit(grand.valueMismatch + grand.defaultMismatch + grand.dynamicMismatch + grand.badVersion > 0 ? 2 : 0);
  } catch (error) {
    console.error("❌", error.message);
    process.exit(1);
  }
})();
