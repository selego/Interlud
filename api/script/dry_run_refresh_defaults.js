require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
const mongoose = require("mongoose");
const config = require("../src/config");
const Action = require("../src/models/action");
const Collectivity = require("../src/models/collectivity");
const { graphFetch, getSiteId, duplicateExcelFile } = require("../src/services/microsoftGraph");
const { refreshDefaultsForFile, syncIndicatorValuesToExcel, getActionScopeIds } = require("./scrap_indicator_excel");

// Dry-run de l'étape 5 du scrap (refreshDefaultsFromExcel) sur une collectivité. N'écrit rien en base ni dans les vrais fichiers Excel.
//
//   node script/dry_run_refresh_defaults.js                              → liste les collectivités candidates
//   node script/dry_run_refresh_defaults.js "Nom collectivité" [action]  → lit les fichiers Excel EXISTANTS de la collectivité
//        ⚠️ non représentatif si la collectivité a fait un import (feuilles remplacées → #REF! sur 'Parcs types')
//   node script/dry_run_refresh_defaults.js "Nom" [action] --fresh       → reproduit exactement l'étape 5 : copie du master dans un fichier
//        temporaire "DRYRUN_…" du dossier SharePoint de la collectivité, écriture des valeurs F depuis la base, recalcul, relecture des
//        défauts, puis suppression du fichier temporaire. Seul effet de bord : ce fichier temporaire, supprimé à la fin.

const MASTER_FILE_ID = "01IBL4ADNDE2JFJTPINBGKQSUGPXLK7DQN";
const args = process.argv.slice(2);
const fresh = args.includes("--fresh");
const [collectivityArg, actionArg] = args.filter((a) => a !== "--fresh");

(async () => {
  try {
    await mongoose.connect(config.MONGODB_ENDPOINT);

    if (!collectivityArg) {
      const collectivities = await Collectivity.find();
      for (const c of collectivities) {
        const actions = await Action.find({ collectivity_id: c._id.toString(), type: { $nin: ["config", "global"] } });
        const files = actions.reduce((n, a) => n + (a.exel_files_prev || []).filter((f) => f.excel_file_id).length + (a.excel_files_expost || []).filter((f) => f.excel_file_id).length, 0);
        if (actions.length > 0) console.log(`• ${c.name} — SIREN ${c.siren ?? "∅"} — ${actions.length} action(s), ${files} fichier(s) Excel`);
      }
      process.exit(0);
    }

    const collectivity = await Collectivity.findOne({ name: { $regex: collectivityArg, $options: "i" } });
    if (!collectivity) throw new Error(`Collectivité introuvable : ${collectivityArg}`);
    if (fresh && !collectivity.sharepoint_folder_id) throw new Error(`Pas de dossier SharePoint pour "${collectivity.name}"`);
    const actionQuery = { collectivity_id: collectivity._id.toString(), type: { $nin: ["config", "global"] }, ...(actionArg ? { name: { $regex: actionArg, $options: "i" } } : {}) };
    const actions = await Action.find(actionQuery);
    const siteId = await getSiteId();
    const master = await graphFetch(`/sites/${siteId}/drive/items/${MASTER_FILE_ID}`);
    console.log(`🏙️ "${collectivity.name}" (SIREN ${collectivity.siren ?? "∅"}) : ${actions.length} action(s) — mode ${fresh ? `FRESH (copie de ${master.name})` : "fichiers existants"}\n`);

    const totals = { ivs: 0, defaults: 0, values: 0, protected: 0, errors: 0 };
    for (const action of actions) {
      const files = [
        ...(action.exel_files_prev || []).filter((f) => f.excel_file_id).map((f) => ({ kind: `Prev ${f.year_prev}`, fileId: f.excel_file_id, situationYears: [{ situation: "init", year: action.year_init }, { situation: "ref", year: f.year_ref }, { situation: "prev", year: f.year_prev }] })),
        ...(action.excel_files_expost || []).filter((f) => f.excel_file_id).map((f) => ({ kind: `Expost ${f.year_expost}`, fileId: f.excel_file_id, situationYears: [{ situation: "init", year: action.year_init }, { situation: "ref", year: f.year_ref }, { situation: "expost", year: f.year_expost }] })),
      ];
      for (const file of files) {
        const situationYears = file.situationYears.filter((sy) => sy.year);
        console.log(`📄 ${action.name} — ${file.kind}`);
        let fileId = file.fileId;
        let tempFileId = null;
        if (fresh) {
          tempFileId = await duplicateExcelFile(`DRYRUN_${action.name}_${file.kind.replace(" ", "")}.xlsx`, collectivity.sharepoint_folder_id, MASTER_FILE_ID);
          fileId = tempFileId;
          const written = await syncIndicatorValuesToExcel(tempFileId, collectivity._id.toString(), situationYears, siteId, await getActionScopeIds(action, collectivity._id.toString()));
          console.log(`   fichier temporaire créé, ${written} valeurs écrites en colonne F`);
        }
        try {
          const report = await refreshDefaultsForFile(fileId, action, collectivity._id.toString(), situationYears, true);
          console.log(`   → ${report.ivs} IVs examinées, ${report.defaults} défauts à mettre à jour, ${report.values} valeurs qui suivraient, ${report.protected} valeurs conservées, ${report.errors} défauts null sur cellule en erreur\n`);
          for (const k of Object.keys(totals)) totals[k] += report[k];
        } finally {
          if (tempFileId) await graphFetch(`/sites/${siteId}/drive/items/${tempFileId}`, { method: "DELETE", headers: { Prefer: "bypass-shared-lock" } }).then(() => console.log("   fichier temporaire supprimé\n")).catch((e) => console.error(`   ⚠️ fichier temporaire ${tempFileId} non supprimé : ${e.message}`));
        }
      }
    }
    console.log(`\n🧪 Total dry-run : ${totals.ivs} IVs, ${totals.defaults} défauts, ${totals.values} valeurs, ${totals.protected} valeurs conservées, ${totals.errors} défauts null sur cellule en erreur. Rien n'a été écrit en base.`);
    process.exit(0);
  } catch (error) {
    console.error("❌", error.message);
    process.exit(1);
  }
})();
