/**
 * Migration one-shot : nettoie les IndicatorValues orphelines des actions config.
 *
 * Contexte : quand un indicateur passe de "sans action" à "lié à une action" lors d'un
 * nouveau scrap Excel, ses IndicatorValues restent rattachées aux actions config
 * ("Parc types" / "Données de base") au lieu d'être déplacées vers l'instance d'action.
 *
 * Pour chaque IV orpheline (indicateur avec linked_action_id mais IV sur une action config) :
 *  1. Si l'IV a une valeur saisie (différente du défaut prérempli) ET qu'une IV cible existe
 *     sous l'instance d'action liée avec la même situation + même année ET que la cible est vide
 *     → la valeur est copiée sur la cible
 *  2. L'IV orpheline est supprimée dans tous les cas
 *
 * Usage (depuis api/) :
 *   node script/migrate_orphan_config_ivs.js --dry-run   # rapport sans aucune écriture
 *   node script/migrate_orphan_config_ivs.js             # migration réelle
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const config = require('../src/config');
const Indicator = require('../src/models/indicator');
const Action = require('../src/models/action');
const IndicatorValue = require('../src/models/indicator_value');

const DRY_RUN = process.argv.includes('--dry-run');

const isFilled = (value, type) => {
  const v = value?.[type];
  if (v === null || v === undefined || v === '') return false;
  if (Array.isArray(v) && v.length === 0) return false;
  return true;
};

const sameValue = (a, b) => JSON.stringify(Array.isArray(a) ? [...a].sort() : (a ?? null)) === JSON.stringify(Array.isArray(b) ? [...b].sort() : (b ?? null));

(async () => {
  await mongoose.connect(config.MONGODB_ENDPOINT);
  console.log(`🔄 Migration des IVs orphelines des actions config ${DRY_RUN ? '(DRY RUN)' : ''}\n`);

  const linkedIndicators = await Indicator.find({ linked_action_id: { $nin: [null, ''] } });
  const linkedActionByIndicator = new Map(linkedIndicators.map((ind) => [ind._id.toString(), ind.linked_action_id.toString()]));

  const configActions = await Action.find({ type: 'config' });
  const userActions = await Action.find({ type: { $nin: ['config', 'global'] } });

  // Index des instances d'action par action parente + collectivité + owner + acteur éco
  const actionsByKey = new Map();
  for (const a of userActions) {
    if (!a.action_parent_id) continue;
    const key = `${a.action_parent_id}_${a.collectivity_id}_${a.owner || 'collectivity'}_${a.economic_actor_id || ''}`;
    if (!actionsByKey.has(key)) actionsByKey.set(key, []);
    actionsByKey.get(key).push(a._id.toString());
  }

  const orphans = await IndicatorValue.find({
    indicator_id: { $in: [...linkedActionByIndicator.keys()] },
    action_id: { $in: configActions.map((a) => a._id.toString()) },
  });
  console.log(`📋 ${linkedIndicators.length} indicateurs liés, ${orphans.length} IVs orphelines trouvées`);

  // Candidats à la copie : valeur saisie (≠ défaut prérempli) + une instance de l'action liée existe
  const copyCandidates = [];
  const stats = { empty: 0, defaultOnly: 0, noAction: 0 };
  for (const orphan of orphans) {
    if (!isFilled(orphan.value, orphan.indicator_type)) {
      stats.empty++;
      continue;
    }
    if (sameValue(orphan.value?.[orphan.indicator_type], orphan.value_default?.[orphan.indicator_type])) {
      stats.defaultOnly++;
      continue;
    }
    const targetActionIds = actionsByKey.get(`${linkedActionByIndicator.get(orphan.indicator_id)}_${orphan.collectivity_id}_${orphan.owner || 'collectivity'}_${orphan.economic_actor_id || ''}`);
    if (!targetActionIds) {
      stats.noAction++;
      continue;
    }
    copyCandidates.push({ orphan, targetActionIds });
  }
  console.log(`📋 ${copyCandidates.length} candidates à la copie (${stats.empty} vides, ${stats.defaultOnly} valeur = défaut, ${stats.noAction} sans instance d'action)`);

  // IVs cibles : mêmes indicateurs, sous les instances d'action concernées
  const targetIVs = copyCandidates.length > 0
    ? await IndicatorValue.find({
        action_id: { $in: [...new Set(copyCandidates.flatMap((c) => c.targetActionIds))] },
        indicator_id: { $in: [...new Set(copyCandidates.map((c) => c.orphan.indicator_id))] },
      })
    : [];
  const targetsByKey = new Map();
  for (const iv of targetIVs) {
    const key = `${iv.action_id}_${iv.indicator_id}_${iv.situation}_${iv.year}`;
    if (!targetsByKey.has(key)) targetsByKey.set(key, []);
    targetsByKey.get(key).push(iv);
  }

  const copyOps = [];
  const copyStats = { copied: 0, noTargetSameYear: 0, targetFilled: 0, ambiguous: 0 };
  for (const { orphan, targetActionIds } of copyCandidates) {
    const matches = targetActionIds.flatMap((actionId) => targetsByKey.get(`${actionId}_${orphan.indicator_id}_${orphan.situation}_${orphan.year}`) || []);
    if (matches.length === 0) {
      copyStats.noTargetSameYear++;
      continue;
    }
    if (matches.length > 1) {
      copyStats.ambiguous++;
      console.log(`⚠️ Ambigu (${matches.length} cibles) : ${orphan.indicator_excel_id} ${orphan.situation} ${orphan.year} — ${orphan.collectivity_name}`);
      continue;
    }
    if (isFilled(matches[0].value, matches[0].indicator_type)) {
      copyStats.targetFilled++;
      continue;
    }
    copyStats.copied++;
    copyOps.push({ updateOne: { filter: { _id: matches[0]._id }, update: { $set: { value: orphan.value } } } });
    if (DRY_RUN) console.log(`→ COPIE ${orphan.indicator_excel_id} ${orphan.situation} ${orphan.year} — ${orphan.collectivity_name} : ${JSON.stringify(orphan.value?.[orphan.indicator_type])}`);
  }

  console.log(`\n📊 Bilan copie : ${copyStats.copied} copiées, ${copyStats.noTargetSameYear} sans cible même situation/année, ${copyStats.targetFilled} cible déjà remplie, ${copyStats.ambiguous} ambiguës`);
  console.log(`📊 Suppression : ${orphans.length} IVs orphelines`);

  if (DRY_RUN) {
    console.log('\n✅ DRY RUN terminé, aucune écriture effectuée');
    await mongoose.disconnect();
    return;
  }

  if (copyOps.length > 0) {
    const result = await IndicatorValue.bulkWrite(copyOps);
    console.log(`✅ ${result.modifiedCount} valeurs copiées vers les instances d'action`);
  }

  const orphanIds = orphans.map((o) => o._id);
  let deleted = 0;
  for (let i = 0; i < orphanIds.length; i += 5000) {
    const result = await IndicatorValue.deleteMany({ _id: { $in: orphanIds.slice(i, i + 5000) } });
    deleted += result.deletedCount;
    console.log(`🗑️ ${deleted}/${orphanIds.length} supprimées`);
  }

  console.log('\n✅ Migration terminée');
  await mongoose.disconnect();
})();
