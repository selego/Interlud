import React, { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import Modal from "@/components/modal"
import api from "@/services/api"
import toast from "react-hot-toast"

export default function List() {
  const navigate = useNavigate()
  const [indicators, setIndicators] = useState([])
  const [isModalOpen, setIsModalOpen] = useState(false)

  const fetchIndicators = async () => {
    try {
      const { ok, data } = await api.post("/indicator/search")
      if (!ok) return toast.error(data.code || "Une erreur est survenue")
      setIndicators(data)
    } catch (error) {
      toast.error(error || "Une erreur est survenue")
    }
  };

  useEffect(() => {
    fetchIndicators()
  }, [])

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold">Liste des Indicateurs</h1>
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
            <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Population</th>
            <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Department</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {indicators.map((indicator) => (
            <tr key={indicator._id} className="hover:bg-gray-50 cursor-pointer" onClick={() => navigate(`/admin/indicator/${indicator._id}`)}>
              <td className="px-6 py-4 text-sm font-medium text-gray-900">{indicator.name}</td>
              <td className="px-6 py-4 text-sm text-gray-600">{indicator.description}</td>
              <td className="px-6 py-4 text-sm text-gray-600">{indicator.value_unit}</td>
              <td className="px-6 py-4 text-sm text-gray-600">{indicator.value_type}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <AddIndicatorModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </div>
  )
}


const AddIndicatorModal = ({ isOpen, onClose }) => {
    const navigate = useNavigate()
    const [name, setName] = useState("")

    const createIndicator = async () => {
      try {
        const { ok, data } = await api.post("/indicator/", { name })
        if (!ok) return toast.error(data.code || "Une erreur est survenue")
        navigate(`/admin/indicator/${data._id}`)
      } catch (error) {
        toast.error(data.code || "Une erreur est survenue")
      }
    }

  return (
    <Modal isOpen={isOpen} onClose={onClose} className="max-w-md">
      <div className="p-8">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-gray-800">Ajouter un indicateur</h2>
        </div>

        <div className="mb-6">
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Nom de l'indicateur
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
          <button onClick={createIndicator} className="button-primary">
            Créer
          </button>
        </div>
      </div>
    </Modal>
  )
}