require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
const mongoose = require("mongoose");
const config = require("../src/config");
const { generateExcelForAllCollectivities } = require("./scrap_indicator_excel");

// Relance ciblée de l'étape 5 du scrap (régénération des fichiers Excel + relecture des défauts) sur une ou plusieurs collectivités,
// sans rejouer les étapes 1 à 4 (import du master, suppressions, création des IVs manquantes).
// ⚠️ ÉCRIT sur SharePoint (copies du master, suppression des anciens fichiers) et en base (value_default, value).
//
//   node script/regenerate_excel.js "Nîmes" "Saint-Etienne"      → ces collectivités uniquement (regex insensible à la casse)
//   node script/regenerate_excel.js --all                          → toutes (équivalent de l'étape 5 du scrap)

const args = process.argv.slice(2);
const names = args.filter((a) => !a.startsWith("--"));

(async () => {
  try {
    if (names.length === 0 && !args.includes("--all")) throw new Error('Usage : node script/regenerate_excel.js "Nom collectivité" ["Autre"…] | --all');
    await mongoose.connect(config.MONGODB_ENDPOINT);
    const collectivityFilter = names.length > 0 ? new RegExp(names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "i") : null;
    await generateExcelForAllCollectivities({ collectivityFilter });
    process.exit(0);
  } catch (error) {
    console.error("\n❌ Échec :", error.message);
    process.exit(1);
  }
})();
