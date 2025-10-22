import { useParams, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import api from "@/services/api"
import toast from "react-hot-toast"

export default function View() {
  const {id} = useParams()
  const navigate = useNavigate()
  const [referenceAction, setReferenceAction] = useState([])
  const [collectivities, setCollectivities] = useState([])
  const [action, setAction] = useState({
    type: "custom",
    action_reference_id: "",
    action_reference_name: "",
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

  const fetchReferenceAction = async () => {
    try {
      const { ok, data, code } = await api.post(`/action/search`, {type: "reference"} );
      if (!ok) return toast.error(code || "Une erreur est survenue")
      setReferenceAction(data)
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
      const { ok, data, code } = await api.delete(`/action/${id}`);
      if (!ok) return toast.error(code || "Une erreur est survenue")
      toast.success("Action supprimée !")
      navigate("/admin/action")
    } catch (error) {
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
    fetchReferenceAction()
  }, [id])

  const ActionButtons = () => (
    <div className="flex justify-end gap-3">
      <button
        onClick={handleDelete}
        className="px-5 py-2 bg-red-50 text-red-700 rounded-full hover:bg-red-100 transition-colors font-medium border border-red-200"
      >
        Supprimer
      </button>
      <button
        onClick={handleSave}
        className="px-5 py-2 bg-gray-900 text-white rounded-full hover:bg-black transition-colors font-medium"
      >
        Enregistrer
      </button>
    </div>
  )

  return (
    <div className="p-6 md:p-8">
      <div className="w-full max-w-5xl mx-auto">
        <div className="card-shadow">
          {/* En-tête + boutons (haut) */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Détails de l'action</h1>
              <p className="text-gray-500 mt-1">Gère les informations, l’avancement et le contexte de l’action.</p>
            </div>
            <ActionButtons />
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
                <select
                  value={action.priority || ""}
                  onChange={(e) => setAction({...action, priority: e.target.value})}
                  className="w-full input-primary"
                >
                  <option value="">Sélectionner</option>
                  <option value="high">Haute</option>
                  <option value="medium">Moyenne</option>
                  <option value="low">Basse</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2">Statut</label>
                <select
                  value={action.status}
                  onChange={(e) => setAction({...action, status: e.target.value})}
                  className="w-full input-primary"
                >
                  <option value="no_status">Pas de statut</option>
                  <option value="upcoming">À venir</option>
                  <option value="in_progress">En cours</option>
                  <option value="blocked">Bloqué</option>
                  <option value="completed">Terminé</option>
                </select>
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
                <select
                  value={action.type}
                  onChange={(e) => setAction({...action, type: e.target.value})}
                  className="w-full input-primary"
                >
                  <option value="custom">Custom</option>
                  <option value="reference">Reference</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2">Charte Action liée</label>
                <select
                  value={action.action_reference_id || ""}
                  onChange={(e) => {
                    const selectedAction = referenceAction.find(ref => ref._id === e.target.value);
                    setAction({ ...action, action_reference_id: e.target.value, action_reference_name: selectedAction?.name });
                  }}
                  className="w-full input-primary"
                >
                  <option value="">Sélectionner</option>
                  {referenceAction.map((refAction) => (
                    <option key={refAction._id} value={refAction._id}>{refAction.name}</option>
                  ))}
                </select>
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
                <select
                  value={action.collectivity_id || ""}
                  onChange={(e) => setAction({
                    ...action,
                    collectivity_id: e.target.value,
                    collectivity_name: collectivities.find(c => c._id === e.target.value)?.name
                  })}
                  className="w-full input-primary"
                >
                  <option value="">Sélectionner</option>
                  {collectivities.map((collectivity) => (
                    <option key={collectivity._id} value={collectivity._id}>{collectivity.name}</option>
                  ))}
                </select>
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
                <select
                  value={action.pilote || ""}
                  onChange={(e) => setAction({...action, pilote: e.target.value})}
                  className="w-full input-primary"
                >
                  <option value="">Sélectionner</option>
                  <option value="epci">EPCI</option>
                  <option value="acteur_economique">Acteur économique</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2">Description du pilote</label>
                <input
                  type="text"
                  value={action.pilote_description || ""}
                  onChange={(e) => setAction({...action, pilote_description: e.target.value})}
                  className="w-full input-primary"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2">Partenaires</label>
                <select
                  value={action.partners || ""}
                  onChange={(e) => setAction({...action, partners: e.target.value})}
                  className="w-full input-primary"
                >
                  <option value="">Sélectionner</option>
                  <option value="epci">EPCI</option>
                  <option value="acteur_economique">Acteur économique</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2">Description des partenaires</label>
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

          {/* Boutons bas (identiques) */}
          <div className="pt-6 mt-6 border-t border-light-border">
            <ActionButtons />
          </div>
        </div>
      </div>
    </div>
  );
}