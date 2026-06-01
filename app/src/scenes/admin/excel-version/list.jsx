import React, { useState, useEffect, useRef } from "react"
import api from "@/services/api"
import toast from "react-hot-toast"
import { FiUpload, FiLoader } from "react-icons/fi"

const STATUS_LABELS = {
  processing: { text: "En cours", className: "bg-blue-100 text-blue-700" },
  done: { text: "Terminé", className: "bg-emerald-100 text-emerald-700" },
  error: { text: "Erreur", className: "bg-red-100 text-red-700" }
}

export default function List() {
  const [versions, setVersions] = useState([])
  const [isUploading, setIsUploading] = useState(false)
  const inputRef = useRef(null)

  const fetchVersions = async () => {
    try {
      const { ok, data, code } = await api.get("/excel/versions")
      if (!ok) return toast.error(code || "Une erreur est survenue")
      setVersions(data)
    } catch (error) {
      toast.error(error.code || "Une erreur est survenue")
    }
  }

  useEffect(() => {
    fetchVersions()
  }, [])

  // Poll tant qu'une version est en cours de traitement
  useEffect(() => {
    if (!versions.some((v) => v.status === "processing")) return
    const timer = setTimeout(fetchVersions, 5000)
    return () => clearTimeout(timer)
  }, [versions])

  const uploadMaster = async (file) => {
    try {
      if (!file) return
      setIsUploading(true)
      const reader = new FileReader()
      reader.readAsDataURL(file)
      reader.onload = async () => {
        try {
          const { ok, data, code } = await api.post("/excel/upload-master", { fileBase64: reader.result.split(",")[1] })
          if (!ok) return toast.error(data?.error || code || "Erreur lors de l'envoi")
          toast.success("Fichier envoyé, synchronisation en cours")
          fetchVersions()
        } catch (error) {
          toast.error(error.code || "Une erreur est survenue")
        } finally {
          setIsUploading(false)
          if (inputRef.current) inputRef.current.value = ""
        }
      }
    } catch (error) {
      toast.error("Une erreur est survenue")
      setIsUploading(false)
    }
  }

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-2">
        <h1 className="text-3xl font-bold">Version Excel</h1>
        <label className={`button-primary flex items-center gap-2 cursor-pointer ${isUploading || versions.some((v) => v.status === "processing") ? "opacity-50 pointer-events-none" : ""}`}>
          {isUploading ? <FiLoader className="animate-spin" /> : <FiUpload />}
          Importer une nouvelle version
          <input ref={inputRef} type="file" accept=".xlsx" className="hidden" disabled={isUploading} onChange={(e) => e.target.files[0] && uploadMaster(e.target.files[0])} />
        </label>
      </div>
      <p className="text-gray-500 mb-6">Envoyez une nouvelle version du fichier master Excel. Les indicateurs, conditions et fichiers des collectivités seront resynchronisés automatiquement.</p>

      <table className="w-full overflow-hidden card-shadow">
        <thead className="bg-gray-100">
          <tr>
            <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Version</th>
            <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Fichier</th>
            <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Statut</th>
            <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Résultat</th>
            <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Importé par</th>
            <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Date</th>
          </tr>
        </thead>
        <tbody>
          {versions.map((version) => (
            <tr key={version._id} className="border-t border-gray-100">
              <td className="px-6 py-3 font-semibold">
                V{version.version}
                {version.is_active && <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-gray-800 text-white">actif</span>}
              </td>
              <td className="px-6 py-3 text-sm text-gray-600">{version.file_name}</td>
              <td className="px-6 py-3">
                <span className={`text-xs px-2 py-1 rounded-full font-medium ${STATUS_LABELS[version.status]?.className}`}>{STATUS_LABELS[version.status]?.text || version.status}</span>
              </td>
              <td className="px-6 py-3 text-sm text-gray-600">
                {version.status === "done" && version.stats && (
                  <span>
                    {version.stats.indicators_deleted} suppr. · {version.stats.indicator_values_synced} valeurs · {version.stats.files_regenerated} fichiers
                  </span>
                )}
                {version.status === "error" && <span className="text-red-600">{version.error_message}</span>}
                {version.status === "processing" && <span className="text-blue-600">Synchronisation…</span>}
              </td>
              <td className="px-6 py-3 text-sm text-gray-600">{version.uploaded_by_name}</td>
              <td className="px-6 py-3 text-sm text-gray-600">{new Date(version.createdAt).toLocaleString("fr-FR")}</td>
            </tr>
          ))}
          {versions.length === 0 && (
            <tr>
              <td colSpan={6} className="px-6 py-8 text-center text-gray-400">
                Aucune version pour le moment
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
