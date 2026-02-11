export const isIndicatorValueFilled = (indicatorValue) => {
  const val = indicatorValue.value?.[indicatorValue.indicator_type]
  if (indicatorValue.indicator_type === "checkbox") return Array.isArray(val) && val.length > 0
  return val !== null && val !== undefined && val !== ""
}

export const shouldDisplayIndicator = (indicatorValue, allCollectivityIndicatorValues) => {
  if (!indicatorValue.display_condition || !indicatorValue.display_condition.conditions || indicatorValue.display_condition.conditions.length === 0) return true

  const results = indicatorValue.display_condition.conditions.map((cond) => {
    const targetSituation = cond.excel_indicator_situation || indicatorValue.situation
    const sourceValueObj = allCollectivityIndicatorValues.find((iv) => iv.indicator_excel_id === cond.excel_indicator_id && iv.situation === targetSituation)

    if (!sourceValueObj) return false
    const val = sourceValueObj.value?.[sourceValueObj.indicator_type]

    let result = false
    switch (cond.type) {
      case "equals":
        result = String(val) === String(cond.value)
        break
      case "contains":
        if (Array.isArray(val)) result = val.includes(cond.value)
        else result = String(val || "").includes(String(cond.value))
        break
      case "greaterThan":
        result = Number(val) > Number(cond.value)
        break
      case "lessThan":
        result = Number(val) < Number(cond.value)
        break
      case "greaterOrEqual":
        result = Number(val) >= Number(cond.value)
        break
      case "lessOrEqual":
        result = Number(val) <= Number(cond.value)
        break
      case "notEmpty":
        if (Array.isArray(val)) result = val.length > 0
        else result = val !== null && val !== undefined && val !== ""
        break
      case "isEmpty":
        if (Array.isArray(val)) result = val.length === 0
        else result = val === null || val === undefined || val === ""
        break
      default:
        result = false
    }

    return cond.negate ? !result : result
  })

  if (indicatorValue.display_condition.operator === "OR") return results.some((r) => r)
  return results.every((r) => r)
}
