import React, { useState, useEffect, useRef } from "react"
import { useNavigate } from "react-router-dom"
import api from "@/services/api"
import toast from "react-hot-toast"
import { FiArrowLeft, FiLoader, FiBarChart2 } from "react-icons/fi"
import { shouldDisplayIndicatorFromMap, fetchConditionValuesMap, isIndicatorValueFilled } from "@/utils/indicatorHelpers"
import Loader from "@/components/loader"
import ProgressCircle from "@/components/ProgressCircle"
import IndicatorsList from "./IndicatorsList"
import SituationTab from "./SituationTab"

const HIDDEN_INDICATOR_IDS = ["AnneeRempl", "AnRef", "ActionsAutres", "ActionsCharte"]
const SITUATION_LABELS = { init: "Initiale", ref: "Référence", prev: "Prévisionnel", expost: "Ex-post" }
const SITUATION_ORDER = ["init", "ref", "prev", "expost"]

export default function Completion({ action, onSave }) {
  const navigate = useNavigate()

  const [activeSituation, setActiveSituation] = useState(null)
  const [activeYear, setActiveYear] = useState(null)
  const [stats, setStats] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  const situationYears = stats?.situationYears || {}
  const availableSituations = SITUATION_ORDER.filter((s) => situationYears[s]?.length > 0)

  const getSituationProgress = (situation, year) => {
    if (!stats?.completion) return 0
    const c = stats.completion[`${situation}_${year}`]
    return c?.total > 0 ? Math.round((c.filled / c.total) * 100) : 0
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

  useEffect(() => {
    setIsLoading(true)
    fetchStats().finally(() => setIsLoading(false))
  }, [action._id, action.collectivity_id])

  useEffect(() => {
    if (availableSituations.length > 0) {
      if (!activeSituation || !situationYears[activeSituation]) {
        setActiveSituation(availableSituations[0])
        setActiveYear(situationYears[availableSituations[0]]?.[0])
      } else if (activeYear && !situationYears[activeSituation]?.includes(activeYear)) {
        setActiveYear(situationYears[activeSituation]?.[0])
      }
    }
  }, [stats])

  if (isLoading) return <Loader />

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center gap-2 text-sm text-gray-600 mb-4">
          <button onClick={() => { onSave?.(); navigate("/actions") }} className="hover:text-primary-green transition-colors">
            Actions
          </button>
          <span>/</span>
          <button onClick={() => { onSave?.(); navigate(`/actions/${action._id}/dashboard`) }} className="hover:text-primary-green transition-colors truncate max-w-[150px]">
            {action.name}
            {action.instance_number > 1 ? ` #${action.instance_number}` : ""}
          </button>
          <span>/</span>
          <span className="text-gray-900 font-medium">Complétion</span>
        </div>

        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  onSave?.()
                  navigate(-1)
                }}
                className="p-2 pl-0 rounded-full hover:bg-gray-100 text-gray-600 hover:text-primary-green transition-colors"
                aria-label="Revenir à la page précédente"
              >
                <FiArrowLeft size={18} />
              </button>
              <h1 className="text-3xl font-bold text-gray-900">
                {action.name}
                {action.instance_number > 1 && <span className="text-lg font-medium text-gray-400 ml-2">#{action.instance_number}</span>}
              </h1>
              <button
                onClick={() => {
                  onSave?.()
                  navigate(`/actions/${action._id}/dashboard`)
                }}
                disabled={isSaving}
                className="inline-flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-300 disabled:opacity-60 disabled:cursor-not-allowed"
                title={isSaving ? "Enregistrement en cours…" : "Visualiser les graphiques de cette action"}
              >
                {isSaving ? <FiLoader className="w-4 h-4 animate-spin" /> : <FiBarChart2 className="w-4 h-4" />}
                <span>Visualiser mes graphs</span>
              </button>
            </div>
          </div>
        </div>

        <div className="flex items-center border-b border-gray-200 mb-4">
          <div className="flex items-center">
            {availableSituations.map((situation) => {
              const years = situationYears[situation] || []
              const totalProgress = years.length > 0 ? Math.round(years.reduce((sum, y) => sum + getSituationProgress(situation, y), 0) / years.length) : 0
              return (
                <button
                  key={situation}
                  className={`px-6 py-3 text-sm font-semibold transition-all ${
                    activeSituation === situation ? "text-primary-green border-b-2 border-primary-green" : "text-gray-500 hover:text-primary-green"
                  }`}
                  onClick={() => {
                    setActiveSituation(situation)
                    setActiveYear(situationYears[situation]?.[0])
                  }}
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
        </div>

        {activeSituation && situationYears[activeSituation]?.length > 0 && (
          <div className="flex items-center gap-2 mb-6">
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
          action={action}
          activeSituation={activeSituation}
          activeYear={activeYear}
          onStatsRefresh={fetchStats}
          onSavingChange={setIsSaving}
          yearMappings={stats?.yearMappingsBySituationYear?.[`${activeSituation}_${activeYear}`]}
          tabTotal={stats?.completion?.[`${activeSituation}_${activeYear}`]?.total || 0}
        />
      </div>
    </div>
  )
}

function IndicatorView({ action, activeSituation, activeYear, onStatsRefresh, onSavingChange, yearMappings, tabTotal }) {
  const [indicatorValues, setIndicatorValues] = useState([])
  const [conditionValuesMap, setConditionValuesMap] = useState(new Map())
  const [economicActorData, setEconomicActorData] = useState({})
  const [selectedCategory, setSelectedCategory] = useState(null)
  const [isLoading, setIsLoading] = useState(false)

  const displayedIndicatorValues = indicatorValues.filter(
    (iv) => !HIDDEN_INDICATOR_IDS.includes(iv.indicator_excel_id) && shouldDisplayIndicatorFromMap(iv, yearMappings, conditionValuesMap)
  )

  const fetchConditionValues = async (data) => {
    const map = await fetchConditionValuesMap(data, action)
    setConditionValuesMap(map)
  }

  const fetchEconomicActorData = async (data) => {
    const indicatorIds = new Set()
    for (const iv of data) indicatorIds.add(iv.indicator_id)
    if (indicatorIds.size === 0) return
    const {
      ok,
      data: resData,
      code
    } = await api.post("/indicator_value/search", {
      indicator_ids: [...indicatorIds],
      situation: activeSituation,
      collectivity_id: action.collectivity_id,
      owner: "economic_actor",
      limit: 10000,
      year: activeYear
    })
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
      // Figé au chargement : un indicateur rempli en cours de session reste dans sa section jusqu'au prochain chargement
      setIndicatorValues(data.map((iv) => ({ ...iv, initially_filled: isIndicatorValueFilled(iv) })))
      await Promise.all([fetchConditionValues(data), fetchEconomicActorData(data)])
    } catch (error) {
      toast.error("Une erreur est survenue")
    } finally {
      setIsLoading(false)
    }
  }

  const saveCounterRef = useRef(0)
  const handleSaveIndicatorValue = async (indicatorValue) => {
    saveCounterRef.current += 1
    const mySaveId = saveCounterRef.current
    toast.loading("Valeur enregistrée, modification du dashboard en cours...", { id: "indicator-save" })
    try {
      onSavingChange?.(true)
      setIndicatorValues((prev) => prev.map((iv) => (iv._id === indicatorValue._id ? indicatorValue : iv)))
      if (indicatorValue.indicator_excel_id) {
        setConditionValuesMap((prev) => {
          const condKey = `${indicatorValue.indicator_excel_id}_${indicatorValue.situation}_${indicatorValue.year}`
          if (!prev.has(condKey)) return prev
          const next = new Map(prev)
          next.set(condKey, { ...prev.get(condKey), value: indicatorValue.value, indicator_type: indicatorValue.indicator_type })
          return next
        })
      }
      const { ok, code } = await api.put(`/indicator_value/${indicatorValue._id}`, { source: "manual", ...indicatorValue })
      if (!ok) return toast.error(code || "Une erreur est survenue", { id: "indicator-save" })
      await onStatsRefresh()
      toast.success("Valeur enregistrée", { id: "indicator-save" })
    } catch (error) {
      toast.error("Une erreur est survenue", { id: "indicator-save" })
    } finally {
      if (mySaveId === saveCounterRef.current) onSavingChange?.(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [action?._id, activeSituation, activeYear])

  useEffect(() => {
    setSelectedCategory(null)
  }, [action?._id, activeSituation, activeYear])

  if (isLoading && !indicatorValues.length) return <Loader />

  if (!isLoading && tabTotal === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-gray-400">
        <svg className="w-16 h-16 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
        <p className="text-lg font-medium text-gray-600">Aucun indicateur pour cette situation</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col lg:flex-row gap-6">
      <div className="w-full lg:w-72 shrink-0">
        <div className="card-shadow p-4 sticky top-8 self-start">
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
          economicActorData={economicActorData}
          onSave={handleSaveIndicatorValue}
          isViewLoading={isLoading}
        />
      </div>
    </div>
  )
}
