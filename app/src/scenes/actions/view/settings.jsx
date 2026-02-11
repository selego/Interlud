import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import api from "@/services/api";
import toast from "react-hot-toast";
import Modal from "@/components/modal";
import { FiList, FiSettings, FiClock, FiArrowLeft, FiPlus } from "react-icons/fi";
import Select from "@/components/Select";
import History from "./history";
import Pagination from "@/components/pagination";
import DebounceInput from "@/components/debounceInput";

export default function Settings({ action: initialAction, onSave }) {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("settings");
  const [action, setAction] = useState(initialAction);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setAction(initialAction);
  }, [initialAction]);

  const handleUpdate = async (key, value) => {
    const updatedAction = { ...action, [key]: value };
    setAction(updatedAction);
    
    try {
      setIsSaving(true);
      const { ok, code } = await api.put(`/action/${action._id}`, updatedAction);
      if (!ok) return toast.error(code || "Une erreur est survenue");
      toast.success("Sauvegardé");
    } catch (error) {
      toast.error(error || "Une erreur est survenue");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    try {
      const { ok, code } = await api.delete(`/action/${action._id}`);
      if (!ok) return toast.error(code || "Une erreur est survenue");
      toast.success("Action supprimée");
      navigate('/actions');
    } catch (error) {
      toast.error(error || "Une erreur est survenue");
    }
  };

  return (
    <div className="min-h-screen p-8">
    <div className="max-w-7xl mx-auto">
      <div className="mb-6">
        <div className="flex items-center gap-2 text-sm text-gray-600 mb-4">
          <button 
            onClick={() => navigate('/actions')} 
            className="hover:text-primary-green transition-colors"
          >
            Actions
          </button>
          <span>/</span>
          <button 
            onClick={() => navigate(`/actions/${action._id}/dashboard`)} 
            className="hover:text-primary-green transition-colors truncate max-w-[150px]"
          >
            {action.name}
          </button>
          <span>/</span>
          <span className="text-gray-900 font-medium">Paramètres</span>
        </div>
        
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="p-2 rounded-full hover:bg-gray-100 text-gray-600 hover:text-primary-green transition-colors"
            aria-label="Revenir à la page précédente"
          >
            <FiArrowLeft size={18} />
          </button>
          <h1 className="text-3xl font-bold text-gray-900">{action.name}</h1>
          {isSaving && (
            <div className="flex items-center gap-2 text-sm text-gray-500 ml-4">
              <div className="w-4 h-4 border-2 border-gray-300 border-t-primary-green rounded-full animate-spin"></div>
              <span>Sauvegarde...</span>
            </div>
          )}
        </div>
      </div>

      <div className="flex mb-6">
        {/* <button
          className={`px-6 py-3 text-sm font-semibold transition-all flex items-center gap-2 ${
            activeTab === "indicators" ? "text-primary-green border-b-2 border-primary-green" : "text-gray-500 hover:text-primary-green"
          }`}
          onClick={() => setActiveTab("indicators")}
        >
          <FiList size={16} />
          Liste des Indicateurs
        </button> */}

        <button
          className={`px-6 py-3 text-sm font-semibold transition-all flex items-center gap-2 ${
            activeTab === "settings" ? "text-primary-green border-b-2 border-primary-green" : "text-gray-500 hover:text-primary-green"
          }`}
          onClick={() => setActiveTab("settings")}
        >
          <FiSettings size={16} />
          Paramètres de l'Action
        </button>
        <button
          className={`px-6 py-3 text-sm font-semibold transition-all flex items-center gap-2 ${
            activeTab === "history" ? "text-primary-green border-b-2 border-primary-green" : "text-gray-500 hover:text-primary-green"
          }`}
          onClick={() => setActiveTab("history")}
        >
          <FiClock size={16} />
          Historique de l'Action
        </button>
      </div>

      {activeTab === "indicators" && <IndicatorsTab action={action} />}
      {activeTab === "settings" && ( <ActionSettingsTab action={action} onUpdate={handleUpdate} onDelete={handleDelete} onActionUpdate={(updatedAction) => { setAction(updatedAction); if (onSave) onSave(); }} />)}
      {activeTab === "history" && <History action={action} />}
    </div>
    </div>
  )
}

