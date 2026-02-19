const HIDDEN_IDS = ['AnneeRempl', 'AnRef', 'ActionsAutres', 'ActionsCharte'];

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
  const results = iv.display_condition.conditions.map((cond) => {
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
  });
  return iv.display_condition.operator === 'OR' ? results.some((r) => r) : results.every((r) => r);
};

module.exports = { HIDDEN_IDS, buildYearMappings, shouldDisplayIndicator };
