import React, { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import api from "@/services/api"
import toast from "react-hot-toast"

export default function List() {
  const navigate = useNavigate()
  const [economicActors, setEconomicActors] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchEconomicActors = async () => {
    try {
      setLoading(true)
      const { data, ok, code } = await api.post("/economic_actor/search", {})
      if (!ok) return toast.error(code || "Une erreur est survenue")
      setEconomicActors(data)
    } catch (error) {
      toast.error(error || "Une erreur est survenue")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchEconomicActors()
  }, [])

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Liste des Acteurs Économiques</h1>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-green"></div>
        </div>
      ) : (
        <table className="w-full overflow-hidden card-shadow">
          <thead className="bg-gray-100">
            <tr>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Nom</th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Nombre de collectivités rejointes</th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Date de création</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {economicActors.length === 0 ? (
              <tr>
                <td colSpan="4" className="px-6 py-8 text-center text-gray-500">
                  Aucun acteur économique trouvé
                </td>
              </tr>
            ) : (
              economicActors.map((actor) => (
                <tr key={actor._id} className="hover:bg-gray-50 cursor-pointer" onClick={() => navigate(`/admin/economic-actors/${actor._id}`)}>
                  <td className="px-6 py-4 text-sm font-medium text-gray-900">{actor.name}</td>
                  <td className="px-6 py-4 text-sm text-gray-600">{actor.collectivities?.length || 0} Collectivités</td>
                  <td className="px-6 py-4 text-sm text-gray-600">{actor.createdAt ? new Date(actor.createdAt).toLocaleDateString("fr-FR") : "-"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      )}
    </div>
  )
}
