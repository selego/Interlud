import React, { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import Modal from "@/components/modal"
import Select from "@/components/Select"
import api from "@/services/api"
import toast from "react-hot-toast"
import useStore from "@/services/store"
import Loader from "@/components/loader"

const getStatusLabel = (status) => {
  if (status === "completed") return "Terminée"
  if (status === "upcoming") return "À venir"
  if (status === "in_progress") return "En cours"
  if (status === "blocked") return "Bloquée"
  return "Nouvelle"
}

export default function List() {
  const navigate = useNavigate()
  const [actions, setActions] = useState([])
  const [isModalOpen, setIsModalOpen] = useState(false)
  const { collectivity, user } = useStore()


    const isAdmin = user.role === "admin" || user.collectivities.some((c) => c.id === collectivity._id && c.role === "admin")


  const fetchActions = async () => {
    if (!collectivity?._id) return;
    try {
      const { ok, data, code} = await api.post("/action/search", { collectivity_id: collectivity._id })
      if (!ok) return toast.error(code || "Une erreur est survenue")
      setActions(data)
    } catch (error) {
      toast.error(error.message || "Une erreur est survenue")
    }
  };

  useEffect(() => {
    fetchActions()
  }, [collectivity])

  // if ( actions.length === 0 ) return (
  //   <div className="p-8"> 
  //     <div className="flex justify-between items-center mb-6">
  //       <h1 className="text-3xl font-bold">Liste des Actions</h1>
  //     </div>

  //     <div className="flex items-center justify-center">
  //       <div className="text-lg text-gray-600">Aucune action dans cette collectivité</div>
  //     </div>
  //   </div>
  // )

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Liste des Actions</h1>
        { (isAdmin || user.role === 'economic_actor') && (
          <button
          onClick={() => setIsModalOpen(true)}
          className="button-primary"
        >
            Ajouter
          </button>
        )}
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
              <td className="px-6 py-4 text-sm text-gray-600">{getStatusLabel(action.status)}</td>
              <td className="px-6 py-4 text-sm text-gray-600">{action.year_init}</td>
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
    const { user } = useStore()
    const [selectedActionId, setSelectedActionId] = useState("")
    const [isCustomVersion, setIsCustomVersion] = useState(false)
    const [customName, setCustomName] = useState("")
    const [actions, setActions] = useState([])
    const [startedBeforeInterlud, setStartedBeforeInterlud] = useState(null)
    const [year,setYear] = useState( { init: null, ref: null, prev: null, expost: null })
    const [isLoading, setIsLoading] = useState(false)
    const [createdActionId, setCreatedActionId] = useState(null)
    const fetchActions = async () => {
      try {
        const { ok, data , code} = await api.post("/action/search", { type: "global" })
        if (!ok) return toast.error(code || "Une erreur est survenue")
        setActions(data)
      } catch (error) {
        toast.error(error.message || "Une erreur est survenue")
      }
    }

    useEffect(() => {
        fetchActions()
    }, [isOpen])

    const createAction = async () => {
      try {
        setIsLoading(true)
        if (!collectivity?._id) return toast.error("Collectivité non trouvée")
        if (!selectedActionId) return toast.error("Veuillez sélectionner une action")
        if (isCustomVersion && !customName.trim()) return toast.error("Veuillez entrer un nom pour votre action personnalisée")
        if (!year.init) return toast.error("Veuillez sélectionner une année initiale")
        if (!year.ref) return toast.error("Veuillez sélectionner une année de référence")
        if (!year.prev) return toast.error("Veuillez sélectionner une année prévisionnelle")
        if (!year.expost) return toast.error("Veuillez sélectionner une année ex-post")
        if (startedBeforeInterlud === null) return toast.error("Veuillez indiquer si la mise en œuvre avait commencé avant InTerLUD+")

        const selectedAction = actions.find(a => a._id === selectedActionId)
        const payload = {
          action_parent_id: selectedActionId,
          action_parent_name: selectedAction.name,
          name: isCustomVersion ? customName : selectedAction.name,
          type: isCustomVersion ? "custom" : "reference",
          collectivity_id: collectivity._id,
          collectivity_name: collectivity.name,
          year_init: parseInt(year.init),
          year_ref: parseInt(year.ref),
          year_prev: parseInt(year.prev),
          year_expost: parseInt(year.expost),
          started_before_interlud: startedBeforeInterlud,
          ...(user.role === 'economic_actor' ? {owner: 'economic_actor', economic_actor_id: user.economic_actor_id, economic_actor_name: user.economic_actor_name} : {}),
        }

        const { ok, data , code} = await api.post("/action/", payload)
        if (!ok) return toast.error(code || "Une erreur est survenue")
        setCreatedActionId(data._id)
      } catch (error) {
        toast.error(error.message || "Une erreur est survenue")
      } finally {
        setIsLoading(false)
      }
    }   

  return (
    <Modal isOpen={isOpen} onClose={() => { if (!createdActionId) onClose(); }} className="max-w-lg">
      <div className="p-8">
        {createdActionId ? (
          <div className="text-center">
            <div className="flex justify-center mb-4">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
                <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
            </div>
            <h2 className="text-2xl font-bold text-gray-800 mb-4">Action créée avec succès !</h2>
            <p className="text-sm text-gray-600 mb-8">
              Les données de parc types dans votre action ont été remplies par des valeurs par défaut.
            </p>
            <div className="flex flex-col gap-3">
              <button
                onClick={() => navigate("/general-data")}
                className="w-full px-4 py-2 rounded-lg border-2 border-primary-green text-primary-green text-sm font-semibold hover:bg-green-50 transition-colors"
              >
                Voir mes données parc type
              </button>
              <button
                onClick={() => navigate(`/actions/${createdActionId}/completion`)}
                className="button-primary w-full"
              >
                Remplir mon action
              </button>
            </div>
          </div>
        ) : (
          <>
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-gray-800">Ajouter une action</h2>
        </div>

        {isLoading && (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-green"></div>
          </div>
        )}
        {!isLoading && (
          <>
        <div className="mb-6">
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Choisissez parmi les actions disponibles <span className="text-red-500">*</span>
          </label>
          <Select
            options={actions.map(action => ({ value: action._id, label: action.name}))}
            value={selectedActionId}
            onChange={(value) => setSelectedActionId(value)}
            placeholder="Sélectionner une action"
            constrained={true}
          />
        </div>



        {selectedActionId && (
          <div className="mb-6">
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Année initiale <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  value={year.init}
                  onChange={(e) => setYear({ ...year, init: e.target.value })}
                  className="input-primary"
                  placeholder="Année"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Année référence
                </label>
                <input
                  type="number"
                  value={year.prev || ""}
                  disabled
                  className="input-primary bg-gray-100 cursor-not-allowed"
                  placeholder="= Année prévisionnelle"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Année prévisionnelle <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  value={year.prev}
                  onChange={(e) => setYear({ ...year, prev: e.target.value, ref: e.target.value })}
                  className="input-primary"
                  placeholder="Année"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Année ex-post <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  value={year.expost}
                  onChange={(e) => setYear({ ...year, expost: e.target.value })}
                  className="input-primary"
                  placeholder="Année"
                />
              </div>
            </div>

            <div className="mb-6">
              <label className="block text-sm font-semibold text-gray-700 mb-3">
                La mise en œuvre avait-elle commencé en amont de l'engagement de votre territoire dans la démarche InTerLUD+ ? <span className="text-red-500">*</span>
              </label>
              <div className="flex gap-6">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="startedBeforeInterlud"
                    checked={startedBeforeInterlud === true}
                    onChange={() => setStartedBeforeInterlud(true)}
                    className="w-4 h-4 text-[#2DAC6A] border-gray-300 focus:ring-[#2DAC6A]"
                  />
                  <span className="text-sm text-gray-700">Oui</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="startedBeforeInterlud"
                    checked={startedBeforeInterlud === false}
                    onChange={() => setStartedBeforeInterlud(false)}
                    className="w-4 h-4 text-[#2DAC6A] border-gray-300 focus:ring-[#2DAC6A]"
                  />
                  <span className="text-sm text-gray-700">Non</span>
                </label>
              </div>
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <div className="relative flex items-center">
                <input
                  type="checkbox"
                  checked={isCustomVersion}
                  onChange={(e) => setIsCustomVersion(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-4 h-4 border-2 border-gray-300 peer-checked:bg-[#2DAC6A] peer-checked:border-[#2DAC6A] flex items-center justify-center transition-all">
                  {isCustomVersion && (
                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
              </div>
              <span className="text-sm text-gray-700">
                Créer une version personnalisée de cette action
              </span>
            </label>
          </div>
        )}

        {/* Custom Name Input */}
        {isCustomVersion && (
          <div className="mb-6 animate-fadeIn">
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Nom de votre action personnalisée <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              placeholder="Entrez un nom personnalisé"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-green focus:border-transparent transition-all"
              autoFocus
            />
            <p className="mt-2 text-xs text-gray-500">
              Cette action sera basée sur "{actions.find(a => a._id === selectedActionId)?.name}" avec les mêmes indicateurs
            </p>
          </div>
        )}

        <div className="flex justify-end gap-3">
          <button onClick={createAction} className="button-primary">
            Créer
          </button>
        </div>
        </>
        )}
        </>
        )}
      </div>
    </Modal>
  )
}