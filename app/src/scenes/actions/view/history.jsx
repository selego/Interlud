import { useState, useEffect } from "react"
import api from "@/services/api"
import toast from "react-hot-toast"
import Select from "@/components/Select"
import { SITUATION_TYPES } from "@/utils/constants"
import Loader from "@/components/loader"

  const formatDate = dateString => {
    if (!dateString) return "-"
    const date = new Date(dateString)
    return date.toLocaleString("fr-FR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    })
  }

  const getSituationLabel = situation => {
    const labels = {
      init: "Initial",
      ref: "Référence",
      prev: "Prévisionnel",
      expost: "Ex-post"
    }
    return labels[situation] || situation
  }

  const getOperationLabel = path => {
    if (path === "value") return "Valeur"
    if (path === "indicator_type") return "Type d'indicateur"
    if (path === "indicator_value_possibilities") return "Possibilités"
    return path
  }

  const formatValue = value => {
    if (value === null || value === undefined || value === "") return "vide"
    if (typeof value === "object") return JSON.stringify(value)
    return String(value)
  }

  const situationOptions = [
    { value: "", label: "Toutes les situations" },
    { value: SITUATION_TYPES.INIT, label: "Initial" },
    { value: SITUATION_TYPES.REF, label: "Référence" },
    { value: SITUATION_TYPES.PREV, label: "Prévisionnel" },
    { value: SITUATION_TYPES.EXPOST, label: "Ex-post" }
  ]

export default function History({ action }) {
  const [patches, setPatches] = useState([])
  const [indicatorValues, setIndicatorValues] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedSituation, setSelectedSituation] = useState("")
  const [selectedIndicator, setSelectedIndicator] = useState("")

  const fetchAllIndicators = async () => {
    try {
      const { ok, data, code } = await api.post(`/indicator_value/search`, {
        action_id: action._id
      })
      if (!ok) return toast.error(code || "Une erreur est survenue")
      setIndicatorValues(data)
    } catch (error) {
      toast.error("Une erreur est survenue lors du chargement des indicateurs")
    }
  }

  const fetchPatches = async () => {
    if (!indicatorValues || indicatorValues.length === 0) return setPatches([])

    try {
      setLoading(true)

      const indicatorValueIds = indicatorValues.map(iv => iv._id);

      let filteredIds = indicatorValueIds;

      if (selectedSituation && selectedIndicator) {
        filteredIds = indicatorValues
          .filter(iv => iv.situation === selectedSituation && iv.indicator_name === selectedIndicator)
          .map(iv => iv._id);
      } else if (selectedSituation) {
        filteredIds = indicatorValues
          .filter(iv => iv.situation === selectedSituation)
          .map(iv => iv._id);
      } else if (selectedIndicator) {
        filteredIds = indicatorValues
          .filter(iv => iv.indicator_name === selectedIndicator)
          .map(iv => iv._id);
      }

      if (!filteredIds || filteredIds.length === 0) return setPatches([]);

      const { ok, data, code } = await api.post(`/indicator_value_patch/search`, { ref: filteredIds })
      if (!ok) return toast.error(code || "Une erreur est survenue")

      const indicatorValuesMap = new Map()
      indicatorValues.forEach(iv => {
        indicatorValuesMap.set(iv._id, iv)
      })

      let patchesWithIndicatorInfo = (data || []).map(patch => {
        const indicatorValue = indicatorValuesMap.get(patch.ref)
        return {
          ...patch,
          indicator_name: indicatorValue?.indicator_name || "Indicateur inconnu",
          situation: indicatorValue?.situation,
          year: indicatorValue?.year
        }
      })

      setPatches(patchesWithIndicatorInfo || [])
    } catch (error) {
      toast.error("Une erreur est survenue lors du chargement de l'historique")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchAllIndicators()
  }, [action])

  useEffect(() => {
    fetchPatches()
  }, [indicatorValues, selectedSituation, selectedIndicator])

  const indicatorOptions = (() => {
    const uniqueIndicators = Array.from(
      new Set(indicatorValues.map(iv => iv.indicator_name).filter(Boolean))
    ).sort()

    return [
      { value: "", label: "Tous les indicateurs" },
      ...uniqueIndicators.map(name => ({
        value: name,
        label: name
      }))
    ]
  })()

  return (
    <div className="p-8 card-shadow">
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Historique des modifications</h2>
            <p className="text-sm text-gray-600 mt-1">Historique des modifications apportées aux indicateurs de cette action</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="w-48">
              <Select
                placeholder="Filtrer par situation"
                options={situationOptions}
                value={selectedSituation}
                onChange={setSelectedSituation}
              />
            </div>
            <div className="w-64">
              <Select
                placeholder="Filtrer par indicateur"
                options={indicatorOptions}
                value={selectedIndicator}
                onChange={setSelectedIndicator}
              />
            </div>
          </div>
        </div>
      </div>

      {loading && <Loader />}

      {patches.length === 0 ? (
        <div className="text-center py-12 text-gray-500">Aucune modification enregistrée pour le moment</div>
      ) : (
        <div className="space-y-4">
          {patches.map((patch, index) => (
            <div key={patch._id || index} className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors">
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="font-semibold text-gray-900">{patch.indicator_name || "Indicateur inconnu"}</span>
                    {patch.situation && <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded">{getSituationLabel(patch.situation)}</span>}
                    {patch.year && <span className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-800 rounded">Année {patch.year}</span>}
                  </div>
                  <div className="text-sm text-gray-600">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-700">{getOperationLabel(patch.path)}:</span>
                      {patch.op === "replace" && (
                        <>
                          <span className="text-red-600 line-through">{formatValue(patch.originalValue)}</span>
                          <span className="text-gray-400">→</span>
                          <span className="text-green-600 font-medium">{formatValue(patch.value)}</span>
                        </>
                      )}
                      {patch.op === "add" && <span className="text-green-600 font-medium">{formatValue(patch.value)} (ajouté)</span>}
                      {patch.op === "remove" && <span className="text-red-600 line-through">{formatValue(patch.value)} (supprimé)</span>}
                    </div>
                  </div>
                </div>
                <div className="text-right ml-4">
                  <div className="text-sm font-medium text-gray-900">{formatDate(patch.date)}</div>
                  {patch.user && <div className="text-xs text-gray-500 mt-1">{patch.user.name || patch.user.email || "Utilisateur inconnu"}</div>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
