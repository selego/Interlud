import React, { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import Modal from "@/components/modal"
import Select from "@/components/Select"
import api from "@/services/api"
import toast from "react-hot-toast"
import useStore from "@/services/store"

export default function List() {
  const navigate = useNavigate()
  const [actions, setActions] = useState([])
  const [isModalOpen, setIsModalOpen] = useState(false)
  const { collectivity } = useStore()

  const fetchActions = async () => {
    try {
      const { ok, data } = await api.post("/action/search ", { collectivity_id: collectivity._id })
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
      
      <table className="w-full overflow-hidden card-shadow">
        <thead className="bg-gray-100">
          <tr>
            <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Nom</th>
            <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Priorité</th>
            <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Status</th>
            <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Date Start</th>
            <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Date End</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {actions.map((action) => (
            <tr key={action._id} className="hover:bg-gray-50 cursor-pointer" onClick={() => navigate(`/actions/${action._id}/dashboard`)}>
              <td className="px-6 py-4 text-sm font-medium text-gray-900">{action.name}</td>
              <td className="px-6 py-4 text-sm text-gray-600">{action.priority}</td>
              <td className="px-6 py-4 text-sm text-gray-600">{action.status}</td>
              <td className="px-6 py-4 text-sm text-gray-600">{action.date_start}</td>
              <td className="px-6 py-4 text-sm text-gray-600">{action.date_end}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <AddActionModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} collectivity={collectivity} />
    </div>
  )
}


const AddActionModal = ({ isOpen, onClose, collectivity }) => {
    const navigate = useNavigate()
    const [action, setAction] = useState({ name: "", type: "custom", action_parent_id: "", action_parent_name: "" })
    const [actions, setActions] = useState([])

    const fetchActions = async () => {
      try {
        const { ok, data } = await api.post("/action/search", { type: "global" })
        if (!ok) return toast.error(data.code || "Une erreur est survenue")
        setActions(data)
      } catch (error) {
        toast.error(error || "Une erreur est survenue")
      }
    }

    useEffect(() => {
        fetchActions()
    }, [isOpen])

    useEffect(() => {
      if (action.type === "reference" && action.action_parent_id)  setAction({ ...action, name: action.action_parent_name, action_parent_id: action.action_parent_id, action_parent_name: action.action_parent_name })
    }, [action.type, action.action_parent_id, actions])


    const createAction = async () => {
      try {
        if (action.type === "reference" && !action.action_parent_id) return toast.error("Veuillez sélectionner une action référence")
        if (action.type === "custom" && !action.name.trim()) return toast.error("Veuillez entrer un nom pour l'action")

        const { ok, data } = await api.post("/action/create_action_with_default_indicators", { ...action, collectivity_id: collectivity._id, collectivity_name: collectivity.name})
        if (!ok) return toast.error(data.code || "Une erreur est survenue")
        navigate(`/actions/${data._id}/settings`)
      } catch (error) {
        toast.error(error || "Une erreur est survenue")
      }
    }

  return (
    <Modal isOpen={isOpen} onClose={onClose} className="max-w-lg">
      <div className="p-8">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-gray-800">Ajouter une action</h2>
        </div>

        <div className="mb-6">
          <label className="block text-sm font-semibold text-gray-700 mb-3">
            Type d'action
          </label>
          <div className="flex gap-4">
            <button
              type="button"
              onClick={() => setAction({ ...action, type: "custom" })}
              className={`flex-1 px-4 py-3 rounded-lg border-2 transition-all ${
                action.type === "custom"
                  ? "border-primary-green bg-primary-green/10 text-primary-green font-semibold"
                  : "border-gray-300 bg-white text-gray-700 hover:border-gray-400"
              }`}
            >
              Custom
            </button>
            <button
              type="button"
              onClick={() => setAction({ ...action, type: "reference" })}
              className={`flex-1 px-4 py-3 rounded-lg border-2 transition-all ${ action.type === "reference" ? "border-primary-green bg-primary-green/10 text-primary-green font-semibold" : "border-gray-300 bg-white text-gray-700 hover:border-gray-400"}`}
            >
              Référence
            </button>
          </div>
        </div>

        {/* Action Parent Selection */}
        <div className="mb-6">
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Action parent {action.type === "reference" && <span className="text-red-500">*</span>}
          </label>
          <Select
            options={actions.map(action => ({ value: action._id, label: action.name}))}
            value={action.action_parent_id}
            onChange={(value) => setAction({ ...action, action_parent_id: value, action_parent_name: actions.find(a => a._id === value)?.name || "" })}
            placeholder="Sélectionner une action parent"
          />
        </div>

        {/* Name Input */}
        <div className="mb-6">
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Nom de l'action {action.type === "custom" && <span className="text-red-500">*</span>}
          </label>
          <input
            type="text"
            placeholder={action.type === "reference" ? "Le nom sera pris de l'action référence" : "Entrez le nom"}
            value={action.name}
            onChange={(e) => setAction({ ...action, name: e.target.value })}
            disabled={action.type === "reference"}
            className={`w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-green focus:border-transparent transition-all ${
              action.type === "reference" ? "bg-gray-100 cursor-not-allowed" : ""
            }`}
          />
          {action.type === "reference" && (
            <p className="mt-2 text-xs text-gray-500">
              Le nom sera automatiquement copié depuis l'action référence sélectionnée
            </p>
          )}
        </div>

        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50">
            Annuler
          </button>
          <button onClick={createAction} className="button-primary">
            Créer
          </button>
        </div>
      </div>
    </Modal>
  )
}