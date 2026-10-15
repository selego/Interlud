/**
 * Resynchro globale des valeurs par défaut : relit la colonne H de chaque fichier Excel d'action
 * (via refreshDefaultsAfterSync, même mécanique qu'après une saisie) pour aligner les actions existantes
 * créées avant la mise en place du refresh post-synchro.
 *
 * Règles (cf. services/excelDefaults.js) : défaut mis à jour ; valeur mise à jour seulement pour les non primordiaux
 * jamais modifiés (vide ou égale à l'ancien défaut) ; cellules en erreur Excel ignorées ; Parc types / Données de base
 * jamais touchés. À lancer hors heures d'utilisation (pas de coordination avec la file de synchro de l'API).
 *
 * Usage (depuis api/) :
 *   node script/refresh_all_defaults.js                  # dry-run sur toutes les collectivités, n'écrit rien
 *   node script/refresh_all_defaults.js --write          # écriture réelle
 *   node script/refresh_all_defaults.js --collectivity <id> [--write]
 */
require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const mongoose = require("mongoose");
const config = require("../src/config");
const Action = require("../src/models/action");
const Collectivity = require("../src/models/collectivity");
const { refreshDefaultsAfterSync } = require("../src/services/excelDefaults");

const dryRun = !process.argv.includes("--write");
const collectivityArg = process.argv[process.argv.indexOf("--collectivity") + 1];
const collectivityId = process.argv.includes("--collectivity") ? collectivityArg : null;

(async () => {
  await mongoose.connect(config.MONGODB_ENDPOINT);
  console.log(`${dryRun ? "DRY-RUN (aucune écriture)" : "ÉCRITURE RÉELLE"} — ${config.ENVIRONMENT}\n`);

  const collectivities = collectivityId ? [await Collectivity.findById(collectivityId)] : await Collectivity.find();
  const totals = { files: 0, defaults: 0, values: 0, protected: 0, errors: 0, failed: 0 };
  const startedAt = Date.now();

  for (const collectivity of collectivities) {
    if (!collectivity) continue;
    const actions = await Action.find({ collectivity_id: collectivity._id.toString(), type: { $ne: "config" } });
    const files = [...new Set(actions.flatMap((a) => [...(a.exel_files_prev || []), ...(a.excel_files_expost || [])].map((f) => f.excel_file_id).filter(Boolean)))];
    if (files.length === 0) continue;
    console.log(`\n${collectivity.name} — ${actions.length} action(s), ${files.length} fichier(s)`);

    for (const fileId of files) {
      const t = Date.now();
      try {
        const report = await refreshDefaultsAfterSync(fileId, { dryRun });
        if (!report) {
          console.log(`  [${fileId.slice(0, 12)}] fichier sans action (ignoré)`);
          continue;
        }
        totals.files++;
        for (const k of ["defaults", "values", "protected", "errors"]) totals[k] += report[k];
        console.log(`  [${fileId.slice(0, 12)}] ${report.action} : ${report.passes} passe(s), ${report.defaults} défaut(s), ${report.values} valeur(s), ${report.protected} protégée(s), ${report.errors} cellule(s) en erreur — ${Date.now() - t} ms`);
        for (const c of report.changes) console.log(`      ${c.situation} ${c.year} ${c.excel_indicator_id} : défaut ${c.default}${c.value ? ` ; valeur ${c.value}` : ""}`);
      } catch (e) {
        totals.failed++;
        console.log(`  [${fileId.slice(0, 12)}] ÉCHEC : ${e.message}`);
      }
    }
  }

  console.log(`\nTerminé en ${Math.round((Date.now() - startedAt) / 1000)} s :`, JSON.stringify(totals));
  await mongoose.disconnect();
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
