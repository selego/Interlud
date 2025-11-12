import { useState, useEffect } from "react"
import api from "@/services/api"
import toast from "react-hot-toast"

export default function History({ action }) {
  const [patches, setPatches] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchPatches = async () => {
    try {
      setLoading(true)

      const indicatorValuesResponse = await api.post(`/indicator_value/search`, {
        action_id: action._id
      })
      if (!indicatorValuesResponse.ok) return toast.error(indicatorValuesResponse.code || "Une erreur est survenue")

      const indicatorValues = indicatorValuesResponse.data || []

      if (indicatorValues.length === 0) {
        setPatches([])
        return
      }

      const indicatorValueIds = indicatorValues.map(iv => iv._id)

      const patchesResponse = await api.post(`/indicator_value/patches/search`, {
        indicator_value_ids: indicatorValueIds
      })
      if (!patchesResponse.ok) return toast.error(patchesResponse.code || "Une erreur est survenue")

      const indicatorValuesMap = new Map()
      indicatorValues.forEach(iv => {
        indicatorValuesMap.set(iv._id, iv)
      })

      const patchesWithIndicatorInfo = patchesResponse.data.map(patch => {
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
    fetchPatches()
  }, [action])

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

  const getOperationLabel = op => {
    const path = op.path?.replace("/", "") || ""
    if (path === "value") return "Valeur"
    return path
  }

  const formatValue = value => {
    if (value === null || value === undefined) return "vide"
    if (typeof value === "object") return JSON.stringify(value)
    return String(value)
  }

  if (loading) {
    return (
      <div className="p-8 card-shadow">
        <div className="flex items-center justify-center py-12">
          <div className="text-gray-500">Chargement de l'historique...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-8 card-shadow">
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900">Historique des modifications</h2>
        <p className="text-sm text-gray-600 mt-1">Historique des modifications apportées aux indicateurs de cette action</p>
      </div>

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
                    {patch.ops && patch.ops.length > 0 && (
                      <div className="space-y-1">
                        {patch.ops.map((op, opIndex) => (
                          <div key={opIndex} className="flex items-center gap-2">
                            <span className="font-medium text-gray-700">{getOperationLabel(op)}:</span>
                            {op.op === "replace" && (
                              <>
                                <span className="text-red-600 line-through">{formatValue(op.originalValue)}</span>
                                <span className="text-gray-400">→</span>
                                <span className="text-green-600 font-medium">{formatValue(op.value)}</span>
                              </>
                            )}
                            {op.op === "add" && <span className="text-green-600 font-medium">{formatValue(op.value)} (ajouté)</span>}
                            {op.op === "remove" && <span className="text-red-600 line-through">{formatValue(op.value)} (supprimé)</span>}
                          </div>
                        ))}
                      </div>
                    )}
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
