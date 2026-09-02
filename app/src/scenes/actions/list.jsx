import React, { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import Modal from "@/components/modal"
import Select from "@/components/Select"
import api from "@/services/api"
import toast from "react-hot-toast"
import useStore from "@/services/store"
import Loader from "@/components/loader"
import { FiInfo } from "react-icons/fi"

const getStatusLabel = (status) => {
  if (status === "completed") return "Complétée"
  if (status === "upcoming") return "À venir"
  if (status === "in_progress") return "En cours"
  if (status === "blocked") return "À l'arrêt"
  return "Nouvelle"
}

const getPiloteLabel = (pilote) => {
  if (pilote === "epci") return "EPCI"
  if (pilote === "acteur_economique") return "Acteur économique"
  if (pilote === "autres") return "Autres"
  return "-"
}

export default function List() {
  const navigate = useNavigate()
  const [actions, setActions] = useState([])
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [filters, setFilters] = useState({ pilote: "", budget_min: "", budget_max: "" })
  const { collectivity, user } = useStore()


    const isAdmin = user.role === "admin" || user.collectivities.some((c) => c.id === collectivity._id && c.role === "admin")


  const fetchActions = async () => {
    if (!collectivity?._id) return;
    try {
      const { ok, data, code} = await api.post("/action/search", { collectivity_id: collectivity._id, ...filters })
      if (!ok) return toast.error(code || "Une erreur est survenue")
      setActions(data)
    } catch (error) {
      toast.error(error.message || "Une erreur est survenue")
    }
  };

  useEffect(() => {
    fetchActions()
  }, [collectivity, filters])

  if (actions.length === 0)
    return (
      <div className="p-8">
        <h1 className="text-3xl font-bold mb-8">Liste des Actions</h1>
        <div className="flex flex-col items-center justify-center text-center bg-gradient-to-b from-green-50 to-white border border-gray-100 rounded-2xl py-20 px-6 card-shadow">
          <div className="w-20 h-20 bg-primary-green rounded-2xl flex items-center justify-center mb-6 shadow-lg shadow-green-200">
            <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-800 mb-3">Créez votre première action</h2>
          <p className="text-base text-gray-500 mb-8 max-w-md">
            Vous n'avez pas encore d'action dans cette collectivité. Lancez-vous et commencez à suivre vos mesures environnementales.
          </p>
          {(isAdmin || user.role === "economic_actor") && (
            <button onClick={() => setIsModalOpen(true)} className="button-primary text-base px-6 py-3">
              Créer ma première action
            </button>
          )}
        </div>
        <AddActionModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} collectivity={collectivity} />
      </div>
    )

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Liste des Actions</h1>
        <div className="flex gap-3">
          <button
            onClick={() => navigate("/actions/compare")}
            className="px-4 py-2 rounded-lg border-2 border-primary-green text-primary-green text-sm font-semibold hover:bg-green-50 transition-colors"
          >
            Comparer
          </button>
          { (isAdmin || user.role === 'economic_actor') && (
            <button
              onClick={() => setIsModalOpen(true)}
              className="button-primary"
            >
              Ajouter
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-3 mb-6">
        <div className="w-48">
          <Select
            value={filters.pilote}
            onChange={(value) => setFilters((prev) => ({ ...prev, pilote: value }))}
            placeholder="Pilote"
            constrained={true}
            options={[
              { value: "", label: "Tous les pilotes" },
              { value: "epci", label: "EPCI" },
              { value: "acteur_economique", label: "Acteur économique" },
              { value: "autres", label: "Autres" },
            ]}
          />
        </div>
        <div className="flex gap-2 items-center">
          <input
            type="number"
            value={filters.budget_min}
            onChange={(e) => setFilters((prev) => ({ ...prev, budget_min: e.target.value }))}
            placeholder="Budget min"
            className="input-primary w-32"
          />
          <span className="text-gray-400">—</span>
          <input
            type="number"
            value={filters.budget_max}
            onChange={(e) => setFilters((prev) => ({ ...prev, budget_max: e.target.value }))}
            placeholder="Budget max"
            className="input-primary w-32"
          />
        </div>
      </div>

      <table className="w-full overflow-hidden card-shadow">
        <thead className="bg-gray-100">
          <tr>
            <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Nom</th>
            <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Priorité</th>
            <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Statut</th>
            <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Pilote</th>
            <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Budget</th>
            <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Subventionné</th>
            <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Date de début</th>
            <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Date de fin</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {Object.entries(
            actions.reduce((groups, action) => {
              const parent = action.action_parent_name || "Autre";
              if (!groups[parent]) groups[parent] = [];
              groups[parent].push(action);
              return groups;
            }, {})
          ).flatMap(([parentName, children]) => [
            <tr
              key={parentName}
              role="button"
              tabIndex={0}
              className="bg-gray-50 hover:bg-gray-100 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-green"
              onClick={() => navigate(`/actions/${children[0].action_parent_id}/parent-dashboard`)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault()
                  navigate(`/actions/${children[0].action_parent_id}/parent-dashboard`)
                }
              }}
            >
              <td colSpan={8} className="px-6 py-3 text-sm font-bold text-gray-800">{parentName}</td>
            </tr>,
            ...children.map((action) => (
              <tr
                key={action._id}
                role="button"
                tabIndex={0}
                className="hover:bg-gray-50 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-green"
                onClick={() => navigate(`/actions/${action._id}/dashboard`)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault()
                    navigate(`/actions/${action._id}/dashboard`)
                  }
                }}
              >
                <td className="pl-12 pr-6 py-4 text-sm font-medium text-gray-900">{action.name}{action.instance_number > 1 ? ` (${action.instance_number})` : ''}</td>
                <td className="px-6 py-4 text-sm text-gray-600">{action.priority}</td>
                <td className="px-6 py-4 text-sm text-gray-600">{getStatusLabel(action.status)}</td>
                <td className="px-6 py-4 text-sm text-gray-600">{getPiloteLabel(action.pilote)}</td>
                <td className="px-6 py-4 text-sm text-gray-600">{action.budget_costs != null ? `${action.budget_costs.toLocaleString()} €` : "-"}</td>
                <td className="px-6 py-4 text-sm text-gray-600">{action.is_subsidized_by_program ? "Oui" : "Non"}</td>
                <td className="px-6 py-4 text-sm text-gray-600">{action.date_start ? new Date(action.date_start).toLocaleDateString() : "-"}</td>
                <td className="px-6 py-4 text-sm text-gray-600">{action.date_end ? new Date(action.date_end).toLocaleDateString() : "-"}</td>
              </tr>
            )),
          ])}
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
    const [customName, setCustomName] = useState("")
    const [actions, setActions] = useState([])
    const [startedBeforeInterlud, setStartedBeforeInterlud] = useState(null)
    const [year,setYear] = useState( { init: null, prev: null })
    const [isLoading, setIsLoading] = useState(false)
    const [loadingSeconds, setLoadingSeconds] = useState(0)
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

    useEffect(() => {
      if (!isLoading) { setLoadingSeconds(0); return }
      const interval = setInterval(() => setLoadingSeconds((s) => s + 1), 1000)
      return () => clearInterval(interval)
    }, [isLoading])

    const createAction = async () => {
      try {
        setIsLoading(true)
        setLoadingSeconds(0)
        if (!collectivity?._id) return toast.error("Collectivité non trouvée")
        if (!selectedActionId) return toast.error("Veuillez sélectionner une action")
        if (!year.init) return toast.error("Veuillez sélectionner une année initiale")
        if (!year.prev) return toast.error("Veuillez sélectionner une année prévisionnelle")
        if (startedBeforeInterlud === null) return toast.error("Veuillez indiquer si la mise en œuvre avait commencé avant InTerLUD+")

        const selectedAction = actions.find(a => a._id === selectedActionId)
        const payload = {
          action_parent_id: selectedActionId,
          action_parent_name: selectedAction.name,
          name: customName.trim() ? customName.trim() : selectedAction.name,
          type: customName.trim() ? "custom" : "reference",
          collectivity_id: collectivity._id,
          collectivity_name: collectivity.name,
          year_init: parseInt(year.init),
          year_prev: parseInt(year.prev),
          started_before_interlud: startedBeforeInterlud,
          ...(user.role === 'economic_actor' ? {owner: 'economic_actor', economic_actor_id: user.economic_actor_id, economic_actor_name: user.economic_actor_name} : {}),
        }

        const { ok, data , code} = await api.post("/action/", payload)
        if (!ok) return toast.error(code || "Une erreur est survenue")
        setCreatedActionId(data._id)
      } catch (error) {
        toast.error(error.code || "Une erreur est survenue")
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
                onClick={() => navigate("/general-data?tab=parc")}
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
          <div className="flex flex-col items-center justify-center py-10 gap-5">
            <div className="relative w-16 h-16">
              <div className="absolute inset-0 rounded-full border-4 border-gray-200"></div>
              <div className="absolute inset-0 rounded-full border-4 border-primary-green border-t-transparent animate-spin"></div>
            </div>
            <div className="text-center">
              <p className="text-lg font-semibold text-gray-800 mb-1">Création en cours...</p>
              <p className="text-sm text-gray-500 mb-3">
                {loadingSeconds < 10
                  ? "Préparation des fichiers des indicateurs"
                  : loadingSeconds < 25
                  ? "Préparation des moteurs de calcul"
                  : loadingSeconds < 40
                  ? "Génerations des valeurs par défaut"
                  : loadingSeconds < 60
                  ? "Application des valeurs par défaut"
                  : loadingSeconds < 80
                  ? "Création du dashboard"
                  : loadingSeconds < 100
                  ? "Finalisation de la création"
                  : loadingSeconds < 120
                  ? "Finalisation et vérification des résultats"
                  : "Finalisation de la création"}
              </p>
              <p className="text-xs text-gray-400">
                Cette opération peut prendre plusieurs minutes
              </p>
            </div>
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
                <label className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 mb-2">
                  Année initiale <span className="text-red-500">*</span>
                  <span className="group/tip relative inline-flex items-center">
                    <FiInfo className="w-3.5 h-3.5 text-gray-400 hover:text-primary-green" />
                    <span className="pointer-events-none absolute left-1/2 top-full z-50 mt-2 w-64 -translate-x-1/2 rounded-lg bg-gray-900 px-3 py-2 text-xs font-normal leading-snug text-white text-left opacity-0 shadow-lg transition-opacity duration-150 group-hover/tip:opacity-100">
                      Année de référence à partir de laquelle l'action est suivie (état des lieux de départ).
                    </span>
                  </span>
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
                <label className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 mb-2">
                  Année prévisionnelle <span className="text-red-500">*</span>
                  <span className="group/tip relative inline-flex items-center">
                    <FiInfo className="w-3.5 h-3.5 text-gray-400 hover:text-primary-green" />
                    <span className="pointer-events-none absolute left-1/2 top-full z-50 mt-2 w-64 -translate-x-1/2 rounded-lg bg-gray-900 px-3 py-2 text-xs font-normal leading-snug text-white text-left opacity-0 shadow-lg transition-opacity duration-150 group-hover/tip:opacity-100">
                      Année cible visée pour la mise en œuvre de l'action et l'atteinte des objectifs prévus.
                    </span>
                  </span>
                </label>
                <input
                  type="number"
                  value={year.prev}
                  onChange={(e) => setYear({ ...year, prev: e.target.value })}
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

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Nom personnalisé (optionnel)
              </label>
              <input
                type="text"
                placeholder="Entrez un nom personnalisé"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-green focus:border-transparent transition-all"
              />
            </div>
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