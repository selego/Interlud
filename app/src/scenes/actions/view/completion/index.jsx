import React, { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import api from "@/services/api"
import toast from "react-hot-toast"
import { FiArrowLeft, FiDownload, FiUpload, FiLoader, FiInfo } from "react-icons/fi"
import useStore from "@/services/store"
import Loader from "@/components/loader"
import ProgressCircle from "@/components/ProgressCircle"
import IndicatorsList from "./IndicatorsList"
import SituationTab from "./SituationTab"

const HIDDEN_INDICATOR_IDS = ['AnneeRempl', 'AnRef', 'ActionsAutres', 'ActionsCharte']
const SITUATION_LABELS = { init: 'Initiale', ref: 'Référence', prev: 'Prévisionnel', expost: 'Ex-post' }
const SITUATION_ORDER = ['init', 'ref', 'prev', 'expost']

export default function Completion({ action }) {
  const { collectivity } = useStore()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState(null)
  const [stats, setStats] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isExporting, setIsExporting] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  const situationYears = stats?.situationYears || {}

  const buildDynamicTabs = () => {
    if (action.type === 'config' && stats) {
      const shortLabels = { init: 'Init', ref: 'Réf', prev: 'Prév', expost: 'Expost' }
      const tabs = []
      for (const situation of SITUATION_ORDER) {
        const years = situationYears[situation] || []
        for (const year of years) {
          tabs.push({ key: `${situation}_${year}`, label: `${shortLabels[situation]} ${year}`, situation, year })
        }
      }
      return tabs.length > 0 ? tabs : [{ key: 'init', label: 'Initiale', situation: 'init' }]
    }

    return [
      { key: 'init', label: `Initiale${action.year_init ? ` ${action.year_init}` : ""}`, situation: 'init' },
      { key: 'ref', label: `Référence${action.year_ref ? ` ${action.year_ref}` : ""}`, situation: 'ref' },
      ...(action.exel_files_prev || []).map((file) => ({ key: `prev_${file.year_prev}`, label: `Prév. ${file.year_prev}`, year: file.year_prev, situation: 'prev' })),
      ...(action.excel_files_expost || []).map((file) => ({ key: `expost_${file.year_expost}`, label: `Expost ${file.year_expost}`, year: file.year_expost, situation: 'expost' })),
    ]
  }

  const dynamicTabs = buildDynamicTabs()
  const currentTab = dynamicTabs.find((t) => t.key === activeTab) || dynamicTabs[0]

  const getTabProgress = (tab) => {
    if (!stats?.completion) return 0
    if (tab.year) {
      const c = stats.completion[`${tab.situation}_${tab.year}`]
      return c?.total > 0 ? Math.round((c.filled / c.total) * 100) : 0
    }
    // Aggregate across all years for this situation (non-config init/ref)
    const years = situationYears[tab.situation] || []
    let totalFilled = 0, totalCount = 0
    for (const y of years) {
      const c = stats.completion[`${tab.situation}_${y}`]
      if (c) { totalFilled += c.filled; totalCount += c.total }
    }
    return totalCount > 0 ? Math.round((totalFilled / totalCount) * 100) : 0
  }

  const fetchStats = async () => {
    try {
      const { ok, data, code } = await api.post("/indicator_value/stats", { action_id: action._id })
      if (!ok) return toast.error(code || "Une erreur est survenue")
      setStats(data)
    } catch (error) {
      console.error(error)
    }
  }

  const exportIndicatorTemplate = async () => {
    try {
      setIsExporting(true)
      const response = await api.download("/indicator_value/export_indicator_values_excel", { action_id: action._id })
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = `valeurs_indicateurs_${action.name}.xlsx`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)
    } catch (error) {
      toast.error("Erreur lors de l'export")
    } finally {
      setIsExporting(false)
    }
  }

  const importIndicatorValues = async (file) => {
    try {
      if (!file) return
      setIsImporting(true)
      const reader = new FileReader()
      reader.readAsDataURL(file)
      reader.onload = async () => {
        try {
          const { ok, code } = await api.post("/indicator_value/importIndicatorValues", { fileBase64: reader.result.split(",")[1], collectivity, action_id: action._id })
          if (!ok) return toast.error(code || "Erreur lors de l'import")
          toast.success("Valeurs importées avec succès")
          setRefreshKey(k => k + 1)
          fetchStats()
        } catch (error) {
          toast.error("Erreur lors de l'import")
        } finally {
          setIsImporting(false)
        }
      }
    } catch (error) {
      toast.error("Erreur lors de l'import")
      setIsImporting(false)
    }
  }

  useEffect(() => {
    setIsLoading(true)
    fetchStats().finally(() => setIsLoading(false))
  }, [action._id, action.collectivity_id])

  useEffect(() => {
    if (dynamicTabs.length > 0) {
      const currentTabExists = dynamicTabs.some(t => t.key === activeTab)
      if (!currentTabExists) setActiveTab(dynamicTabs[0].key)
    }
  }, [stats, action.type])

  if (isLoading) return <Loader />

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center gap-2 text-sm text-gray-600 mb-4">
          <button onClick={() => navigate("/actions")} className="hover:text-primary-green transition-colors">
            Actions
          </button>
          <span>/</span>
          <button onClick={() => navigate(`/actions/${action._id}/dashboard`)} className="hover:text-primary-green transition-colors truncate max-w-[150px]">
            {action.name}
          </button>
          <span>/</span>
          <span className="text-gray-900 font-medium">Complétion</span>
        </div>

        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate(-1)}
                className="p-2 rounded-full hover:bg-gray-100 text-gray-600 hover:text-primary-green transition-colors"
                aria-label="Revenir à la page précédente"
              >
                <FiArrowLeft size={18} />
              </button>
              <h1 className="text-3xl font-bold text-gray-900">{action.name}</h1>
            </div>
          </div>

          <div className="flex gap-2 items-center ml-14">
            <ProgressCircle percentage={stats?.totalAll > 0 ? Math.round((stats.filledAll / stats.totalAll) * 100) : 0} size={20} />
            <p className="text-sm text-gray-900">
              Complété à{" "}
              <strong>{stats?.totalAll > 0 ? Math.round((stats.filledAll / stats.totalAll) * 100) : 0}%</strong>
            </p>
            <p className="text-sm text-gray-600">
              - Dernière mise à jour le <strong>{new Date(action.last_modif_date).toLocaleDateString()}</strong>
              <span>
                {" "}par <strong>{action.last_modif_by_name || action.last_modif_by_email || "Inconnu"}</strong>
              </span>
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between border-b border-gray-200 mb-8">
          <div className="flex items-center">
            {dynamicTabs.map((tab) => (
              <button
                key={tab.key}
                className={`px-6 py-3 text-sm font-semibold transition-all ${
                  activeTab === tab.key ? "text-primary-green border-b-2 border-primary-green" : "text-gray-500 hover:text-primary-green"
                }`}
                onClick={() => setActiveTab(tab.key)}
              >
                <div className="flex items-center gap-2">
                  {tab.label}
                  <div className="flex items-center gap-1 text-xs text-gray-600">
                    <ProgressCircle percentage={getTabProgress(tab)} size={16} />
                    <span>{getTabProgress(tab)}%</span>
                  </div>
                </div>
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <div className="relative group">
              <button
                onClick={exportIndicatorTemplate}
                disabled={isExporting}
                className="inline-flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-300"
                title="Téléchargez le fichier Excel des indicateurs de cette action"
              >
                {isExporting ? <FiLoader className="w-4 h-4 animate-spin" /> : <FiDownload className="w-4 h-4" />}
                <span>Telecharger le template</span>
              </button>
            </div>

            <div className="relative group">
              <label
                className={`inline-flex items-center gap-2 px-3 py-2 bg-primary-green text-white rounded-lg text-sm font-medium hover:bg-primary-green/90 cursor-pointer ${
                  isImporting ? "opacity-50 cursor-not-allowed" : ""
                }`}
                title="Importez le fichier Excel rempli pour mettre à jour les indicateurs de cette action"
              >
                {isImporting ? <FiLoader className="w-4 h-4 animate-spin" /> : <FiUpload className="w-4 h-4" />}
                <span>Importer les Valeurs</span>
                <input type="file" accept=".xlsx" className="hidden" disabled={isImporting} onChange={(e) => e.target.files[0] && importIndicatorValues(e.target.files[0])} />
              </label>
            </div>

            <div className="relative group">
              <button className="p-2 text-gray-400 hover:text-gray-600 transition-colors" aria-label="Information">
                <FiInfo className="w-4 h-4" />
              </button>
              <div className="absolute right-0 top-full mt-2 w-64 p-3 bg-gray-900 text-white text-xs rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-10 pointer-events-none">
                Téléchargez le template des indicateurs de cette action et ensuite importez le pour mettre à jour les indicateurs
                <div className="absolute bottom-full right-4 border-4 border-transparent border-b-gray-900"></div>
              </div>
            </div>
          </div>
        </div>

        <IndicatorView
          action={action}
          activeSituation={currentTab?.situation}
          activeYear={currentTab?.year}
          refreshKey={refreshKey}
          onStatsRefresh={fetchStats}
        />
      </div>
    </div>
  )
}

function IndicatorView({ action, activeSituation, activeYear, refreshKey, onStatsRefresh }) {
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
    const condParams = { collectivity_id: action.collectivity_id, excel_indicator_ids: [...excelIds] }
    if (action.owner === 'economic_actor') {
      condParams.owner = 'economic_actor'
      condParams.economic_actor_id = action.economic_actor_id
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
    const { ok, data: resData, code } = await api.post("/indicator_value/search", { indicator_ids: [...indicatorIds], situation: activeSituation, collectivity_id: action.collectivity_id, owner: 'economic_actor', limit: 10000, year: activeYear })
    if (!ok) return toast.error(code || "Une erreur est survenue")
    const grouped = {}
    for (const iv of resData) {
      if (!grouped[iv.indicator_id]) grouped[iv.indicator_id] = []
      grouped[iv.indicator_id].push(iv)
    }
    setEconomicActorData(grouped)
  }

  const loadData = async () => {
    if (!action || !activeSituation) return
    setIsLoading(true)
    try {
      const params = { action_id: action._id, situation: activeSituation, limit: 10000 }
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
      // Optimistic update
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
  }, [action?._id, activeSituation, activeYear, refreshKey])

  useEffect(() => {
    setSelectedCategory(null)
  }, [action?._id, activeSituation, activeYear])

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
        <div className="card-shadow p-4 sticky top-8 self-start">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Situation : {activeSituation ? `${SITUATION_LABELS[activeSituation]} ${activeYear || ''}` : ''}</h3>
          </div>
          <div className="overflow-y-auto max-h-[calc(100vh-300px)]">
            {isLoading ? (
              <Loader size="small" />
            ) : (
              <IndicatorsList
                displayedIndicatorValues={displayedIndicatorValues}
                selectedCategory={selectedCategory}
                onSelectCategory={setSelectedCategory}
              />
            )}
          </div>
        </div>
      </div>

      <div className="flex-1">
        <SituationTab
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
