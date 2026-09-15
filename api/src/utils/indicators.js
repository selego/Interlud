const HIDDEN_IDS = ['AnneeRempl', 'AnRef', 'ActionsAutres', 'ActionsCharte'];

// Unité pourcentage dès que la chaîne contient '%' ('%', '% du PTAC'…) : Excel stocke ces valeurs en fraction (0.36 pour 36%)
const isPercentUnit = (unit) => typeof unit === 'string' && unit.includes('%');

// Collecte récursivement tous les excel_indicator_id des feuilles (en descendant dans les groupes imbriqués).
const collectConditionExcelIds = (node, acc) => {
  if (!node) return acc;
  if (Array.isArray(node.conditions)) for (const c of node.conditions) collectConditionExcelIds(c, acc);
  if (node.excel_indicator_id) acc.add(node.excel_indicator_id);
  return acc;
};

const buildYearMappings = (regularActions) => {
  const mappings = {};
  const ensure = (k) => {
    if (!mappings[k]) mappings[k] = { year_init: new Set(), year_ref: new Set(), year_prev: new Set(), year_expost: new Set() };
  };
  for (const a of regularActions) {
    if (a.year_init != null) {
      ensure(`init_${a.year_init}`);
      mappings[`init_${a.year_init}`].year_init.add(a.year_init);
    }
    for (const f of a.exel_files_prev || []) {
      if (f.year_prev != null) {
        ensure(`prev_${f.year_prev}`);
        if (a.year_init != null) mappings[`prev_${f.year_prev}`].year_init.add(a.year_init);
        if (f.year_ref != null) mappings[`prev_${f.year_prev}`].year_ref.add(f.year_ref);
        mappings[`prev_${f.year_prev}`].year_prev.add(f.year_prev);
      }
      if (f.year_ref != null) {
        ensure(`ref_${f.year_ref}`);
        if (a.year_init != null) mappings[`ref_${f.year_ref}`].year_init.add(a.year_init);
        mappings[`ref_${f.year_ref}`].year_ref.add(f.year_ref);
      }
    }
    for (const f of a.excel_files_expost || []) {
      if (f.year_expost != null) {
        ensure(`expost_${f.year_expost}`);
        if (a.year_init != null) mappings[`expost_${f.year_expost}`].year_init.add(a.year_init);
        if (f.year_ref != null) mappings[`expost_${f.year_expost}`].year_ref.add(f.year_ref);
        mappings[`expost_${f.year_expost}`].year_expost.add(f.year_expost);
      }
      if (f.year_ref != null) {
        ensure(`ref_${f.year_ref}`);
        if (a.year_init != null) mappings[`ref_${f.year_ref}`].year_init.add(a.year_init);
        mappings[`ref_${f.year_ref}`].year_ref.add(f.year_ref);
      }
    }
  }
  for (const k in mappings) {
    const m = mappings[k];
    mappings[k] = { year_init: [...m.year_init], year_ref: [...m.year_ref], year_prev: [...m.year_prev], year_expost: [...m.year_expost] };
  }
  return mappings;
};

const shouldDisplayIndicator = (iv, yearMappings, conditionValuesMap, visited = new Set()) => {
  if (!iv.display_condition?.conditions?.length) return true;
  const ivKey = `${iv.indicator_excel_id}_${iv.situation}_${iv.year}`;
  if (visited.has(ivKey)) return false;
  visited.add(ivKey);
  const evalLeaf = (cond) => {
    if (cond.type === 'neverVisible') return false;
    const targetSituation = cond.excel_indicator_situation || iv.situation;
    const possibleYears = yearMappings?.[`year_${targetSituation}`] || [];
    return possibleYears.some((year) => {
      const source = conditionValuesMap.get(`${cond.excel_indicator_id}_${targetSituation}_${year}`);
      if (!source) return false;
      if (source.display_condition?.conditions?.length && !shouldDisplayIndicator(source, yearMappings, conditionValuesMap, new Set(visited))) return false;
      const val = source.value?.[source.indicator_type];
      let isMatch = false;
      if (cond.type === 'equals') {
        isMatch = val == cond.value;
        if (Array.isArray(val) && Array.isArray(cond.value)) isMatch = JSON.stringify([...val].sort()) === JSON.stringify([...cond.value].sort());
      }
      if (cond.type === 'contains') {
        if (Array.isArray(val)) isMatch = val.includes(cond.value);
        else if (typeof val === 'string') isMatch = val.includes(cond.value);
      }
      if (cond.type === 'greaterThan') isMatch = Number(val) > Number(cond.value);
      if (cond.type === 'lessThan') isMatch = Number(val) < Number(cond.value);
      if (cond.type === 'greaterOrEqual') isMatch = Number(val) >= Number(cond.value);
      if (cond.type === 'lessOrEqual') isMatch = Number(val) <= Number(cond.value);
      if (cond.type === 'notEmpty') isMatch = val !== null && val !== undefined && val !== '' && (!Array.isArray(val) || val.length > 0);
      if (cond.type === 'isEmpty') isMatch = val === null || val === undefined || val === '' || (Array.isArray(val) && val.length === 0);
      if (cond.negate) isMatch = !isMatch;
      return isMatch;
    });
  };

  // Un noeud est soit un groupe (operator + sous-conditions), soit une feuille.
  const evalNode = (node) => {
    if (Array.isArray(node.conditions) && node.conditions.length) {
      const results = node.conditions.map(evalNode);
      return node.operator === 'OR' ? results.some((r) => r) : results.every((r) => r);
    }
    return evalLeaf(node);
  };

  return evalNode(iv.display_condition);
};

