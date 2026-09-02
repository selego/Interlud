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

const formatValue = value => {
  if (value === null || value === undefined || value === "") return "vide"
  if (typeof value === "object") return JSON.stringify(value)
  if (typeof value === "number") return value.toLocaleString("fr-FR", { maximumFractionDigits: 1 })
  return String(value)
}

const formatSource = source => ({
  'manual': 'Manuel',
  'import_excel': 'Import Excel',
  'default_value': 'Valeur par défaut',
  'synchronization': 'Synchronisation'
}[source] || source || '-')

export default function History({ action, onSave }) {
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

  const handleRestore = async (log) => {
    if (!window.confirm("Êtes-vous sûr de vouloir restaurer l'ancienne valeur ?")) return
    try {
      if (log.model_name === "indicator_value" && log.indicator_value_id) {
        const { ok, code } = await api.put(`/indicator_value/${log.indicator_value_id}`, { value: { [log.type_value]: log.previous_value?.[log.type_value] }, source: 'restore' })
        if (!ok) return toast.error(code || "Une erreur est survenue")
      }
      if (log.model_name === "action" && log.action_id) {
        const { ok, code } = await api.put(`/action/${log.action_id}`, { [log.field]: log.previous_value?.[log.type_value], source: 'restore' })
        if (!ok) return toast.error(code || "Une erreur est survenue")
      }
      toast.success("Valeur restaurée")
      await fetchLogs()
      if (onSave) onSave()
    } catch (error) {
      toast.error("Une erreur est survenue lors de la restauration")
    }
  }

  useEffect(() => {
    fetchLogs()
  }, [action._id])

  if (logs.length === 0) return null;

  return (
    <div className="space-y-4">
          {logs.map((log, index) => (
            <div key={log._id || index} className="border rounded-lg p-4 bg-gray-50">
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <span className={`px-2 py-1 text-xs font-medium rounded bg-gray-100 text-gray-800`}>
                      {log.model_name}
                    </span>
                    <span className="font-semibold text-gray-900">{log.name || "Entité inconnue"}</span>
                  </div>
                  <div className="text-sm text-gray-600">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="font-medium text-gray-700">{log.operation} - {log.field}:</span>
                      {log.operation === "update" && (
                        <>
                          <span className="text-red-600 line-through">{formatValue(log.previous_value?.[log.type_value])}</span>
                          <span className="text-gray-400">→</span>
                          <span className="text-green-600 font-medium">{formatValue(log.new_value?.[log.type_value])}</span>
                        </>
                      )}
                      {log.operation === "add" && (
                        <span className="text-green-600 font-medium">{formatValue(log.new_value?.[log.type_value])} (ajouté)</span>
                      )}
                      {log.operation === "delete" && (
                        <span className="text-red-600 font-medium">{formatValue(log.previous_value?.[log.type_value])} (supprimé)</span>
                      )}
                    </div>
                    {log.source && (
                      <div className="text-xs text-gray-500 mt-1">
                        Source : <span className="font-medium text-gray-700">{formatSource(log.source)}</span>
                      </div>
                    )}
                  </div>
                </div>
                <div className="text-right ml-4">
                  <div className="text-sm font-medium text-gray-900">{formatDate(log.date)}</div>
                  {log.user_name && (
                    <div className="text-xs text-gray-500 mt-1">{log.user_name}</div>
                  )}
                  {log.operation === "update" && (
                    <button
                      onClick={() => handleRestore(log)}
                      className="mt-2 text-xs text-blue-600 hover:underline"
                    >
                      Restaurer
                    </button>
                  )}
                </div>
              </div>
        </div>
      ))}
    </div>
  )
}