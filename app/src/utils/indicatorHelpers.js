import api from "@/services/api"

export const isIndicatorValueFilled = (indicatorValue) => {
  const val = indicatorValue.value?.[indicatorValue.indicator_type]
  if (indicatorValue.indicator_type === "checkbox") return Array.isArray(val) && val.length > 0
  return val !== null && val !== undefined && val !== ""
}

export const fetchConditionValuesMap = async (indicatorValues, action) => {
  const excelIds = new Set()
  for (const iv of indicatorValues) {
    if (!iv.display_condition?.conditions) continue
    for (const cond of iv.display_condition.conditions) {
      if (cond.excel_indicator_id) excelIds.add(cond.excel_indicator_id)
    }
  }
  if (excelIds.size === 0) return new Map()
  const condParams = { collectivity_id: action.collectivity_id, excel_indicator_ids: [...excelIds] }
  if (action.owner === "economic_actor") {
    condParams.owner = "economic_actor"
    condParams.economic_actor_id = action.economic_actor_id
  }
  const { ok, data: resData } = await api.post("/indicator_value/condition_values", condParams)
  if (!ok) return new Map()
  const map = new Map()
  for (const cv of resData) map.set(`${cv.indicator_excel_id}_${cv.situation}_${cv.year}`, cv)

  const transitiveIds = new Set()
  for (const cv of resData) {
    if (!cv.display_condition?.conditions) continue
    for (const cond of cv.display_condition.conditions) {
      if (cond.excel_indicator_id && !excelIds.has(cond.excel_indicator_id)) transitiveIds.add(cond.excel_indicator_id)
    }
  }
  if (transitiveIds.size > 0) {
    const transParams = { collectivity_id: action.collectivity_id, excel_indicator_ids: [...transitiveIds] }
    if (action.owner === "economic_actor") {
      transParams.owner = "economic_actor"
      transParams.economic_actor_id = action.economic_actor_id
    }
    const { ok: ok2, data: transData } = await api.post("/indicator_value/condition_values", transParams)
    if (ok2) for (const cv of transData) map.set(`${cv.indicator_excel_id}_${cv.situation}_${cv.year}`, cv)
  }
  return map
}

export const shouldDisplayIndicatorFromMap = (iv, yearMappings, conditionValuesMap, visited = new Set()) => {
  if (!iv.display_condition?.conditions?.length) return true
  const ivKey = `${iv.indicator_excel_id}_${iv.situation}_${iv.year}`
  if (visited.has(ivKey)) return false
  visited.add(ivKey)
  const results = iv.display_condition.conditions.map((cond) => {
    const targetSituation = cond.excel_indicator_situation || iv.situation
    const possibleYears = yearMappings?.[`year_${targetSituation}`] || []
    return possibleYears.some((year) => {
      const key = `${cond.excel_indicator_id}_${targetSituation}_${year}`
      const source = conditionValuesMap.get(key)
      if (!source) return false
      if (source.display_condition?.conditions?.length && !shouldDisplayIndicatorFromMap(source, yearMappings, conditionValuesMap, new Set(visited))) return false
      const val = source.value?.[source.indicator_type]
      let isMatch = false
      if (cond.type === "equals") {
        isMatch = val == cond.value
        if (Array.isArray(val) && Array.isArray(cond.value)) isMatch = JSON.stringify([...val].sort()) === JSON.stringify([...cond.value].sort())
      }
      if (cond.type === "contains") {
        if (Array.isArray(val)) isMatch = val.includes(cond.value)
        else if (typeof val === "string") isMatch = val.includes(cond.value)
      }
      if (cond.type === "greaterThan") isMatch = Number(val) > Number(cond.value)
      if (cond.type === "lessThan") isMatch = Number(val) < Number(cond.value)
      if (cond.type === "greaterOrEqual") isMatch = Number(val) >= Number(cond.value)
      if (cond.type === "lessOrEqual") isMatch = Number(val) <= Number(cond.value)
      if (cond.type === "notEmpty") isMatch = val !== null && val !== undefined && val !== "" && (!Array.isArray(val) || val.length > 0)
      if (cond.type === "isEmpty") isMatch = val === null || val === undefined || val === "" || (Array.isArray(val) && val.length === 0)
      if (cond.negate) isMatch = !isMatch
      return isMatch
    })
  })
  return iv.display_condition.operator === "OR" ? results.some((r) => r) : results.every((r) => r)
}
