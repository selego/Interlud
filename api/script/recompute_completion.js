require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
const mongoose = require("mongoose");
const config = require("../src/config");
const Action = require("../src/models/action");
const { computeActionCompletion } = require("../src/utils/completion");

// Recalcule completion_init/ref/prev/expost de toutes les actions avec la règle courante
// (situation sans indicateur affiché = 100 %). Sans --apply : dry-run, affiche les écarts, n'écrit rien.
//   node script/recompute_completion.js            → dry-run
//   node script/recompute_completion.js --apply    → écriture
const apply = process.argv.includes("--apply");
const SITS = ["init", "ref", "prev", "expost"];

(async () => {
  try {
    await mongoose.connect(config.MONGODB_ENDPOINT);
    const actions = await Action.find({ type: { $ne: "global" } });
    let changed = 0;
    for (const action of actions) {
      const update = await computeActionCompletion(action._id, { dryRun: !apply });
      if (!update) continue;
      const diffs = SITS.filter((s) => (action[`completion_${s}`] ?? null) !== update[`completion_${s}`]).map((s) => `${s} ${action[`completion_${s}`] ?? "∅"}→${update[`completion_${s}`]}`);
      if (diffs.length === 0) continue;
      changed++;
      console.log(`• ${action.name} (${action.type}, ${action.collectivity_id}) : ${diffs.join(", ")}`);
    }
    console.log(`\n${apply ? "✅ Écrit" : "🧪 Dry-run"} : ${changed}/${actions.length} action(s) avec un écart.`);
    process.exit(0);
  } catch (e) {
    console.error("❌", e.message);
    process.exit(1);
  }
})();