function IndicatorsTab({ action }) {
  const [indicatorValues, setIndicatorValues] = useState([]);
  const [indicators, setIndicators] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [filters, setFilters] = useState({ page: 0, limit: 10 });
  const [total, setTotal] = useState(0);

  const fetchIndicatorValues = async () => {
    try {
      const { ok, data, code } = await api.post(`/indicator_value/search`, { action_id: action._id, limit: 10000 });
      if (!ok) return toast.error(code || "Une erreur est survenue");
      setIndicatorValues(data);
      console.log(data);
    } catch (error) {
      toast.error("Une erreur est survenue");
    }
  };

  const fetchIndicators = async () => {
    try {
      const ids = [...new Set(indicatorValues.map((v) => v.indicator_id))];
      const { ok, data, code, total } = await api.post(`/indicator/search`, { _id: { $in: ids }, page: filters.page, limit: filters.limit });
      if (!ok) return toast.error(code || "Une erreur est survenue");
      setIndicators(data);
      setTotal(total !== undefined ? total : ids.length);
    } catch (error) {
      toast.error("Une erreur est survenue");
    }
  };

  useEffect(() => {
    fetchIndicatorValues();
  }, [action]);

  useEffect(() => {
    if (indicatorValues.length > 0) fetchIndicators();
  }, [indicatorValues, filters]);

  return (
    <div className="p-8 card-shadow">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Indicateurs</h2>
          <p className="text-sm text-gray-600 mt-1">Liste des indicateurs associés à cette action</p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Nom</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Unité</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Type</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Catégorie</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {indicators.map((indicator) => (
              <tr key={indicator._id} className="hover:bg-gray-50 transition-colors">
                <td className="px-6 py-4 text-sm font-medium text-gray-900 truncate max-w-[500px]">{indicator.name}</td>
                <td className="px-6 py-4 text-sm text-gray-600">{indicator.value_unit || "-"}</td>
                <td className="px-6 py-4 text-sm text-gray-600">{indicator.value_type || "-"}</td>
                <td className="px-6 py-4 text-sm text-gray-600">{indicator.indicator_category_name || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Pagination 
        total={total} 
        per_page={filters.limit} 
        currentPage={filters.page + 1} 
        onNext={() => setFilters({ ...filters, page: filters.page + 1 })} 
        onPrevious={() => setFilters({ ...filters, page: filters.page - 1 })}
      />

      <AddIndicatorModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} action={action} onAdd={fetchIndicatorValues} />
    </div>
  );
}

function ActionSettingsTab({ action, onUpdate, onDelete, onActionUpdate }) {
  const [isAddPrevModalOpen, setIsAddPrevModalOpen] = useState(false);
  const [newPrevYear, setNewPrevYear] = useState("");
  const [isAddingPrev, setIsAddingPrev] = useState(false);
  const [isAddExpostModalOpen, setIsAddExpostModalOpen] = useState(false);
  const [newExpostYear, setNewExpostYear] = useState("");
  const [isAddingExpost, setIsAddingExpost] = useState(false);

  const addPrevisionnel = async () => {
    if (!newPrevYear) return toast.error("Veuillez sélectionner une année");
    const existingYears = (action.exel_files_prev || []).map(f => f.year_prev);
    if (existingYears.includes(parseInt(newPrevYear))) return toast.error("Cette année existe déjà");

    try {
      setIsAddingPrev(true);
      const { ok, data, code } = await api.post("/action/add_previsionnel", { action_id: action._id, year_prev: parseInt(newPrevYear) });
      if (!ok) return toast.error(code || "Une erreur est survenue");
      toast.success("Situation prévisionnelle ajoutée");
      setIsAddPrevModalOpen(false);
      setNewPrevYear("");
      if (onActionUpdate) onActionUpdate(data);
    } catch (error) {
      toast.error(error.message || "Une erreur est survenue");
    } finally {
      setIsAddingPrev(false);
    }
  };

  const addExpost = async () => {
    if (!newExpostYear) return toast.error("Veuillez sélectionner une année");
    const existingYears = (action.excel_files_expost || []).map(f => f.year_expost);
    if (existingYears.includes(parseInt(newExpostYear))) return toast.error("Cette année existe déjà");

    try {
      setIsAddingExpost(true);
      const { ok, data, code } = await api.post("/action/add_expost", { action_id: action._id, year_expost: parseInt(newExpostYear) });
      if (!ok) return toast.error(code || "Une erreur est survenue");
      toast.success("Situation ex-post ajoutée");
      setIsAddExpostModalOpen(false);
      setNewExpostYear("");
      if (onActionUpdate) onActionUpdate(data);
    } catch (error) {
      toast.error(error.message || "Une erreur est survenue");
    } finally {
      setIsAddingExpost(false);
    }
  };


  return (
    <div className="card-shadow">
      <div className="flex items-start justify-between gap-4 p-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Détails de l'action</h1>
          <p className="text-gray-500 mt-1">Gère les informations, l'avancement et le contexte de l'action.</p>
        </div>
      </div>

      <div className="pt-6 mt-6 border-t border-light-border px-6">
        <h2 className="text-lg font-semibold mb-4">Informations générales</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2">
            <label className="block text-sm font-semibold mb-2">Nom de l'action</label>
            <DebounceInput
              type="text"
              value={action.name || ""}
              onChange={(e) => onUpdate("name", e.target.value)}
              className="w-full input-primary"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold mb-2">Priorité</label>
            <Select
              value={action.priority || ""}
              onChange={(value) => onUpdate("priority", value)}
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
              onChange={(value) => onUpdate("status", value)}
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
              <DebounceInput
                type="text"
                value={action.blocked_reason || ""}
                onChange={(e) => onUpdate("blocked_reason", e.target.value)}
                className="w-full input-primary"
              />
            </div>
          ) : null}
        </div>
      </div>

      <div className="pt-6 mt-6 border-t border-light-border px-6">
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
              onChange={(e) => onUpdate("is_subsidized_by_program", e.target.checked)}
              className="w-4 h-4"
            />
            <span className="text-sm font-medium text-gray-800">Subventionné par le programme</span>
          </label>
        </div>
      </div>

      <div className="pt-6 mt-6 border-t border-light-border px-6">
        <h2 className="text-lg font-semibold mb-4">Situations</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
          <div>
            <label className="block text-sm font-semibold mb-2">Année initiale</label>
            <div className="w-full input-primary bg-gray-50">{action.year_init || "-"}</div>
          </div>
          <div>
            <label className="block text-sm font-semibold mb-2">Année référence</label>
            <div className="w-full input-primary bg-gray-50">{action.year_ref || "-"}</div>
          </div>
        </div>
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-semibold">Années ex-post</label>
            <button
              onClick={() => setIsAddExpostModalOpen(true)}
              className="text-sm text-primary-green hover:underline flex items-center gap-1"
            >
              <FiPlus size={14} />
              Ajouter
            </button>
          </div>
          {(action.excel_files_expost || []).map(f => f.year_expost).sort((a, b) => a - b).length === 0 ? (
            <div className="w-full input-primary bg-gray-50 text-gray-400">Aucune année ex-post</div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {(action.excel_files_expost || []).map(f => f.year_expost).sort((a, b) => a - b).map((year) => (
                <span key={year} className="px-3 py-2 bg-gray-100 border rounded-lg text-sm font-medium">
                  {year}
                </span>
              ))}
            </div>
          )}
        </div>
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-semibold">Années prévisionnelles</label>
            <button
              onClick={() => setIsAddPrevModalOpen(true)}
              className="text-sm text-primary-green hover:underline flex items-center gap-1"
            >
              <FiPlus size={14} />
              Ajouter
            </button>
          </div>
          {(action.exel_files_prev || []).map(f => f.year_prev).sort((a, b) => a - b).length === 0 ? (
            <div className="w-full input-primary bg-gray-50 text-gray-400">Aucune année prévisionnelle</div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {(action.exel_files_prev || []).map(f => f.year_prev).sort((a, b) => a - b).map((year) => (
                <span key={year} className="px-3 py-2 bg-gray-100 border rounded-lg text-sm font-medium">
                  {year}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="pt-6 mt-6 border-t border-light-border px-6">
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
            <DebounceInput
              type="date"
              value={action.date_start ? new Date(action.date_start).toISOString().split('T')[0] : ""}
              onChange={(e) => onUpdate("date_start", e.target.value)}
              className="w-full input-primary"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold mb-2">Date de fin</label>
            <DebounceInput
              type="date"
              value={action.date_end ? new Date(action.date_end).toISOString().split('T')[0] : ""}
              onChange={(e) => onUpdate("date_end", e.target.value)}
              className="w-full input-primary"
            />
          </div>
        </div>
      </div>

      <div className="pt-6 mt-6 border-t border-light-border px-6">
        <h2 className="text-lg font-semibold mb-4">Responsables et partenaires</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold mb-2">Pilote</label>
            <Select
              value={action.pilote || ""}
              onChange={(value) => onUpdate("pilote", value)}
              options={[
                { value: "", label: "Sélectionner" },
                { value: "epci", label: "EPCI" },
                { value: "acteur_economique", label: "Acteur économique" }
              ]}
            />
          </div>
          <div>
            <label className="block text-sm font-semibold mb-2">Description du pilote</label>
            <DebounceInput
              type="text"
              value={action.pilote_description || ""}
              onChange={(e) => onUpdate("pilote_description", e.target.value)}
              className="w-full input-primary"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold mb-2">Partenaires</label>
            <Select
              value={action.partners || ""}
              onChange={(value) => onUpdate("partners", value)}
              options={[
                { value: "", label: "Sélectionner" },
                { value: "epci", label: "EPCI" },
                { value: "acteur_economique", label: "Acteur économique" }
              ]}
            />
          </div>
          <div>
            <label className="block text-sm font-semibold mb-2">Description des partenaires</label>
            <DebounceInput
              type="text"
              value={action.partners_description || ""}
              onChange={(e) => onUpdate("partners_description", e.target.value)}
              className="w-full input-primary"
            />
          </div>
        </div>
      </div>

      <div className="pt-6 mt-6 border-t border-light-border px-6">
        <h2 className="text-lg font-semibold mb-4">Budget</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold mb-2">Coûts budget</label>
            <DebounceInput
              type="number"
              value={action.budget_costs || ""}
              onChange={(e) => onUpdate("budget_costs", e.target.value)}
              className="w-full input-primary"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold mb-2">Commentaire du budget</label>
            <DebounceInput
              type="text"
              value={action.budget_description || ""}
              onChange={(e) => onUpdate("budget_description", e.target.value)}
              className="w-full input-primary"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold mb-2">Aide financière</label>
            <DebounceInput
              type="number"
              value={action.financial_aid || ""}
              onChange={(e) => onUpdate("financial_aid", e.target.value)}
              className="w-full input-primary"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold mb-2">Commentaire aide financière</label>
            <DebounceInput
              type="text"
              value={action.financial_aid_description || ""}
              onChange={(e) => onUpdate("financial_aid_description", e.target.value)}
              className="w-full input-primary"
            />
          </div>
        </div>
      </div>

      <div className="pt-6 mt-6 border-t border-light-border px-6">
        <h2 className="text-lg font-semibold mb-4">Contenu et suivi</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold mb-2">Initiatives liées</label>
            <DebounceInput
              type="textarea"
              rows="4"
              value={action.related_initiatives || ""}
              onChange={(e) => onUpdate("related_initiatives", e.target.value)}
              className="w-full input-primary rounded-lg"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold mb-2">Description des étapes</label>
            <DebounceInput
              type="textarea"
              rows="4"
              value={action.step_description || ""}
              onChange={(e) => onUpdate("step_description", e.target.value)}
              className="w-full input-primary rounded-lg"
            />
          </div>
        </div>
        <div className="mt-4">
          <label className="block text-sm font-semibold mb-2">Description</label>
          <DebounceInput
            type="textarea"
            value={action.description || ""}
            onChange={(e) => onUpdate("description", e.target.value)}
            rows="4"
            className="w-full input-primary rounded-lg"
          />
        </div>
        <div className="mt-4 pb-6">
          <label className="block text-sm font-semibold mb-2">Commentaire</label>
          <DebounceInput
            type="textarea"
            value={action.comment || ""}
            onChange={(e) => onUpdate("comment", e.target.value)}
            rows="4"
            className="w-full input-primary rounded-lg"
          />
        </div>
      </div>

      <div className="pt-6 mt-6 border-t border-light-border px-6 pb-6">
        <h2 className="text-lg font-semibold mb-4 text-red-600">Zone de danger</h2>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center justify-between">
          <div>
            <h3 className="font-medium text-red-800">Supprimer l'action</h3>
            <p className="text-sm text-red-600 mt-1">Cette action est irréversible. Toutes les données associées seront perdues.</p>
          </div>
          <button
            onClick={() => {
              if (window.confirm("Êtes-vous sûr de vouloir supprimer cette action ? Cette opération est irréversible.")) {
                onDelete();
              }
            }}
            className="px-4 py-2 bg-white border border-red-200 text-red-600 rounded-lg hover:bg-red-50 hover:border-red-300 transition-colors text-sm font-medium"
          >
            Supprimer
          </button>
        </div>
      </div>

      <Modal isOpen={isAddPrevModalOpen} onClose={() => setIsAddPrevModalOpen(false)} className="max-w-md">
        <div className="p-6">
          <h2 className="text-xl font-bold text-gray-800 mb-6">Ajouter une situation prévisionnelle</h2>
          <div className="mb-6">
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Année prévisionnelle <span className="text-red-500">*</span>
            </label>
            <Select
              options={Array.from({ length: 30 }, (_, i) => {
                const year = new Date().getFullYear() + i;
                return { value: year.toString(), label: year.toString() };
              })}
              value={newPrevYear}
              onChange={(value) => setNewPrevYear(value)}
              placeholder="Sélectionner une année"
              constrained={true}
            />
          </div>
          <div className="flex justify-end gap-3">
            <button onClick={addPrevisionnel} disabled={isAddingPrev} className="button-primary">
              {isAddingPrev ? "Création..." : "Créer"}
            </button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={isAddExpostModalOpen} onClose={() => setIsAddExpostModalOpen(false)} className="max-w-md">
        <div className="p-6">
          <h2 className="text-xl font-bold text-gray-800 mb-6">Ajouter une situation ex-post</h2>
          <div className="mb-6">
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Année ex-post <span className="text-red-500">*</span>
            </label>
            <Select
              options={Array.from({ length: 30 }, (_, i) => {
                const year = new Date().getFullYear() + i;
                return { value: year.toString(), label: year.toString() };
              })}
              value={newExpostYear}
              onChange={(value) => setNewExpostYear(value)}
              placeholder="Sélectionner une année"
              constrained={true}
            />
          </div>
          <div className="flex justify-end gap-3">
            <button onClick={addExpost} disabled={isAddingExpost} className="button-primary">
              {isAddingExpost ? "Création..." : "Créer"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

const AddIndicatorModal = ({ isOpen, onClose, onAdd, action }) => {
  const [allIndicators, setAllIndicators] = useState([]);
  const [selectedIndicator, setSelectedIndicator] = useState(null);

  useEffect(() => {
    fetchAllIndicators();
  }, []);

  const fetchAllIndicators = async () => {
    try {
      const { ok, data, code } = await api.post(`/indicator/search`, {});
      if (!ok) return toast.error(code || "Une erreur est survenue");
      setAllIndicators(data);
    } catch (error) {
      toast.error("Une erreur est survenue");
    }
  };

  const handleAddIndicator = async () => {
    if (!selectedIndicator) return toast.error("Veuillez sélectionner un indicateur");

    try {
      const { ok, code } = await api.post(`/action/initialize_indicator_values`, {
        action_id: action._id,
        action_name: action.name,
        collectivity_id: action.collectivity_id,
        collectivity_name: action.collectivity_name,
        indicator_id: selectedIndicator._id,
        indicator_name: selectedIndicator.name,
        indicator_type: selectedIndicator.value_type,
        indicator_value_possibilities: selectedIndicator.value_possibilities
      });
      if (!ok) return toast.error(code || "Une erreur est survenue");

      toast.success("Indicateur ajouté avec succès");
      setSelectedIndicator(null);
      onClose();
      onAdd();
    } catch (error) {
      toast.error(error.message || "Indicateur déjà associé à cette action");
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => { onClose(); setSelectedIndicator(null)}}
      className="max-w-lg"
    >
      <div className="p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-6">Ajouter un indicateur</h2>
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">Sélectionner un indicateur</label>
          <Select 
            value={selectedIndicator?._id}
            onChange={(value) => {
              const indicator = allIndicators.find(i => i._id === value);
              setSelectedIndicator(indicator);
            }}
            options={[
              { value: "", label: "-- Choisir un indicateur --" },
              ...allIndicators.map((indicator) => ({
                value: indicator._id,
                label: indicator.name
              }))
            ]}
          />
        </div>

        <div className="flex justify-end">
          <button onClick={handleAddIndicator} className="button-primary">
            Ajouter
          </button>
        </div>
      </div>
    </Modal>
  );
};