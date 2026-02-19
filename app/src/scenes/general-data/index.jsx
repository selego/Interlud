import React, { useState, useEffect } from "react"
import api from "@/services/api"
import toast from "react-hot-toast"
import useStore from "@/services/store"
import Loader from "@/components/loader"
import ProgressCircle from "@/components/ProgressCircle"
import { FiDownload, FiUpload, FiInfo, FiFilter } from "react-icons/fi"
import { isIndicatorValueFilled, shouldDisplayIndicatorFromMap, fetchConditionValuesMap } from "@/utils/indicatorHelpers"
import IndicatorsList from "./IndicatorsList"
import SituationTab from "./SituationTab"

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
  const [showUnfilledOnly, setShowUnfilledOnly] = useState(true)

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
        <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-4 py-2.5 mb-6">
          <FiInfo className="w-4 h-4 text-blue-500 shrink-0" />
          <p className="text-sm text-blue-700">Ces données sont obligatoires pour les calculs des gains environnementaux des actions. Les données de parc type sont remplies avec des données par défaut d'Interlud.</p>
        </div>

        <div className="flex items-center gap-3 mb-6">
          {configActions.length > 1 && (
            <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
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
          <button
            onClick={() => setShowUnfilledOnly(prev => !prev)}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all border ${ showUnfilledOnly? 'bg-amber-50 border-amber-300 text-amber-700': 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}
          >
            <FiFilter className="w-4 h-4" />
            {showUnfilledOnly ? 'Afficher les valeurs remplies' : 'Non remplis uniquement'}
          </button>
        </div>

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
                  {stats?.actionsBySituationYear?.[`${activeSituation}_${activeYear}`].map((name) => (
                    <span key={name} className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                      {name}
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
            refreshKey={refreshKey}
            onStatsRefresh={() => fetchStats(activeConfigAction._id)}
            yearMappings={stats?.yearMappingsBySituationYear?.[`${activeSituation}_${activeYear}`]}
            showUnfilledOnly={showUnfilledOnly}
            onToggleUnfilledOnly={() => setShowUnfilledOnly(false)}
          />
        </>)}
      </div>
    </div>
  )
}

function IndicatorView({ activeConfigAction, activeSituation, activeYear, refreshKey, onStatsRefresh, yearMappings, showUnfilledOnly, onToggleUnfilledOnly }) {
  const [indicatorValues, setIndicatorValues] = useState([])
  const [conditionValuesMap, setConditionValuesMap] = useState(new Map())
  const [economicActorData, setEconomicActorData] = useState({})
  const [selectedCategory, setSelectedCategory] = useState(null)
  const [isLoading, setIsLoading] = useState(false)

  const displayedIndicatorValues = indicatorValues.filter(iv => !HIDDEN_INDICATOR_IDS.includes(iv.indicator_excel_id) && shouldDisplayIndicatorFromMap(iv, yearMappings, conditionValuesMap))

  const fetchConditionValues = async (data) => {
    const map = await fetchConditionValuesMap(data, activeConfigAction)
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
      if (showUnfilledOnly) params.unfilled_only = true
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
      if (showUnfilledOnly && isIndicatorValueFilled(indicatorValue)) setIndicatorValues(prev => prev.filter(iv => iv._id !== indicatorValue._id))
      if (!showUnfilledOnly) setIndicatorValues(prev => prev.map(iv => iv._id === indicatorValue._id ? indicatorValue : iv))
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
  }, [activeConfigAction?._id, activeSituation, activeYear, refreshKey, showUnfilledOnly])

  useEffect(() => {
    setSelectedCategory(null)
  }, [activeConfigAction?._id, activeSituation, activeYear])

  useEffect(() => {
    if (displayedIndicatorValues.length > 0) {
      const firstCat = displayedIndicatorValues[0]?.indicator_category_name
      if (firstCat && (!selectedCategory || !displayedIndicatorValues.some(iv => iv.indicator_category_name === selectedCategory.categoryName))) setSelectedCategory({ categoryName: firstCat })
    }
  }, [displayedIndicatorValues.length])

  if (isLoading && !indicatorValues.length) return <Loader />

  if (!isLoading && showUnfilledOnly && displayedIndicatorValues.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-gray-400">
        <svg className="w-16 h-16 mb-4 text-primary-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p className="text-lg font-medium text-gray-600">Tous les indicateurs sont remplis</p>
        <button onClick={onToggleUnfilledOnly} className="mt-4 text-sm text-primary-green hover:underline">
          Afficher tous les indicateurs
        </button>
      </div>
    )
  }

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
              <IndicatorsList
                displayedIndicatorValues={displayedIndicatorValues}
                selectedCategory={selectedCategory}
                onSelectCategory={setSelectedCategory}
                showUnfilledOnly={showUnfilledOnly}
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
