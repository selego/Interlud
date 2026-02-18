export const isIndicatorValueFilled = (indicatorValue) => {
  const val = indicatorValue.value?.[indicatorValue.indicator_type]
  if (indicatorValue.indicator_type === "checkbox") return Array.isArray(val) && val.length > 0
  return val !== null && val !== undefined && val !== ""
}

// que dans onboarding
export const shouldDisplayIndicator = (indicatorValue, allCollectivityIndicatorValues) => {
  if (!indicatorValue.display_condition || !indicatorValue.display_condition.conditions || indicatorValue.display_condition.conditions.length === 0) return true

  const results = indicatorValue.display_condition.conditions.map((cond) => {
    const targetSituation = cond.excel_indicator_situation || indicatorValue.situation
    const sourceValueObj = allCollectivityIndicatorValues.find((iv) => iv.indicator_excel_id === cond.excel_indicator_id && iv.situation === targetSituation)

    if (!sourceValueObj) return false
    const val = sourceValueObj.value?.[sourceValueObj.indicator_type]

    let result = false
    if (cond.type === "equals") result = String(val) === String(cond.value)
    if (cond.type === "contains") {
      if (Array.isArray(val)) result = val.includes(cond.value)
      else result = String(val || "").includes(String(cond.value))
    }
    if (cond.type === "greaterThan") result = Number(val) > Number(cond.value)
    if (cond.type === "lessThan") result = Number(val) < Number(cond.value)
    if (cond.type === "greaterOrEqual") result = Number(val) >= Number(cond.value)
    if (cond.type === "lessOrEqual") result = Number(val) <= Number(cond.value)
    if (cond.type === "notEmpty") {
      if (Array.isArray(val)) result = val.length > 0
      else result = val !== null && val !== undefined && val !== ""
    }
    if (cond.type === "isEmpty") {
      if (Array.isArray(val)) result = val.length === 0
      else result = val === null || val === undefined || val === ""
    }

    return cond.negate ? !result : result
  })

  if (indicatorValue.display_condition.operator === "OR") return results.some((r) => r)
  return results.every((r) => r)
}
