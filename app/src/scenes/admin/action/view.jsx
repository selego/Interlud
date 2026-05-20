import { useParams, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import api from "@/services/api"
import toast from "react-hot-toast"
import Select from "@/components/Select"
import { FiArrowLeft } from "react-icons/fi"

export default function View() {
  const {id} = useParams()
  const navigate = useNavigate()
  const [parentActions, setParentActions] = useState([])
  const [collectivities, setCollectivities] = useState([])
  const [deleting, setDeleting] = useState(false)
  const [action, setAction] = useState({
    type: "custom",
    action_parent_id: "",
    action_parent_name: "",
    name: "",
    description: "",
    status: "no_status",
    blocked_reason: "",
    step_description: "",
    date_start: "",
    date_end: "",
    budget_costs: "",
    budget_description: "",
    financial_aid: "",
    financial_aid_description: "",
    pilote: "",
    pilote_description: "",
    partners: "",
    partners_description: "",
    priority: "",
    is_subsidized_by_program: false,
    related_initiatives: "",
    comment: ""
  });

  const fetchCollectivities = async () => {
    try {
      const { ok, data, code } = await api.post(`/collectivity/search`, {});
      if (!ok) return toast.error(code || "Une erreur est survenue")
      setCollectivities(data)
    } catch (error) {
      toast.error(error || "Une erreur est survenue")
    }
  }

  const fetchParentActions = async () => {
    try {
      const { ok, data, code } = await api.post(`/action/search`, {type: "global"} );
      if (!ok) return toast.error(code || "Une erreur est survenue")
      setParentActions(data)
    } catch (error) {
      toast.error(error || "Une erreur est survenue")
    }
  }

  const getAction = async () => {
    try {
      const { ok, data, code } = await api.get(`/action/${id}`);
      if (!ok) return toast.error(code || "Une erreur est survenue")
      setAction(data)
    } catch (error) {
      toast.error(error || "Une erreur est survenue")
    }
  };

  const handleDelete = async () => {
    try {
      if (!confirm("Are you sure you want to delete this action?")) return
      setDeleting(true)
      const { ok, data, code } = await api.delete(`/action/${id}`);
      if (!ok) {
        setDeleting(false)
        return toast.error(code || "Une erreur est survenue")
      }
      toast.success("Action supprimée !")
      navigate("/admin/action")
    } catch (error) {
      setDeleting(false)
      toast.error(error || "Une erreur est survenue")
    }
  }

  const handleSave = async () => {
    try {
      const { ok, data, code } = await api.put(`/action/${id}`, action);
      if (!ok) return toast.error(code || "Une erreur est survenue")
      toast.success("Action sauvegardée !")
    } catch (error) {
      toast.error(error || "Une erreur est survenue")
    }
  }

  useEffect(() => {
    getAction()
    fetchCollectivities()
    fetchParentActions()
  }, [id])

  const ActionButtons = () => (
    <div className="flex justify-end gap-3">
      <button
        onClick={handleDelete}
        disabled={deleting}
        className="button-primary bg-red-600 disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {deleting ? "Suppression..." : "Supprimer"}
      </button>
      <button
        onClick={handleSave}
        className="button-primary"
      >
        Enregistrer
      </button>
    </div>
  )

  return (
    <div className="w-full max-w-7xl mx-auto px-4 py-8">
      <div className="mb-6">
        <div className="flex items-center gap-2 text-sm text-gray-600 mb-2">
          <button
            onClick={() => navigate("/admin/action")}
            className="hover:text-primary-green transition-colors"
          >
            Actions
          </button>
          <span>/</span>
          <span className="text-gray-900 font-medium truncate max-w-[150px]">
            {action.name}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="p-2 rounded-full hover:bg-gray-100 text-gray-600 hover:text-primary-green transition-colors"
            aria-label="Revenir à la page précédente"
          >
            <FiArrowLeft size={18} />
          </button>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
            {action.name}
          </h1>
        </div>
      </div>
      <div className="card-shadow">
          {/* En-tête + boutons (haut) */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Détails de l'action</h1>
              <p className="text-gray-500 mt-1">Gère les informations, l’avancement et le contexte de l’action.</p>
            </div>
            <div className="flex justify-end gap-3">
      <button
        onClick={handleDelete}
        disabled={deleting}
        className="button-primary bg-red-600 disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {deleting ? "Suppression..." : "Supprimer"}
      </button>
      <button
        onClick={handleSave}
        className="button-primary"
      >
        Enregistrer
      </button>
    </div>
          </div>

          {/* Informations générales */}
          <div className="pt-6 mt-6 border-t border-light-border">
            <h2 className="text-lg font-semibold mb-4">Informations générales</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-semibold mb-2">Nom de l'action</label>
                <input
                  type="text"
                  value={action.name || ""}
                  onChange={(e) => setAction({...action, name: e.target.value})}
                  className="w-full input-primary"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2">Priorité</label>
                <Select
                  value={action.priority || ""}
                  onChange={(value) => setAction({...action, priority: value})}
                  options={[
                    { value: "", label: "Sélectionner" },
                    { value: "high", label: "Haute" },
                    { value: "medium", label: "Moyenne" },
                    { value: "low", label: "Basse" }
                  ]}
                />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2">Statut</label>
                <Select
                  value={action.status}
                  onChange={(value) => setAction({...action, status: value})}
                  options={[
                    { value: "no_status", label: "Pas de statut" },
                    { value: "upcoming", label: "À venir" },
                    { value: "in_progress", label: "En cours" },
                    { value: "blocked", label: "Bloqué" },
                    { value: "completed", label: "Terminé" }
                  ]}
                />
              </div>
              {action.status === "blocked" ? (
                <div className="md:col-span-2">
                  <label className="block text-sm font-semibold mb-2">Raison de blocage</label>
                  <input
                    type="text"
                    value={action.blocked_reason || ""}
                    onChange={(e) => setAction({...action, blocked_reason: e.target.value})}
                    className="w-full input-primary"
                  />
                </div>
              ) : null}
            </div>
          </div>

          {/* Type et référence */}
          <div className="pt-6 mt-6 border-t border-light-border">
            <h2 className="text-lg font-semibold mb-4">Type et référence</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold mb-2">Type</label>
                <div className="w-full input-primary bg-gray-50">
                  {action.type || "Aucun type"}
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2">Parent Action liée</label>
                <div className="w-full input-primary bg-gray-50">
                  {action.action_parent_name || "Aucune action"}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between border rounded-xl p-4 bg-gray-50 mt-4">
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={action.is_subsidized_by_program || false}
                  onChange={(e) => setAction({...action, is_subsidized_by_program: e.target.checked})}
                  className="w-4 h-4"
                />
                <span className="text-sm font-medium text-gray-800">Subventionné par le programme</span>
              </label>
            </div>
          </div>

          {/* Collectivité et calendrier */}
          <div className="pt-6 mt-6 border-t border-light-border">
            <h2 className="text-lg font-semibold mb-4">Collectivité et calendrier</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-semibold mb-2">Collectivité</label>
                <div className="w-full input-primary bg-gray-50">
                  {action.collectivity_name || "Aucune collectivité"}
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2">Date de début</label>
                <input
                  type="date"
                  value={action.date_start ? new Date(action.date_start).toISOString().split('T')[0] : ""}
                  onChange={(e) => setAction({...action, date_start: e.target.value})}
                  className="w-full input-primary"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2">Date de fin</label>
                <input
                  type="date"
                  value={action.date_end ? new Date(action.date_end).toISOString().split('T')[0] : ""}
                  onChange={(e) => setAction({...action, date_end: e.target.value})}
                  className="w-full input-primary"
                />
              </div>
            </div>
          </div>

          {/* Responsables et partenaires */}
          <div className="pt-6 mt-6 border-t border-light-border">
            <h2 className="text-lg font-semibold mb-4">Responsables et partenaires</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold mb-2">Pilote</label>
                <Select
                  value={action.pilote || ""}
                  onChange={(value) => setAction({...action, pilote: value})}
                  options={[
                    { value: "", label: "Sélectionner" },
                    { value: "epci", label: "Acteur public" },
                    { value: "acteur_economique", label: "Acteur économique" },
                    { value: "autres", label: "Autres" }
                  ]}
                />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2">Nom du pilote</label>
                <input
                  type="text"
                  value={action.pilote_description || ""}
                  onChange={(e) => setAction({...action, pilote_description: e.target.value})}
                  className="w-full input-primary"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2">Partenaires</label>
                <Select
                  value={action.partners || ""}
                  onChange={(value) => setAction({...action, partners: value})}
                  options={[
                    { value: "", label: "Sélectionner" },
                    { value: "epci", label: "Acteur public" },
                    { value: "acteur_economique", label: "Acteur économique" },
                    { value: "autres", label: "Autres" }
                  ]}
                />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2">Nom des partenaires</label>
                <input
                  type="text"
                  value={action.partners_description || ""}
                  onChange={(e) => setAction({...action, partners_description: e.target.value})}
                  className="w-full input-primary"
                />
              </div>
            </div>
          </div>

          {/* Budget */}
          <div className="pt-6 mt-6 border-t border-light-border">
            <h2 className="text-lg font-semibold mb-4">Budget</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold mb-2">Coûts budget</label>
                <input
                  type="number"
                  value={action.budget_costs || ""}
                  onChange={(e) => setAction({...action, budget_costs: e.target.value})}
                  className="w-full input-primary"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2">Description du budget</label>
                <input
                  type="text"
                  value={action.budget_description || ""}
                  onChange={(e) => setAction({...action, budget_description: e.target.value})}
                  className="w-full input-primary"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2">Aide financière</label>
                <input
                  type="number"
                  value={action.financial_aid || ""}
                  onChange={(e) => setAction({...action, financial_aid: e.target.value})}
                  className="w-full input-primary"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2">Description aide financière</label>
                <input
                  type="text"
                  value={action.financial_aid_description || ""}
                  onChange={(e) => setAction({...action, financial_aid_description: e.target.value})}
                  className="w-full input-primary"
                />
              </div>
            </div>
          </div>

          {/* Contenu et suivi */}
          <div className="pt-6 mt-6 border-t border-light-border">
            <h2 className="text-lg font-semibold mb-4">Contenu et suivi</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold mb-2">Initiatives liées</label>
                <textarea
                  rows="4"
                  value={action.related_initiatives || ""}
                  onChange={(e) => setAction({...action, related_initiatives: e.target.value})}
                  className="w-full input-primary rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2">Description des étapes</label>
                <textarea
                  rows="4"
                  value={action.step_description || ""}
                  onChange={(e) => setAction({...action, step_description: e.target.value})}
                  className="w-full input-primary rounded-lg"
                />
              </div>
            </div>
            <div className="mt-4">
              <label className="block text-sm font-semibold mb-2">Description</label>
              <textarea
                value={action.description || ""}
                onChange={(e) => setAction({...action, description: e.target.value})}
                rows="4"
                className="w-full input-primary rounded-lg"
              />
            </div>
            <div className="mt-4">
              <label className="block text-sm font-semibold mb-2">Commentaire</label>
              <textarea
                value={action.comment || ""}
                onChange={(e) => setAction({...action, comment: e.target.value})}
                rows="4"
                className="w-full input-primary rounded-lg"
              />
            </div>
          </div>

          <div className="pt-6 mt-6 border-t border-light-border">
          <div className="flex justify-end gap-3">
      <button
        onClick={handleDelete}
        disabled={deleting}
        className="button-primary bg-red-600 disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {deleting ? "Suppression..." : "Supprimer"}
      </button>
      <button
        onClick={handleSave}
        className="button-primary"
      >
        Enregistrer
      </button>
    </div>
          </div>
        </div>
      </div>
  );
}