// Charge les IVs sources référencées par `getSource(iv)` = { excel_indicator_id, situation }.
// Retourne une fonction (iv) => IV source ou null. Une IV source = même collectivity_id + même owner (+ economic_actor_id si applicable)
// + excel_indicator_id + situation ; à égalité, on préfère l'IV de la même action (indicateurs d'action non partagés entre instances).
const buildSourceLookup = async (refs, getSource) => {
  const IndicatorValue = require('../models/indicator_value');
  const lookupGroups = new Map();
  for (const iv of refs) {
    const key = `${iv.collectivity_id}|${iv.owner}|${iv.economic_actor_id || ''}`;
    if (!lookupGroups.has(key)) lookupGroups.set(key, { collectivity_id: iv.collectivity_id, owner: iv.owner, economic_actor_id: iv.economic_actor_id, excel_ids: new Set(), situations: new Set() });
    lookupGroups.get(key).excel_ids.add(getSource(iv).excel_indicator_id);
    lookupGroups.get(key).situations.add(getSource(iv).situation);
  }

  const sourceMap = new Map();
  for (const group of lookupGroups.values()) {
    const query = {
      collectivity_id: group.collectivity_id,
      owner: group.owner,
      indicator_excel_id: { $in: [...group.excel_ids] },
      situation: { $in: [...group.situations] },
    };
    if (group.economic_actor_id) query.economic_actor_id = group.economic_actor_id;
    const sourceIVs = await IndicatorValue.find(query);
    for (const src of sourceIVs) {
      const mapKey = `${group.collectivity_id}|${group.owner}|${group.economic_actor_id || ''}|${src.indicator_excel_id}|${src.situation}`;
      if (!sourceMap.has(mapKey)) sourceMap.set(mapKey, []);
      sourceMap.get(mapKey).push(src);
    }
  }

  return (iv) => {
    const src = getSource(iv);
    const candidates = sourceMap.get(`${iv.collectivity_id}|${iv.owner}|${iv.economic_actor_id || ''}|${src.excel_indicator_id}|${src.situation}`);
    if (!candidates) return null;
    return candidates.find((c) => String(c.action_id) === String(iv.action_id)) || candidates[0];
  };
};

// Résout dynamiquement indicator_value_possibilities pour les IVs qui pointent vers un autre indicateur.
// Mute les IVs en place : remplace indicator_value_possibilities par la valeur courante de l'IV source.
const resolveDynamicPossibilities = async (ivs) => {
  const refs = ivs.filter((iv) => iv.indicator_value_possibilities_source?.excel_indicator_id && iv.indicator_value_possibilities_source?.situation);
  if (refs.length === 0) return;
  const findSource = await buildSourceLookup(refs, (iv) => iv.indicator_value_possibilities_source);

  for (const iv of refs) {
    const sourceIV = findSource(iv);
    if (!sourceIV) continue;
    const val = sourceIV.value?.[sourceIV.indicator_type];
    if (Array.isArray(val)) iv.indicator_value_possibilities = val;
    if (typeof val === 'string' && val !== '') iv.indicator_value_possibilities = [val];
  }
};

const isEmptyValue = (val) => val === null || val === undefined || val === '' || (Array.isArray(val) && val.length === 0);

// Résout dynamiquement value_default pour les IVs dont la colonne H du master référence la valeur d'un autre indicateur
// (ex : défaut ref/prev/expost = valeur saisie en init). Mute les IVs en place.
// Nombre : défaut = valeur × factor + offset, ou valeur × (1 + évolution/100) quand growth_source pointe vers un indicateur d'évolution en %.
const resolveDynamicDefaults = async (ivs) => {
  const refs = ivs.filter((iv) => iv.indicator_value_default_source?.excel_indicator_id && iv.indicator_value_default_source?.situation);
  if (refs.length === 0) return;
  const findSource = await buildSourceLookup(refs, (iv) => iv.indicator_value_default_source);
  const growthRefs = refs.filter((iv) => iv.indicator_value_default_source.growth_source?.excel_indicator_id);
  const findGrowth = growthRefs.length > 0 ? await buildSourceLookup(growthRefs, (iv) => iv.indicator_value_default_source.growth_source) : () => null;

  for (const iv of refs) {
    const sourceIV = findSource(iv);
    if (!sourceIV) continue;
    const val = sourceIV.value?.[sourceIV.indicator_type];
    if (isEmptyValue(val)) {
      iv.value_default = { [iv.indicator_type]: null };
      continue;
    }
    // Types incompatibles entre source et cible : on garde le défaut statique
    if (iv.indicator_type === 'number' && typeof val !== 'number') continue;
    if (iv.indicator_type === 'checkbox' && !Array.isArray(val)) continue;
    if ((iv.indicator_type === 'text' || iv.indicator_type === 'radio') && typeof val !== 'string') continue;
    if (iv.indicator_type !== 'number') {
      iv.value_default = { [iv.indicator_type]: val };
      continue;
    }

    const { factor, offset, growth_source } = iv.indicator_value_default_source;
    let result = val * (factor || 1) + (offset || 0);
    if (growth_source?.excel_indicator_id) {
      // Évolution non saisie → Excel lit 0 → défaut = valeur source
      const growthIV = findGrowth(iv);
      const growth = growthIV?.value?.number;
      if (typeof growth === 'number') result = val * (1 + (isPercentUnit(growthIV.indicator_value_unit) ? growth / 100 : growth));
    }
    iv.value_default = { number: result };
  }
};

module.exports = { HIDDEN_IDS, isPercentUnit, buildYearMappings, shouldDisplayIndicator, resolveDynamicPossibilities, resolveDynamicDefaults, collectConditionExcelIds };
