import React, { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import Modal from "@/components/modal"
import api from "@/services/api"
import useStore from "@/services/store"
import toast from "react-hot-toast"

export default function List() {
  const navigate = useNavigate()
  const [collectivities, setCollectivities] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [search, setSearch] = useState("")

  const fetchCollectivities = async () => {
    try {
      const { ok, data, code, total } = await api.post("/collectivity/search", {search: search || undefined,limit: 50, offset: page * 50, sortBy: "action_count", sortOrder: "desc"})
      if (!ok) return toast.error(code || "Une erreur est survenue")
      setCollectivities(data)
      setTotal(total)
    } catch (error) {
      toast.error(error.code || "Une erreur est survenue")
    }
  }

  useEffect(() => {
    fetchCollectivities()
  }, [page, search])

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Liste des Collectivités</h1>
        <div className="flex items-center gap-4">
          <input
            type="text"
            placeholder="Rechercher..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0) }}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-green focus:border-transparent"
          />
          <button onClick={() => setIsModalOpen(true)} className="button-primary">
            Ajouter
          </button>
        </div>
      </div>

      <table className="w-full overflow-hidden card-shadow">
        <thead className="bg-gray-100">
          <tr>
            <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Nom</th>
            <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Département</th>
            <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Nombre d'actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {collectivities.map((collectivity) => (
            <tr key={collectivity._id} className="hover:bg-gray-50 cursor-pointer" onClick={() => navigate(`/admin/collectivity/${collectivity._id}`)}>
              <td className="px-6 py-4 text-sm font-medium text-gray-900">{collectivity.name}</td>
              <td className="px-6 py-4 text-sm text-gray-600">{collectivity.department}</td>
              <td className="px-6 py-4 text-sm text-gray-600">{collectivity.action_count || 0}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {Math.ceil(total / 50) > 1 && (
        <div className="flex items-center justify-between mt-4">
          <span className="text-sm text-gray-600">{total} collectivités</span>
          <div className="flex items-center gap-2">
            <button onClick={() => setPage(page - 1)} disabled={page === 0} className="px-3 py-1 text-sm border rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50">
              Précédent
            </button>
            <span className="text-sm text-gray-600">{page + 1} / {Math.ceil(total / 50)}</span>
            <button onClick={() => setPage(page + 1)} disabled={page >= Math.ceil(total / 50) - 1} className="px-3 py-1 text-sm border rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50">
              Suivant
            </button>
          </div>
        </div>
      )}

      <AddCollectivityModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </div>
  )
}


const AddCollectivityModal = ({ isOpen, onClose }) => {
    const navigate = useNavigate()
    const { user, setUser } = useStore()
    const [name, setName] = useState("")
    const [loading, setLoading] = useState(false)

    const createCollectivity = async () => {
      try {
        setLoading(true)
        if (!name.trim()) return toast.error("Veuillez entrer un nom pour la collectivité")
        const { ok, data, code } = await api.post("/collectivity/", { name })
        if (!ok) return toast.error(code || "Une erreur est survenue")
        setUser({ ...user })
        navigate(`/admin/collectivity/${data._id}`)
      } catch (error) {
        toast.error(error.code || "Une erreur est survenue")
      } finally {
        setLoading(false)
      }
    }

  return (
    <Modal isOpen={isOpen} onClose={onClose} className="max-w-md">
      <div className="p-8">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-gray-800">Ajouter une collectivité</h2>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-green"></div>
          </div>
        )}

        {!loading && (
          <>
        <div className="mb-6">
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Nom de la collectivité
          </label>
          <input
            type="text"
            placeholder="Entrez le nom"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-green focus:border-transparent transition-all"
          />
        </div>

        <div className="flex justify-end gap-3">
          <button onClick={createCollectivity} className="button-primary" disabled={loading}>
            Créer
          </button>
        </div>
        </>
        )}
      </div>
    </Modal>
  )
}