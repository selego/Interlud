import React, { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import api from "@/services/api"
import toast from "react-hot-toast"
import { SITUATION_TYPES } from "@/utils/constants"
import ProgressCircle from "@/components/ProgressCircle"
import IndicatorsList from "./IndicatorsList"
import SituationTab from "./SituationTab"
import { FiArrowLeft, FiDownload, FiUpload, FiLoader, FiInfo } from "react-icons/fi"
import useStore from "@/services/store"

export const SITUATION_TABS = [
  { key: SITUATION_TYPES.INIT, label: "Initiale" },
  { key: SITUATION_TYPES.REF, label: "Référence" },
  { key: SITUATION_TYPES.PREV, label: "Prévisionnel" },
  { key: SITUATION_TYPES.EXPOST, label: "Ex-post" }
]

export default function Completion({ action }) {
  const { collectivity } = useStore()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState(SITUATION_TYPES.INIT)
  const [selectedIndicatorValue, setSelectedIndicatorValue] = useState(null)
  const [indicatorValues, setIndicatorValues] = useState([])
  const [allIndicatorValues, setAllIndicatorValues] = useState([])
  const [allCollectivityIndicatorValues, setAllCollectivityIndicatorValues] = useState([])
  const [isExporting, setIsExporting] = useState(false)
  const [isImporting, setIsImporting] = useState(false)

  // Pour les actions config, construire les onglets à partir des années distinctes dans les indicatorValues
  const buildDynamicTabs = () => {
    if (action.type === 'config' && allIndicatorValues.length > 0) {
      const situationLabels = { init: 'Init', ref: 'Réf', prev: 'Prév', expost: 'Expost' }
      const situations = ['init', 'ref', 'prev', 'expost']
      const tabs = []

      for (const situation of situations) {
        const years = [...new Set(allIndicatorValues.filter(iv => iv.situation === situation && iv.year).map(iv => iv.year))].sort()
        for (const year of years) {
          tabs.push({ key: `${situation}_${year}`, label: `${situationLabels[situation]} ${year}`,situation,year})
        }
      }
      return tabs.length > 0 ? tabs : [{ key: SITUATION_TYPES.INIT, label: "Initiale", situation: SITUATION_TYPES.INIT }]
    }

    return [
      { key: SITUATION_TYPES.INIT, label: `Initiale${action.year_init ? ` ${action.year_init}` : ""}`, situation: SITUATION_TYPES.INIT },
      { key: SITUATION_TYPES.REF, label: `Référence${action.year_ref ? ` ${action.year_ref}` : ""}`, situation: SITUATION_TYPES.REF },
      ...(action.excel_files || []).map((file) => ({ key: `prev_${file.year_prev}`, label: `Prév. ${file.year_prev}`, year: file.year_prev, situation: SITUATION_TYPES.PREV })),
      ...(action.excel_files_expost || []).map((file) => ({ key: `expost_${file.year_expost}`, label: `Expost ${file.year_expost}`, year: file.year_expost, situation: SITUATION_TYPES.EXPOST })),
    ]
  }

  const dynamicTabs = buildDynamicTabs()

  const fetchIndicatorsValues = async () => {
    try {
      const currentTab = dynamicTabs.find((t) => t.key === activeTab)
      const searchParams = { action_id: action._id, situation: currentTab?.situation, limit: 10000 }
      if (currentTab?.year && (action.type === 'config' || currentTab?.situation === SITUATION_TYPES.PREV || currentTab?.situation === SITUATION_TYPES.EXPOST)) searchParams.year = currentTab.year
      const { ok, data, code } = await api.post(`/indicator_value/search`, searchParams)
      if (!ok) return toast.error(code || "Erreur lors du chargement")
      setIndicatorValues(data)
    } catch (error) {
      toast.error("Une erreur est survenue")
    }
  }

  const fetchAllIndicatorsValues = async () => {
    try {
      const { ok, data, code } = await api.post(`/indicator_value/search`, { action_id: action._id, limit: 10000 })
      if (!ok) return toast.error(code || "Erreur lors du chargement")
      setAllIndicatorValues(data)
    } catch (error) {
      toast.error("Une erreur est survenue")
    }
  }

  const fetchAllCollectivityIndicatorValues = async () => {
    try {
      const searchParams = { collectivity_id: action.collectivity_id, limit: 10000 }
      if (action.owner === 'economic_actor') {
        searchParams.owner = 'economic_actor'
        searchParams.economic_actor_id = action.economic_actor_id
      }
      const { ok, data, code } = await api.post(`/indicator_value/search`, searchParams)
      if (!ok) return toast.error(code || "Erreur lors du chargement")
      setAllCollectivityIndicatorValues(data)
    } catch (error) {
      toast.error("Une erreur est survenue")
    }
  }

  const exportIndicatorTemplate = async () => {
    try {
      if (!collectivity.excelFileId) return toast.error("Aucun fichier Excel associé")
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
      if (!collectivity.excelFileId) return toast.error("Aucun fichier Excel associé")
      if (!file) return

      setIsImporting(true)
      const reader = new FileReader()
      reader.readAsDataURL(file)
      reader.onload = async () => {
        try {
          const base64 = reader.result.split(",")[1]
          const { ok, code } = await api.post("/indicator_value/importIndicatorValues", { fileBase64: base64, collectivity: collectivity })
          if (!ok) return toast.error(code || "Erreur lors de l'import")
          toast.success("Valeurs importées avec succès")
          fetchIndicatorsValues()
          fetchAllIndicatorsValues()
          fetchAllCollectivityIndicatorValues()
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

  const HIDDEN_INDICATOR_IDS = ['AnneeRempl', 'AnRef']
  const isYearIndicator = (iv) => HIDDEN_INDICATOR_IDS.includes(iv.indicator_excel_id)

  const isIndicatorValueFilled = (indicatorValue) => {
    const val = indicatorValue.value?.[indicatorValue.indicator_type]
    if (indicatorValue.indicator_type === "checkbox") return Array.isArray(val) && val.length > 0
    return val !== null && val !== undefined && val !== ""
  }

  const getSituationProgress = (situationKey, year = null) => {
    let values = allIndicatorValues.filter((iv) => iv.situation === situationKey && shouldDisplayIndicator(iv) && !isYearIndicator(iv))
    // Pour les actions config, les prev ou les expost, filtrer par année
    if (year && (action.type === 'config' || situationKey === SITUATION_TYPES.PREV || situationKey === SITUATION_TYPES.EXPOST)) values = values.filter((iv) => iv.year === year)
    if (values.length === 0) return 0
    const filled = values.filter(isIndicatorValueFilled).length
    return Math.round((filled / values.length) * 100)
  }

  const shouldDisplayIndicator = (indicatorValue) => {
    if (!indicatorValue.display_condition || !indicatorValue.display_condition.conditions || indicatorValue.display_condition.conditions.length === 0) return true

    // Utiliser tous les indicator values de la collectivité pour évaluer les conditions d'affichage
    const results = indicatorValue.display_condition.conditions.map((cond) => {
      const targetSituation = cond.excel_indicator_situation || indicatorValue.situation

      let sourceValueObj = allCollectivityIndicatorValues.find((iv) => iv.indicator_excel_id === cond.excel_indicator_id && iv.situation === targetSituation && iv.year === indicatorValue[`year_${targetSituation}`])
      if (!sourceValueObj) return false
      const val = sourceValueObj.value?.[sourceValueObj.indicator_type]

      let isMatch = false
      if (cond.type === "equals") {
        isMatch = val == cond.value
        if (Array.isArray(val) && Array.isArray(cond.value)) isMatch = JSON.stringify(val.sort()) === JSON.stringify(cond.value.sort())
      }
      if (cond.type === "contains") {
        if (Array.isArray(val)) isMatch = val.includes(cond.value)
        if (typeof val === "string") isMatch = val.includes(cond.value)
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

    if (indicatorValue.display_condition.operator === "OR") return results.some((r) => r)
    return results.every((r) => r)
  }

  const allDisplayedIndicatorValues = allIndicatorValues.filter((iv) => shouldDisplayIndicator(iv) && !isYearIndicator(iv))

  useEffect(() => {
    fetchIndicatorsValues()
  }, [action._id, activeTab])

  useEffect(() => {
    fetchAllIndicatorsValues()
    fetchAllCollectivityIndicatorValues()
  }, [action._id, action.collectivity_id])

  useEffect(() => {
    if (action.type === 'config' && allIndicatorValues.length > 0 && dynamicTabs.length > 0) {
      const currentTabExists = dynamicTabs.some(t => t.key === activeTab)
      if (!currentTabExists) setActiveTab(dynamicTabs[0].key)
    }
  }, [allIndicatorValues, action.type])

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
            <ProgressCircle
              percentage={
                allDisplayedIndicatorValues.length > 0 ? Math.round((allDisplayedIndicatorValues.filter(isIndicatorValueFilled).length / allDisplayedIndicatorValues.length) * 100) : 0
              }
              size={20}
            />
            <p className="text-sm text-gray-900">
              Complété à{" "}
              <strong>
                {allDisplayedIndicatorValues.length > 0 ? Math.round((allDisplayedIndicatorValues.filter(isIndicatorValueFilled).length / allDisplayedIndicatorValues.length) * 100): 0}%
              </strong>
            </p>
            <p className="text-sm text-gray-600">
              - Dernière mise à jour le <strong>{new Date(action.last_modif_date).toLocaleDateString()}</strong>
              <span>
                {" "}
                par <strong>{action.last_modif_by_name || action.last_modif_by_email || "Inconnu"}</strong>
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
                    <ProgressCircle percentage={getSituationProgress(tab.situation, tab.year)} size={16} />
                    <span>{getSituationProgress(tab.situation, tab.year)}%</span>
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
                title="Téléchargez le fichier Excel des indicateurs de cette actions"
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
                title="Importez le fichier Excel rempli pour mettre à jour les indicateurs de cette actions"
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
                Téléchargez le template des indicateurs de cette actions et ensuite importez le pour mettre à jour les indicateurs de cette actions
                <div className="absolute bottom-full right-4 border-4 border-transparent border-b-gray-900"></div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row gap-6">
          <div className="w-full lg:w-72 shrink-0">
            <div className="card-shadow p-4 sticky top-8 self-start">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">{dynamicTabs.find((tab) => tab.key === activeTab)?.label}</h3>
              </div>
              <div className="overflow-y-auto max-h-[calc(100vh-300px)]">
                <IndicatorsList indicatorValues={indicatorValues.filter((iv) => shouldDisplayIndicator(iv) && !isYearIndicator(iv))} onSelectIndicatorValue={setSelectedIndicatorValue} />
              </div>
            </div>
          </div>

          <div className="flex-1">
            <SituationTab
              situation={dynamicTabs.find((t) => t.key === activeTab)?.situation || activeTab}
              year={dynamicTabs.find((t) => t.key === activeTab)?.year}
              indicatorValues={indicatorValues.filter((iv) => shouldDisplayIndicator(iv) && !isYearIndicator(iv))}
              onUpdate={() => {
                fetchIndicatorsValues()
                fetchAllIndicatorsValues()
                fetchAllCollectivityIndicatorValues()
              }}
              selectedIndicatorValue={selectedIndicatorValue}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
