import React, { useState, useEffect, useRef } from "react"
import { useNavigate } from "react-router-dom"
import api from "@/services/api"
import toast from "react-hot-toast"
import { FiArrowLeft, FiLoader, FiBarChart2, FiPlus, FiCalendar, FiInfo } from "react-icons/fi"
import { shouldDisplayIndicatorFromMap, fetchConditionValuesMap, isIndicatorValueFilled } from "@/utils/indicatorHelpers"
import useStore from "@/services/store"
import Loader from "@/components/loader"
import ProgressCircle from "@/components/ProgressCircle"
import Modal from "@/components/modal"
import Select from "@/components/Select"
import IndicatorsList from "./IndicatorsList"
import SituationTab from "./SituationTab"

const HIDDEN_INDICATOR_IDS = ["AnneeRempl", "AnRef", "ActionsAutres", "ActionsCharte"]
const SITUATION_LABELS = { init: "Initiale", ref: "Référence", prev: "Prévisionnel", expost: "Ex-post" }
const SITUATION_DESCRIPTIONS = {
  init: "État des lieux au démarrage de l'action, avant toute mise en œuvre.",
  ref: "Année de référence servant de base de comparaison pour mesurer les évolutions.",
  prev: "Projection des résultats attendus de l'action sur les années à venir.",
  expost: "Évaluation des résultats réels constatés après la mise en œuvre de l'action.",
}
const SITUATION_ORDER = ["init", "ref", "prev", "expost"]

