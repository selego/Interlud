import React, { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import Modal from "@/components/modal"
import api from "@/services/api"
import toast from "react-hot-toast"

export default function List() {
  const navigate = useNavigate()
  const [actions, setActions] = useState([])
  const [isModalOpen, setIsModalOpen] = useState(false)

  const fetchActions = async () => {
    try {
      const { ok, data } = await api.post("/action/search")
      if (!ok) return toast.error(data.code || "Une erreur est survenue")
      setActions(data)
    } catch (error) {
      toast.error(error || "Une erreur est survenue")
    }
  };

  useEffect(() => {
    fetchActions()
  }, [])

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Liste des Actions</h1>
        <button
          onClick={() => setIsModalOpen(true)}
          className="button-primary"
        >
          Ajouter
        </button>
      </div>
      
      <table className="w-full bg-white shadow-md rounded-lg overflow-hidden">
        <thead className="bg-gray-100">
          <tr>
            <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Nom</th>
            <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Description</th>
            <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Status</th>
            <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Date Start</th>
            <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Date End</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {actions.map((action) => (
            <tr key={action._id} className="hover:bg-gray-50 cursor-pointer" onClick={() => navigate(`/admin/action/${action._id}`)}>
              <td className="px-6 py-4 text-sm font-medium text-gray-900">{action.name}</td>
              <td className="px-6 py-4 text-sm text-gray-600">{action.description}</td>
              <td className="px-6 py-4 text-sm text-gray-600">{action.status}</td>
              <td className="px-6 py-4 text-sm text-gray-600">{action.date_start}</td>
              <td className="px-6 py-4 text-sm text-gray-600">{action.date_end}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <AddActionModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </div>
  )
}


const AddActionModal = ({ isOpen, onClose }) => {
    const navigate = useNavigate()
    const [name, setName] = useState("")

    const createAction = async () => {
      try {
        const { ok, data } = await api.post("/action/", { name })
        if (!ok) return toast.error(data.code || "Une erreur est survenue")
        navigate(`/admin/action/${data._id}`)
      } catch (error) {
        toast.error(data.code || "Une erreur est survenue")
      }
    }

  return (
    <Modal isOpen={isOpen} onClose={onClose} className="max-w-md">
      <div className="p-8">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-gray-800">Ajouter une action</h2>
        </div>

        <div className="mb-6">
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Nom de l'action
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
          <button onClick={createAction} className="button-primary">
            Créer
          </button>
        </div>
      </div>
    </Modal>
  )
}