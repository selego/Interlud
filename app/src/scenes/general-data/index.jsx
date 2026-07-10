import React, { useState, useEffect } from "react"
import api from "@/services/api"
import toast from "react-hot-toast"
import useStore from "@/services/store"
import Loader from "@/components/loader"
import ProgressCircle from "@/components/ProgressCircle"
import { FiInfo } from "react-icons/fi"
import { isIndicatorValueFilled, shouldDisplayIndicatorFromMap, fetchConditionValuesMap } from "@/utils/indicatorHelpers"
import IndicatorsList from "./IndicatorsList"
import SituationTab from "./SituationTab"

const HIDDEN_INDICATOR_IDS = ["AnneeRempl", "AnRef", "ActionsAutres", "ActionsCharte"]
const SITUATION_LABELS = { init: "Initiale", ref: "Référence", prev: "Prévisionnel", expost: "Ex-post" }
const SITUATION_ORDER = ["init", "ref", "prev", "expost"]

export default function Index() {
  const { collectivity, user } = useStore()
  const [configActions, setConfigActions] = useState([])
  const [activeConfigIndex, setActiveConfigIndex] = useState(0)
  const [activeSituation, setActiveSituation] = useState(null)
  const [activeYear, setActiveYear] = useState(null)
  const [stats, setStats] = useState(null)
  const [isStatsLoading, setIsStatsLoading] = useState(false)

  const activeConfigAction = configActions[activeConfigIndex]
  const situationYears = stats?.situationYears || {}
  const availableSituations = SITUATION_ORDER.filter((s) => situationYears[s]?.length > 0)

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
      setConfigActions(user?.role === "economic_actor" ? data.filter((ca) => ca.name !== "Données de base") : data)
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
      <div className="min-h-screen p-8">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-3xl font-bold text-gray-900 mb-8">Données générales</h1>
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <svg className="w-16 h-16 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            <p className="text-lg font-medium text-gray-600">Aucune donnée générale disponible</p>
            <p className="text-sm text-gray-400 mt-2">Créez votre première action pour initialiser les données générales.</p>
          </div>
        </div>
      </div>
    )
  }

  const globalProgress = stats?.totalAll > 0 ? Math.round((stats.filledAll / stats.totalAll) * 100) : 0

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-3xl font-bold text-gray-900">Données générales</h1>
          </div>

          {configActions.length > 1 && (
            <div className="inline-flex items-center bg-gray-100 rounded-lg p-0.5 mb-4">
              {configActions.map((ca, index) => (
                <button
                  key={ca._id}
                  className={`px-3 h-8 text-sm font-medium rounded-md transition-all ${
                    activeConfigIndex === index ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
                  }`}
                  onClick={() => setActiveConfigIndex(index)}
                >
                  {ca.name}
                </button>
              ))}
            </div>
          )}

          {activeConfigAction?.name?.toLowerCase().includes("parc") && (
            <div className="flex items-start gap-2 mb-4 p-3 rounded-lg bg-blue-50 border border-blue-200 text-sm text-blue-800">
              <FiInfo className="w-4 h-4 mt-0.5 shrink-0" />
              <span>Toutes les données sont préremplies avec des valeurs par défaut lorsqu'elles sont disponibles. Elles peuvent être modifiées à tout moment par la collectivité elle-même.</span>
            </div>
          )}

          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-2 text-sm min-h-[32px]">
              <ProgressCircle percentage={globalProgress} size={20} />
              <span className="text-gray-900">
                Complété à <strong>{globalProgress}%</strong>
              </span>
              {activeConfigAction?.last_modif_date && (
                <>
                  <span className="text-gray-300">·</span>
                  <span className="text-gray-600">
                    MAJ le <strong>{new Date(activeConfigAction.last_modif_date).toLocaleDateString()}</strong>
                    {(activeConfigAction.last_modif_by_name || activeConfigAction.last_modif_by_email) && (
                      <> par <strong>{activeConfigAction.last_modif_by_name || activeConfigAction.last_modif_by_email}</strong></>
                    )}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {isStatsLoading ? (
          <Loader />
        ) : (
          <>
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
              <>
                <div className="flex items-center gap-2 mb-4">
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
                {activeYear && stats?.actionsBySituationYear?.[`${activeSituation}_${activeYear}`]?.length > 0 && (
                  <div className="flex items-center gap-2 mb-6 flex-wrap text-sm text-gray-500">
                    <span className="font-medium text-gray-600">Actions concernées :</span>
                    {stats?.actionsBySituationYear?.[`${activeSituation}_${activeYear}`].map((action, i) => (
                      <span
                        key={`${action.name}_${action.instance_number}_${i}`}
                        className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700"
                      >
                        {action.name || action}
                        {action.instance_number ? ` #${action.instance_number}` : ""}
                      </span>
                    ))}
                  </div>
                )}
              </>
            )}

            <IndicatorView
              activeConfigAction={activeConfigAction}
              activeSituation={activeSituation}
              activeYear={activeYear}
              onStatsRefresh={() => fetchStats(activeConfigAction._id)}
              yearMappings={stats?.yearMappingsBySituationYear?.[`${activeSituation}_${activeYear}`]}
              tabTotal={stats?.completion?.[`${activeSituation}_${activeYear}`]?.total || 0}
            />
          </>
        )}
      </div>
    </div>
  )
}

