import { useState, useEffect } from "react"
import api from "@/services/api"
import toast from "react-hot-toast"

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

const getModelLabel = modelName => {
  const labels = {
    action: "Action",
    indicator_value: "Valeur d'indicateur",
    indicator: "Indicateur"
  }
  return labels[modelName] || modelName
}

const getOperationLabel = (operation, field) => {
  const fieldLabels = {
    value: "Valeur",
    indicator_type: "Type d'indicateur",
    indicator_value_possibilities: "Possibilités",
    name: "Nom",
    description: "Description",
    status: "Statut",
    completeness: "Complétude"
  }
  
  const operationLabels = {
    add: "Ajout",
    update: "Modification",
    delete: "Suppression"
  }
  
  const fieldLabel = fieldLabels[field] || field
  const operationLabel = operationLabels[operation] || operation
  
  return `${operationLabel} - ${fieldLabel}`
}

const formatValue = value => {
  if (value === null || value === undefined || value === "") return "vide"
  if (typeof value === "object") {
    try {
      return JSON.stringify(value)
    } catch {
      return String(value)
    }
  }
  return String(value)
}

const getModelColor = modelName => {
const colors = {
    action: "bg-blue-100 text-blue-800",
    indicator_value: "bg-green-100 text-green-800",
    indicator: "bg-purple-100 text-purple-800"
  }
  return colors[modelName] || "bg-gray-100 text-gray-800"
}

export default function History({ action }) {
  const [logs, setLogs] = useState([])
  const fetchLogs = async () => {
    try {
      const { ok, data, code } = await api.post(`/log/search`, { action_id: action._id })
      if (!ok) return toast.error(code || "Une erreur est survenue")
      setLogs(data)
    } catch (error) {
      toast.error("Une erreur est survenue lors du chargement des logs")
    }
  }

  useEffect(() => {
    fetchLogs()
  }, [action._id])

  return (
    <div className="p-8 card-shadow">
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Historique des modifications</h2>
            <p className="text-sm text-gray-600 mt-1">Historique de toutes les modifications liées à cette action</p>
          </div>
        </div>
      </div>


      {logs.length === 0 ? (
        <div className="text-center py-12 text-gray-500">Aucune modification enregistrée pour le moment</div>
      ) : (
        <div className="space-y-4">
          {logs.map((log, index) => (
            <div key={log._id || index} className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors">
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <span className={`px-2 py-1 text-xs font-medium rounded ${getModelColor(log.model_name)}`}>
                      {getModelLabel(log.model_name)}
                    </span>
                    <span className="font-semibold text-gray-900">{log.name || "Entité inconnue"}</span>
                    {log.indicator_name && log.model_name === "indicator_value" && (
                      <span className="text-sm text-gray-600">({log.indicator_name})</span>
                    )}
                  </div>
                  <div className="text-sm text-gray-600">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="font-medium text-gray-700">{getOperationLabel(log.operation, log.field)}:</span>
                      {log.operation === "update" && (
                        <>
                          <span className="text-red-600 line-through">{formatValue(log.previous_value)}</span>
                          <span className="text-gray-400">→</span>
                          <span className="text-green-600 font-medium">{formatValue(log.new_value)}</span>
                        </>
                      )}
                      {log.operation === "add" && (
                        <span className="text-green-600 font-medium">{formatValue(log.new_value)} (ajouté)</span>
                      )}
                      {log.operation === "delete" && (
                        <span className="text-red-600 font-medium">{formatValue(log.previous_value)} (supprimé)</span>
                      )}
                    </div>
                    {log.collectivity_name && (
                      <div className="text-xs text-gray-500">
                        Collectivité : <span className="font-medium text-gray-700">{log.collectivity_name}</span>
                      </div>
                    )}
                  </div>
                </div>
                <div className="text-right ml-4">
                  <div className="text-sm font-medium text-gray-900">{formatDate(log.date)}</div>
                  {log.user_name && (
                    <div className="text-xs text-gray-500 mt-1">{log.user_name}</div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}