export default function Completion({ action, onSave }) {
  const navigate = useNavigate()
  const { user } = useStore()
  const isAdmin = user.role === "admin" || user.collectivities.some((c) => c.id === action.collectivity_id && c.role === "admin")

  const [activeSituation, setActiveSituation] = useState(null)
  const [activeYear, setActiveYear] = useState(null)
  const [stats, setStats] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isAddYearOpen, setIsAddYearOpen] = useState(false)

  const situationYears = stats?.situationYears || {}
  const availableSituations = SITUATION_ORDER.filter((s) => situationYears[s]?.length > 0 || (isAdmin && (s === "prev" || s === "expost")))

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
    if (!stats) return
    if (availableSituations.length > 0) {
      if (!activeSituation || !availableSituations.includes(activeSituation)) {
        const defaultSituation = availableSituations.includes("init") ? "init" : availableSituations[0]
        setActiveSituation(defaultSituation)
        setActiveYear(situationYears[defaultSituation]?.[0])
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
                    <span className="group/tip relative inline-flex items-center">
                      <FiInfo className="w-3.5 h-3.5 text-gray-400 hover:text-primary-green" />
                      <span className="pointer-events-none absolute left-1/2 top-full z-50 mt-2 w-56 -translate-x-1/2 rounded-lg bg-gray-900 px-3 py-2 text-xs font-normal leading-snug text-white text-left opacity-0 shadow-lg transition-opacity duration-150 group-hover/tip:opacity-100">
                        {SITUATION_DESCRIPTIONS[situation]}
                      </span>
                    </span>
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

        {situationYears[activeSituation]?.length > 0 && (
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
            {isAdmin && (activeSituation === "prev" || activeSituation === "expost") && (
              <button
                className="flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium rounded-full border border-dashed border-gray-300 text-gray-500 hover:border-primary-green hover:text-primary-green transition-all"
                onClick={() => setIsAddYearOpen(true)}
              >
                <FiPlus className="w-4 h-4" />
                Ajouter une année
              </button>
            )}
          </div>
        )}

        {isAddYearOpen && (
          <AddYearModal
            action={action}
            situation={activeSituation}
            existingYears={situationYears[activeSituation] || []}
            onClose={() => setIsAddYearOpen(false)}
            onAdded={async (year) => {
              setIsAddYearOpen(false)
              await fetchStats()
              setActiveYear(year)
            }}
          />
        )}

        {(activeSituation === "prev" || activeSituation === "expost") && !(situationYears[activeSituation]?.length > 0) ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="flex items-center justify-center w-16 h-16 rounded-full bg-primary-green/10 text-primary-green mb-5">
              <FiCalendar className="w-8 h-8" />
            </div>
            <p className="text-lg font-semibold text-gray-800">
              Aucune année {activeSituation === "prev" ? "prévisionnelle" : "ex-post"}
            </p>
            <p className="text-sm text-gray-500 mt-1 mb-6 max-w-md">
              Créez une première année {activeSituation === "prev" ? "prévisionnelle" : "ex-post"} pour commencer à renseigner les indicateurs de cette situation.
            </p>
            <button onClick={() => setIsAddYearOpen(true)} className="button-primary inline-flex items-center gap-2">
              <FiPlus className="w-4 h-4" />
              Créer une année {activeSituation === "prev" ? "prévisionnelle" : "ex-post"}
            </button>
          </div>
        ) : (
        <IndicatorView
          action={action}
          activeSituation={activeSituation}
          activeYear={activeYear}
          onStatsRefresh={fetchStats}
          onSavingChange={setIsSaving}
          yearMappings={stats?.yearMappingsBySituationYear?.[`${activeSituation}_${activeYear}`]}
          tabTotal={stats?.completion?.[`${activeSituation}_${activeYear}`]?.total || 0}
        />
        )}
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

function AddYearModal({ action, situation, existingYears, onClose, onAdded }) {
  const [newYear, setNewYear] = useState("")
  const [isAdding, setIsAdding] = useState(false)
  const [seconds, setSeconds] = useState(0)

  useEffect(() => {
    if (!isAdding) return
    const id = setInterval(() => setSeconds((s) => s + 1), 1000)
    return () => clearInterval(id)
  }, [isAdding])

  const handleAdd = async () => {
    if (!newYear) return toast.error("Veuillez sélectionner une année")
    try {
      setIsAdding(true)
      const endpoint = situation === "prev" ? "/action/add_year_previsionnel" : "/action/add_year_expost"
      const yearField = situation === "prev" ? "year_prev" : "year_expost"
      const { ok, code } = await api.post(endpoint, { action_id: action._id, [yearField]: parseInt(newYear) })
      if (!ok) return toast.error(code || "Une erreur est survenue")
      toast.success(situation === "prev" ? "Situation prévisionnelle ajoutée" : "Situation ex-post ajoutée")
      await onAdded(parseInt(newYear))
    } catch (error) {
      toast.error("Une erreur est survenue")
    } finally {
      setIsAdding(false)
    }
  }

  return (
    <Modal isOpen={true} onClose={() => { if (!isAdding) onClose() }} className="max-w-md">
      <div className="p-6">
        <h2 className="text-xl font-bold text-gray-800 mb-6">
          {situation === "prev" ? "Ajouter une situation prévisionnelle" : "Ajouter une situation ex-post"}
        </h2>
        {isAdding ? (
          <div className="flex flex-col items-center justify-center py-10 gap-5">
            <div className="relative w-16 h-16">
              <div className="absolute inset-0 rounded-full border-4 border-gray-200"></div>
              <div className="absolute inset-0 rounded-full border-4 border-primary-green border-t-transparent animate-spin"></div>
            </div>
            <div className="text-center">
              <p className="text-lg font-semibold text-gray-800 mb-1">Création en cours...</p>
              <p className="text-sm text-gray-500 mb-3">
                {seconds < 10
                  ? "Préparation des fichiers des indicateurs"
                  : seconds < 25
                  ? "Préparation des moteurs de calcul"
                  : seconds < 40
                  ? "Génerations des valeurs par défaut"
                  : seconds < 60
                  ? "Application des valeurs par défaut"
                  : seconds < 80
                  ? "Création du dashboard"
                  : seconds < 100
                  ? "Finalisation de la création"
                  : "Finalisation et vérification des résultats"}
              </p>
              <p className="text-xs text-gray-400">Cette opération peut prendre plusieurs minutes</p>
            </div>
          </div>
        ) : (
          <>
            <div className="mb-6">
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                {situation === "prev" ? "Année prévisionnelle" : "Année ex-post"} <span className="text-red-500">*</span>
              </label>
              <Select
                options={Array.from({ length: 30 }, (_, i) => new Date().getFullYear() + i)
                  .filter((year) => !existingYears.includes(year))
                  .map((year) => ({ value: year.toString(), label: year.toString() }))}
                value={newYear}
                onChange={(value) => setNewYear(value)}
                placeholder="Sélectionner une année"
                constrained={true}
              />
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={handleAdd} className="button-primary">Créer</button>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}