function IndicatorView({ activeConfigAction, activeSituation, activeYear, onStatsRefresh, yearMappings, tabTotal }) {
  const [indicatorValues, setIndicatorValues] = useState([])
  const [conditionValuesMap, setConditionValuesMap] = useState(new Map())
  const [economicActorData, setEconomicActorData] = useState({})
  const [selectedCategory, setSelectedCategory] = useState(null)
  const [isLoading, setIsLoading] = useState(false)

  const displayedIndicatorValues = indicatorValues.filter(
    (iv) => !HIDDEN_INDICATOR_IDS.includes(iv.indicator_excel_id) && shouldDisplayIndicatorFromMap(iv, yearMappings, conditionValuesMap)
  )

  const fetchConditionValues = async (data) => {
    const map = await fetchConditionValuesMap(data, activeConfigAction)
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
      collectivity_id: activeConfigAction.collectivity_id,
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
    if (!activeConfigAction || !activeSituation) return
    setIsLoading(true)
    try {
      const params = { action_id: activeConfigAction._id, situation: activeSituation, limit: 10000 }
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

  const handleSaveIndicatorValue = async (indicatorValue) => {
    toast.loading("Valeur enregistrée, modification du dashboard en cours...", { id: "indicator-save" })
    try {
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
    }
  }

  useEffect(() => {
    loadData()
  }, [activeConfigAction?._id, activeSituation, activeYear])

  useEffect(() => {
    setSelectedCategory(null)
  }, [activeConfigAction?._id, activeSituation, activeYear])

  useEffect(() => {
    if (displayedIndicatorValues.length > 0) {
      const firstCat = displayedIndicatorValues[0]?.indicator_category_name
      if (firstCat && (!selectedCategory || !displayedIndicatorValues.some((iv) => iv.indicator_category_name === selectedCategory.categoryName))) {
        setSelectedCategory({ categoryName: firstCat })
      }
    }
  }, [displayedIndicatorValues.length])

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
          <div className="flex items-baseline justify-between mb-3.5">
            <h3 className="text-[15px] font-bold text-[#0A3641]">Catégories</h3>
            <span className="text-xs text-[#9aa8a4]">{displayedIndicatorValues.filter((iv) => !isIndicatorValueFilled(iv)).length} à remplir</span>
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
          economicActorData={economicActorData}
          onSave={handleSaveIndicatorValue}
          isViewLoading={isLoading}
        />
      </div>
    </div>
  )
}
