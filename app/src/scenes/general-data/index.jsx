import React, { useState, useEffect, useRef } from "react"
import api from "@/services/api"
import toast from "react-hot-toast"
import useStore from "@/services/store"
import Loader from "@/components/loader"
import ProgressCircle from "@/components/ProgressCircle"
import DebounceInput from "@/components/debounceInput"
import Select from "@/components/Select"
import { FiDownload, FiUpload, FiInfo, FiChevronDown, FiChevronRight } from "react-icons/fi"
import { isIndicatorValueFilled } from "@/utils/indicatorHelpers"

const HIDDEN_INDICATOR_IDS = ['AnneeRempl', 'AnRef', 'ActionsAutres', 'ActionsCharte']
const SITUATION_LABELS = { init: 'Initiale', ref: 'Référence', prev: 'Prévisionnel', expost: 'Ex-post' }
const SITUATION_ORDER = ['init', 'ref', 'prev', 'expost']

export default function Index() {
  const { collectivity } = useStore()
  const [configActions, setConfigActions] = useState([])
  const [activeConfigIndex, setActiveConfigIndex] = useState(0)
  const [activeSituation, setActiveSituation] = useState(null)
  const [activeYear, setActiveYear] = useState(null)
  const [stats, setStats] = useState(null)
  const [isStatsLoading, setIsStatsLoading] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  const activeConfigAction = configActions[activeConfigIndex]
  const situationYears = stats?.situationYears || {}
  const availableSituations = SITUATION_ORDER.filter(s => situationYears[s]?.length > 0)

  const getSituationProgress = (situation, year) => {
    if (!stats?.completion) return 0
    const c = stats.completion[`${situation}_${year}`]
    return c?.total > 0 ? Math.round((c.filled / c.total) * 100) : 0
  }

  const fetchConfigActions = async () => {
    try {
      if (!collectivity?._id) return
      const { ok, data, code } = await api.post("/action/search", { collectivity_id: collectivity._id, type: "config" })
      if (!ok) return toast.error(code || "Une erreur est survenue")
      setConfigActions(data)
    } catch (error) {
      toast.error("Une erreur est survenue")
    }
  }

  const fetchStats = async (actionId) => {
    try {
      const { ok, data, code } = await api.post("/indicator_value/stats", { action_id: actionId })
      if (!ok) return toast.error(code || "Une erreur est survenue")
      setStats(data)
    } catch (error) {
      console.error(error)
    }
  }

  const exportIndicatorTemplate = async () => {
    try {
      setIsExporting(true)
      const response = await api.download("/indicator_value/export_indicator_values_excel", { action_id: activeConfigAction._id })
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = `donnees_generales_${activeConfigAction.name}.xlsx`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)
    } catch (error) {
      toast.error("Une erreur est survenue")
    } finally {
      setIsExporting(false)
    }
  }

  const importIndicatorValues = async (file) => {
    try {
      if (!collectivity.excelFileId) return toast.error("Aucun fichier Excel associé")
      if (!file) return
      setIsImporting(true)
      const reader = new FileReader()
      reader.readAsDataURL(file)
      reader.onload = async () => {
        try {
          const { ok, code } = await api.post("/indicator_value/importIndicatorValues", { fileBase64: reader.result.split(",")[1], collectivity, action_id: activeConfigAction._id })
          if (!ok) return toast.error(code || "Erreur lors de l'import")
          toast.success("Valeurs importées avec succès")
          setRefreshKey(k => k + 1)
          fetchStats(activeConfigAction._id)
        } catch (error) {
          toast.error("Une erreur est survenue")
        } finally {
          setIsImporting(false)
        }
      }
    } catch (error) {
      toast.error("Une erreur est survenue")
      setIsImporting(false)
    }
  }

  useEffect(() => {
    fetchConfigActions()
  }, [collectivity?._id])

  useEffect(() => {
    if (!activeConfigAction) return
    setIsStatsLoading(true)
    fetchStats(activeConfigAction._id).finally(() => setIsStatsLoading(false))
  }, [activeConfigAction?._id])

  useEffect(() => {
    if (availableSituations.length > 0) {
      if (!activeSituation || !situationYears[activeSituation]) {
        setActiveSituation(availableSituations[0])
        setActiveYear(situationYears[availableSituations[0]]?.[0])
      } else if (activeYear && !situationYears[activeSituation]?.includes(activeYear)) {
        setActiveYear(situationYears[activeSituation]?.[0])
      }
    }
  }, [stats, activeConfigIndex])

  useEffect(() => {
    setActiveSituation(null)
    setActiveYear(null)
  }, [activeConfigIndex])

  if (configActions.length === 0) {
    return (
      <div className="">
        <div className="relative z-10 max-w-8xl mx-auto px-6 sm:px-8 lg:px-10 py-8">
          <h1 className="text-font-primary text-4xl mb-4">Données générales</h1>
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <svg className="w-16 h-16 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-lg font-medium text-gray-600">Aucune donnée générale disponible</p>
            <p className="text-sm text-gray-400 mt-2">Créez votre première action pour initialiser les données générales.</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="">
      <div className="relative z-10 max-w-8xl mx-auto px-6 sm:px-8 lg:px-10 py-8">
        <div className="mb-8">
          <h1 className="text-font-primary text-4xl">Données générales</h1>
          <div className="flex gap-2 items-center">
            <ProgressCircle percentage={stats?.totalAll > 0 ? Math.round((stats.filledAll / stats.totalAll) * 100) : 0} size={20} />
            <p className="text-sm text-gray-900">
              Complété à <strong>{stats?.totalAll > 0 ? Math.round((stats.filledAll / stats.totalAll) * 100) : 0}%</strong>
            </p>
          </div>
        </div>

        {configActions.length > 1 && (
          <div className="flex gap-1 mb-6 bg-gray-100 rounded-lg p-1 w-fit">
            {configActions.map((ca, index) => (
              <button
                key={ca._id}
                className={`px-5 py-2 text-sm font-medium rounded-md transition-all ${
                  activeConfigIndex === index ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
                }`}
                onClick={() => setActiveConfigIndex(index)}
              >
                {ca.name}
              </button>
            ))}
          </div>
        )}

        {isStatsLoading ? (
          <Loader />
        ) : (<>
          <div className="flex items-center justify-between border-b border-gray-200 mb-4">
            <div className="flex items-center">
              {availableSituations.map((situation) => {
                const years = situationYears[situation] || []
                const totalProgress = years.length > 0
                  ? Math.round(years.reduce((sum, y) => sum + getSituationProgress(situation, y), 0) / years.length)
                  : 0
                return (
                  <button
                    key={situation}
                    className={`px-6 py-3 text-sm font-semibold transition-all ${
                      activeSituation === situation ? "text-primary-green border-b-2 border-primary-green" : "text-gray-500 hover:text-primary-green"
                    }`}
                    onClick={() => { setActiveSituation(situation); setActiveYear(situationYears[situation]?.[0]) }}
                  >
                    <div className="flex items-center gap-2">
                      {SITUATION_LABELS[situation]}
                      <div className="flex items-center gap-1 text-xs text-gray-600">
                        <ProgressCircle percentage={totalProgress} size={16} />
                        <span>{totalProgress}%</span>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={exportIndicatorTemplate}
                disabled={isExporting}
                className="inline-flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-300"
                title="Télécharger le fichier Excel"
              >
                {isExporting ? <Loader size="small" /> : <FiDownload className="w-4 h-4" />}
                <span>Telecharger le template</span>
              </button>

              <label
                className={`button-primary inline-flex items-center gap-2 cursor-pointer ${
                  isImporting ? "opacity-50 cursor-not-allowed" : ""
                }`}
                title="Importer le fichier Excel"
              >
                {isImporting ? <Loader size="small" /> : <FiUpload className="w-4 h-4" />}
                <span>Importer les Valeurs</span>
                <input type="file" accept=".xlsx" className="hidden" disabled={isImporting} onChange={(e) => e.target.files[0] && importIndicatorValues(e.target.files[0])} />
              </label>

              <div className="relative group">
                <button className="p-2 text-gray-400 hover:text-gray-600 transition-colors" aria-label="Information">
                  <FiInfo className="w-4 h-4" />
                </button>
                <div className="absolute right-0 top-full mt-2 w-64 p-3 bg-gray-900 text-white text-xs rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-10 pointer-events-none">
                  Téléchargez le template et importez-le pour mettre à jour les indicateurs
                  <div className="absolute bottom-full right-4 border-4 border-transparent border-b-gray-900"></div>
                </div>
              </div>
            </div>
          </div>

          {activeSituation && situationYears[activeSituation]?.length > 0 && (
            <div className="flex items-center gap-2 mb-8">
              {situationYears[activeSituation].map((year) => (
                <button
                  key={year}
                  className={`px-4 py-1.5 text-sm font-medium rounded-full transition-all ${
                    activeYear === year ? "bg-primary-green text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                  onClick={() => setActiveYear(year)}
                >
                  <div className="flex items-center gap-1.5">
                    {year}
                    <ProgressCircle percentage={getSituationProgress(activeSituation, year)} size={14} />
                    <span className="text-xs opacity-80">{getSituationProgress(activeSituation, year)}%</span>
                  </div>
                </button>
              ))}
            </div>
          )}

          <IndicatorView
            activeConfigAction={activeConfigAction}
            activeSituation={activeSituation}
            activeYear={activeYear}
            refreshKey={refreshKey}
            onStatsRefresh={() => fetchStats(activeConfigAction._id)}
          />
        </>)}
      </div>
    </div>
  )
}

function IndicatorView({ activeConfigAction, activeSituation, activeYear, refreshKey, onStatsRefresh }) {
  const [indicatorValues, setIndicatorValues] = useState([])
  const [conditionValuesMap, setConditionValuesMap] = useState(new Map())
  const [economicActorData, setEconomicActorData] = useState({})
  const [selectedCategory, setSelectedCategory] = useState(null)
  const [isLoading, setIsLoading] = useState(false)

  const shouldDisplayIndicator = (iv) => {
    if (!iv.display_condition?.conditions?.length) return true
    const results = iv.display_condition.conditions.map(cond => {
      const key = `${cond.excel_indicator_id}_${cond.excel_indicator_situation || iv.situation}_${iv[`year_${cond.excel_indicator_situation || iv.situation}`]}`
      const source = conditionValuesMap.get(key)
      if (!source) return false
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
    return iv.display_condition.operator === "OR" ? results.some(r => r) : results.every(r => r)
  }

  const displayedIndicatorValues = indicatorValues.filter(iv => !HIDDEN_INDICATOR_IDS.includes(iv.indicator_excel_id) && shouldDisplayIndicator(iv))

  const fetchConditionValues = async (data) => {
    const excelIds = new Set()
    for (const iv of data) {
      if (!iv.display_condition?.conditions) continue
      for (const cond of iv.display_condition.conditions) {
        if (cond.excel_indicator_id) excelIds.add(cond.excel_indicator_id)
      }
    }
    if (excelIds.size === 0) { setConditionValuesMap(new Map()); return }
    const condParams = { collectivity_id: activeConfigAction.collectivity_id, excel_indicator_ids: [...excelIds] }
    if (activeConfigAction.owner === 'economic_actor') {
      condParams.owner = 'economic_actor'
      condParams.economic_actor_id = activeConfigAction.economic_actor_id
    }
    const { ok, data: resData } = await api.post("/indicator_value/condition_values", condParams)
    if (!ok) return
    const map = new Map()
    for (const cv of resData) map.set(`${cv.indicator_excel_id}_${cv.situation}_${cv.year}`, cv)
    setConditionValuesMap(map)
  }

  const fetchEconomicActorData = async (data) => {
    const indicatorIds = new Set()
    for (const iv of data) indicatorIds.add(iv.indicator_id)
    if (indicatorIds.size === 0) return
    const { ok, data: resData, code } = await api.post("/indicator_value/search", {indicator_ids: [...indicatorIds], situation: activeSituation, collectivity_id: activeConfigAction.collectivity_id, owner: 'economic_actor', limit: 10000, year: activeYear})
    if (!ok) return toast.error(code || "Une erreur est survenue")
    const grouped = {}
    for (const iv of resData) {
      if (!grouped[iv.indicator_id]) grouped[iv.indicator_id] = []
      grouped[iv.indicator_id].push(iv)
    }
    setEconomicActorData(grouped)
  }

  const loadData = async () => {
    if (!activeConfigAction || !activeSituation) return
    setIsLoading(true)
    try {
      const params = { action_id: activeConfigAction._id, situation: activeSituation, limit: 10000 }
      if (activeYear) params.year = activeYear
      const { ok, data, code } = await api.post("/indicator_value/search", params)
      if (!ok) return toast.error(code || "Une erreur est survenue")
      setIndicatorValues(data)
      await Promise.all([fetchConditionValues(data), fetchEconomicActorData(data)])
    } catch (error) {
      toast.error("Une erreur est survenue")
    } finally {
      setIsLoading(false)
    }
  }

  const handleSaveIndicatorValue = async (indicatorValue) => {
    try {
      setIndicatorValues(prev => prev.map(iv => iv._id === indicatorValue._id ? indicatorValue : iv))
      if (indicatorValue.indicator_excel_id) {
        setConditionValuesMap(prev => {
          const condKey = `${indicatorValue.indicator_excel_id}_${indicatorValue.situation}_${indicatorValue.year}`
          if (!prev.has(condKey)) return prev
          const next = new Map(prev)
          next.set(condKey, { ...prev.get(condKey), value: indicatorValue.value, indicator_type: indicatorValue.indicator_type })
          return next
        })
      }
      const { ok, code } = await api.put(`/indicator_value/${indicatorValue._id}`, { source: 'manual', ...indicatorValue })
      if (!ok) return toast.error(code || "Une erreur est survenue")
      toast.success("Valeur enregistrée avec succès")
      onStatsRefresh()
    } catch (error) {
      toast.error("Une erreur est survenue")
    }
  }

  useEffect(() => {
    loadData()
  }, [activeConfigAction?._id, activeSituation, activeYear, refreshKey])

  useEffect(() => {
    setSelectedCategory(null)
  }, [activeConfigAction?._id, activeSituation, activeYear])

  useEffect(() => {
    if (displayedIndicatorValues.length > 0) {
      const firstCat = displayedIndicatorValues[0]?.indicator_category_name
      if (firstCat && (!selectedCategory || !displayedIndicatorValues.some(iv => iv.indicator_category_name === selectedCategory.categoryName))) {
        setSelectedCategory({ categoryName: firstCat })
      }
    }
  }, [displayedIndicatorValues.length])

  if (isLoading && !indicatorValues.length) return <Loader />

  return (
    <div className="flex flex-col lg:flex-row gap-6">
      <div className="w-full lg:w-72 shrink-0">
        <div className="card-shadow rounded-2xl p-4 sticky top-8 self-start">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-font-primary text-lg">{activeSituation ? `${SITUATION_LABELS[activeSituation]} ${activeYear || ''}` : ''}</h3>
          </div>
          <div className="overflow-y-auto max-h-[calc(100vh-300px)]">
            {isLoading ? (
              <Loader size="small" />
            ) : (
              <CategorySidebar
                displayedIndicatorValues={displayedIndicatorValues}
                selectedCategory={selectedCategory}
                onSelectCategory={setSelectedCategory}
              />
            )}
          </div>
        </div>
      </div>

      <div className="flex-1">
        <IndicatorPanel
          displayedIndicatorValues={displayedIndicatorValues}
          selectedCategory={selectedCategory}
          activeSituation={activeSituation}
          economicActorData={economicActorData}
          onSave={handleSaveIndicatorValue}
          isViewLoading={isLoading}
        />
      </div>
    </div>
  )
}


function CategorySidebar({ displayedIndicatorValues, selectedCategory, onSelectCategory }) {
  const [openCategories, setOpenCategories] = useState(new Set())

  const categoriesGrouped = {}
  for (const iv of displayedIndicatorValues) {
    const cat = iv.indicator_category_name
    const subCat = iv.indicator_sub_category_name
    if (!categoriesGrouped[cat]) categoriesGrouped[cat] = { subCategories: {}, directIndicatorValues: [] }
    if (subCat) {
      if (!categoriesGrouped[cat].subCategories[subCat]) categoriesGrouped[cat].subCategories[subCat] = []
      categoriesGrouped[cat].subCategories[subCat].push(iv)
    } else {
      categoriesGrouped[cat].directIndicatorValues.push(iv)
    }
  }

  const toggleCategory = (name) => {
    setOpenCategories(prev => {
      const next = new Set(prev)
      next.has(name) ? next.delete(name) : next.add(name)
      return next
    })
  }

  const calculateCompletion = (ivs) => {
    if (!ivs || ivs.length === 0) return 0
    return Math.round((ivs.filter(isIndicatorValueFilled).length / ivs.length) * 100)
  }

  return (
    <div className="space-y-1">
      {Object.entries(categoriesGrouped).map(([categoryName, categoryData]) => {
        return (
          <div key={categoryName}>
            <div
              className={`flex items-center gap-2 p-2 rounded cursor-pointer transition-colors text-sm font-medium ${selectedCategory?.categoryName === categoryName && !selectedCategory?.subCategoryName ? 'bg-primary-green/10 border-l-2 border-primary-green' : 'hover:bg-gray-50'}`}
              onClick={() => { toggleCategory(categoryName); onSelectCategory({ categoryName }) }}
            >
              {Object.keys(categoryData.subCategories).length > 0 ? (
                openCategories.has(categoryName) ? <FiChevronDown size={16} /> : <FiChevronRight size={16} />
              ) : <span className="w-4" />}
              <span className="flex-1">{categoryName}</span>
              <div className="flex items-center gap-2">
                <ProgressCircle percentage={calculateCompletion([...categoryData.directIndicatorValues, ...Object.values(categoryData.subCategories).flat()])} size={20} />
                <span className="text-xs text-gray-500">{calculateCompletion([...categoryData.directIndicatorValues, ...Object.values(categoryData.subCategories).flat()])}%</span>
              </div>
            </div>

            {openCategories.has(categoryName) && (
              <div className="ml-4 space-y-1">
                {Object.entries(categoryData.subCategories).map(([subCategoryName, subIndicators]) => (
                  <div
                    key={subCategoryName}
                    className={`flex items-center gap-2 p-2 rounded cursor-pointer transition-colors text-xs ${
                      selectedCategory?.categoryName === categoryName && selectedCategory?.subCategoryName === subCategoryName ? 'bg-primary-green/10 border-l-2 border-primary-green' : 'hover:bg-gray-50'
                    }`}
                    onClick={() => onSelectCategory({ categoryName, subCategoryName })}
                  >
                    <span className="flex-1 text-gray-700">{subCategoryName}</span>
                    <div className="flex items-center gap-2">
                      <ProgressCircle percentage={calculateCompletion(subIndicators)} size={18} />
                      <span className="text-xs text-gray-500">{calculateCompletion(subIndicators)}%</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function IndicatorPanel({ displayedIndicatorValues, selectedCategory, activeSituation, economicActorData, onSave, isViewLoading }) {
  if (isViewLoading) {
    return (
      <div className="card-shadow rounded-2xl p-6 flex items-center justify-center py-20">
        <Loader size="small" />
      </div>
    )
  }

  const excelIdMap = new Map()
  for (const iv of displayedIndicatorValues) {
    if (iv.indicator_excel_id) excelIdMap.set(iv.indicator_excel_id, iv)
  }

  let filteredValues = displayedIndicatorValues
  if (selectedCategory) {
    if (selectedCategory.subCategoryName) {
      filteredValues = filteredValues.filter(iv => iv.indicator_category_name === selectedCategory.categoryName && iv.indicator_sub_category_name === selectedCategory.subCategoryName)
    } else {
      filteredValues = filteredValues.filter(iv => iv.indicator_category_name === selectedCategory.categoryName && !iv.indicator_sub_category_name)
    }
  }
  filteredValues = filteredValues.filter(iv => {
    if (!iv.display_indicator_excel_id) return true
    const cond = excelIdMap.get(iv.display_indicator_excel_id)
    if (!cond) return true
    return cond.value?.[cond.indicator_type] === iv.display_condition_indicator_value
  })

  return (
    <div className="card-shadow rounded-2xl p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="font-bold text-font-primary text-lg">
          {selectedCategory?.subCategoryName || selectedCategory?.categoryName || (activeSituation ? SITUATION_LABELS[activeSituation] : '')}
        </h2>
      </div>

      <div className="space-y-4">
        {filteredValues.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-gray-400">
            <svg className="w-12 h-12 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-sm font-medium">Aucun indicateur pour cette situation</p>
          </div>
        )}

        {filteredValues.map(iv => (
          <IndicatorCard
            key={iv._id}
            indicatorValue={iv}
            economicActorValues={economicActorData[iv.indicator_id] || []}
            onSave={onSave}
          />
        ))}
      </div>
    </div>
  )
}

function IndicatorCard({ indicatorValue, economicActorValues, onSave }) {
  const filledEAValues = economicActorValues.filter(isIndicatorValueFilled)
  let aggregatedValue = null
  if (filledEAValues.length >= 3 && indicatorValue.indicator_type === 'number') {
    const numbers = filledEAValues.map(iv => iv.value?.number).filter(n => n !== null && n !== undefined)
    if (numbers.length > 0) aggregatedValue = indicatorValue.indicator_value_unit === '%' ? numbers.reduce((a, b) => a + b, 0) / numbers.length : numbers.reduce((a, b) => a + b, 0)
  }

  return (
    <div
      id={`indicator-${indicatorValue._id}`}
      className="bg-white p-4 rounded-lg border border-gray-200 transition-all"
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-medium text-gray-900">{indicatorValue.indicator_name}</h3>
      </div>

      <div className="grid grid-cols-[2fr_2fr_2fr] gap-x-6 gap-y-4">
        <div className="flex flex-col">
          <label className="block text-xs font-medium text-gray-600 mb-2">Valeur</label>
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <IndicatorValueInput
                value={indicatorValue.value?.[indicatorValue.indicator_type]}
                indicatorType={indicatorValue.indicator_type}
                options={indicatorValue.indicator_value_possibilities}
                onChange={newValue => onSave({ ...indicatorValue, value: { [indicatorValue.indicator_type]: newValue } })}
                className="w-full"
              />
            </div>
            {indicatorValue.indicator_value_unit && <span className="text-xs text-gray-500 whitespace-nowrap">{indicatorValue.indicator_value_unit}</span>}
          </div>
        </div>

        <div className="flex flex-col">
          <div className="flex items-center gap-2 mb-2">
            <label className="block text-xs font-medium text-gray-600">Valeur par défaut</label>
            {indicatorValue.value_default?.[indicatorValue.indicator_type] != null && (
              <Tooltip content="Appliquer cette valeur">
                <button
                  onClick={() => onSave({ ...indicatorValue, value: { [indicatorValue.indicator_type]: indicatorValue.value_default[indicatorValue.indicator_type] } })}
                  className="p-1 rounded-lg hover:bg-primary-green/10 text-primary-green transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                  </svg>
                </button>
              </Tooltip>
            )}
          </div>
          {indicatorValue.value_default?.[indicatorValue.indicator_type] == null && <p className="text-gray-600 mt-2">Aucune valeur par défaut</p>}
          {indicatorValue.value_default?.[indicatorValue.indicator_type] != null && (
            <p className="text-gray-600 text-sm truncate max-w-[20em]" title={Array.isArray(indicatorValue.value_default[indicatorValue.indicator_type]) ? indicatorValue.value_default[indicatorValue.indicator_type].join(', ') : indicatorValue.value_default[indicatorValue.indicator_type]}>
              {Array.isArray(indicatorValue.value_default[indicatorValue.indicator_type]) ? indicatorValue.value_default[indicatorValue.indicator_type].join(', ') : indicatorValue.value_default[indicatorValue.indicator_type]}
            </p>
          )}
        </div>

        <div className="flex flex-col">
          <div className="flex items-center gap-2 mb-2">
            <label className="block text-xs font-medium text-gray-600">Valeurs Acteurs économiques</label>
            {filledEAValues.length >= 3 ? (
              <>
                <Tooltip content={`Valeur agrégée de ${filledEAValues.length} acteur${filledEAValues.length > 1 ? 's' : ''} économique${filledEAValues.length > 1 ? 's' : ''}`} />
                <Tooltip content="Appliquer cette valeur">
                  <button
                    onClick={() => onSave({ ...indicatorValue, value: { [indicatorValue.indicator_type]: aggregatedValue } })}
                    className="p-1 rounded-lg hover:bg-primary-green/10 text-primary-green transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                    </svg>
                  </button>
                </Tooltip>
              </>
            ) : (
              <Tooltip content="Pour respecter la confidentialité des acteurs, la valeur n'est affichée que si au moins 3 acteurs ont rempli l'indicateur" />
            )}
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <p className="text-gray-900 font-medium text-sm">{aggregatedValue ?? 'Pas de valeur'}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function IndicatorValueInput({ value, indicatorType, options, onChange, className = "" }) {
  if (indicatorType === "text" || indicatorType === undefined) {
    return (
      <DebounceInput
        type="text"
        placeholder="Valeur texte"
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        debounce={800}
        className={`text-gray-900 font-bold ${className}`}
      />
    )
  }

  if (indicatorType === "number") {
    return (
      <DebounceInput
        type="number"
        value={value ?? ""}
        onChange={(e) => onChange(Number(e.target.value))}
        placeholder="Valeur numérique"
        debounce={800}
        className={`text-gray-900 font-bold ${className}`}
      />
    )
  }

  if (indicatorType === "radio") return <RadioInput value={value} onChange={onChange} options={options} className={className} />
  if (indicatorType === "checkbox") return <CheckboxInput value={value} onChange={onChange} options={options} className={className} />
  return null
}

function RadioInput({ value, onChange, options, className }) {
  const [localValue, setLocalValue] = useState(value || "")

  useEffect(() => {
    setLocalValue(value || "")
  }, [value])

  return (
    <Select
      value={localValue}
      onChange={(v) => { setLocalValue(v); onChange(v) }}
      options={options?.map(opt => ({ value: opt, label: opt })) || []}
      placeholder="Sélectionner une option"
      className={`text-gray-900 truncate max-w-[20em] ${className}`}
    />
  )
}

function CheckboxInput({ value, onChange, options }) {
  const [localValues, setLocalValues] = useState(Array.isArray(value) ? value : [])
  const [showAll, setShowAll] = useState(false)
  const debounceRef = useRef(null)

  useEffect(() => {
    setLocalValues(Array.isArray(value) ? value : [])
  }, [value])

  useEffect(() => {
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [])

  const handleChange = (option, checked) => {
    const newValues = checked ? [...localValues, option] : localValues.filter(v => v !== option)
    setLocalValues(newValues)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => onChange(newValues), 800)
  }

  return (
    <div className="space-y-2">
      {(options && options.length > 3 && !showAll ? options.slice(0, 3) : options)?.map((option, i) => (
        <label key={i} className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            value={option}
            checked={localValues.includes(option)}
            onChange={(e) => handleChange(option, e.target.checked)}
            className="w-4 h-4"
            style={{ accentColor: "#2DAC6A" }}
          />
          <span className="text-sm text-gray-700">{option}</span>
        </label>
      ))}
      {options && options.length > 3 && (
        <button type="button" onClick={() => setShowAll(!showAll)} className="text-sm text-primary-green hover:text-primary-green/80 font-medium mt-2">
          {showAll ? "Voir moins" : `Voir plus (${options.length - 3} autres)`}
        </button>
      )}
    </div>
  )
}

function Tooltip({ content, children }) {
  const [isVisible, setIsVisible] = useState(false)

  return (
    <div className="relative inline-flex items-center">
      <div onMouseEnter={() => setIsVisible(true)} onMouseLeave={() => setIsVisible(false)} className={children ? "" : "cursor-help"}>
        {children || (
          <svg className="w-4 h-4 text-gray-400 hover:text-gray-600" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
          </svg>
        )}
      </div>
      {isVisible && (
        <div className="absolute z-50 bottom-full right-0 mb-2 px-3 py-2 text-sm text-white bg-gray-900 rounded-lg shadow-lg w-80">
          {content}
          <div className="absolute top-full right-2 -mt-1">
            <div className="border-4 border-transparent border-t-gray-900"></div>
          </div>
        </div>
      )}
    </div>
  )
}
