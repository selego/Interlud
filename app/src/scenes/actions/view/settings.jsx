import React, { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import api from "@/services/api";
import toast from "react-hot-toast";
import Modal from "@/components/modal";
import { FiList, FiSettings } from "react-icons/fi";
import Select from "@/components/Select";

export default function Settings({ action }) {
  const [activeTab, setActiveTab] = useState("indicators");

  return (
    <div className="p-8">
      {/* Tabs Navigation */}
      <div className="flex mb-6">
        <button
          className={`px-6 py-3 text-sm font-semibold transition-all flex items-center gap-2 ${
            activeTab === "indicators" ? "text-primary-green border-b-2 border-primary-green" : "text-gray-500 hover:text-primary-green"
          }`}
          onClick={() => setActiveTab("indicators")}
        >
          <FiList size={16} />
          Liste des Indicateurs
        </button>

        <button
          className={`px-6 py-3 text-sm font-semibold transition-all flex items-center gap-2 ${
            activeTab === "settings" ? "text-primary-green border-b-2 border-primary-green" : "text-gray-500 hover:text-primary-green"
          }`}
          onClick={() => setActiveTab("settings")}
        >
          <FiSettings size={16} />
          Paramètres de l'Action
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === "indicators" && <IndicatorsTab action={action} />}
      {activeTab === "settings" && <ActionSettingsTab action={action} />}
    </div>
  );
}

function IndicatorsTab({ action }) {
  const [indicatorValues, setIndicatorValues] = useState([]);
  const [indicators, setIndicators] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const fetchIndicatorValues = async () => {
    try {
      const { ok, data, code } = await api.post(`/indicator_value/search`, { action_id: action._id });
      if (!ok) return toast.error(code || "Une erreur est survenue");
      setIndicatorValues(data);
    } catch (error) {
      toast.error("Une erreur est survenue");
    }
  };

  const fetchIndicators = async () => {
    try {
      const ids = [...new Set(indicatorValues.map((v) => v.indicator_id))];
      const { ok, data, code } = await api.post(`/indicator/search`, { _id: { $in: ids } });
      if (!ok) return toast.error(code || "Une erreur est survenue");
      setIndicators(data);
    } catch (error) {
      toast.error("Une erreur est survenue");
    }
  };

  useEffect(() => {
    fetchIndicatorValues();
  }, [action]);

  useEffect(() => {
    if (indicatorValues.length > 0) fetchIndicators();
  }, [indicatorValues]);

  return (
    <div className="p-8 card-shadow">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Indicateurs</h2>
          <p className="text-sm text-gray-600 mt-1">Liste des indicateurs associés à cette action</p>
        </div>
        <button onClick={() => setIsModalOpen(true)} className="button-primary">
          Ajouter
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Nom</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Description</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Unité</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Type</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Catégorie</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {indicators.map((indicator) => (
              <tr key={indicator._id} className="hover:bg-gray-50 transition-colors">
                <td className="px-6 py-4 text-sm font-medium text-gray-900">{indicator.name}</td>
                <td className="px-6 py-4 text-sm text-gray-600">{indicator.description || "-"}</td>
                <td className="px-6 py-4 text-sm text-gray-600">{indicator.value_unit || "-"}</td>
                <td className="px-6 py-4 text-sm text-gray-600">{indicator.value_type || "-"}</td>
                <td className="px-6 py-4 text-sm text-gray-600">{indicator.indicator_category_name || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <AddIndicatorModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} action={action} onAdd={fetchIndicatorValues} />
    </div>
  );
}

function ActionSettingsTab({ action }) {
  const [actionData, setActionData] = useState({
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
  const [referenceAction, setReferenceAction] = useState([]);
  const [collectivities, setCollectivities] = useState([]);

  const fetchReferenceAction = async () => {
    try {
      const { ok, data, code } = await api.post(`/action/search`, { type: "reference" });
      if (!ok) return toast.error(code || "Une erreur est survenue");
      setReferenceAction(data);
    } catch (error) {
      toast.error(error || "Une erreur est survenue");
    }
  };

  const fetchCollectivities = async () => {
    try {
      const { ok, data, code } = await api.post(`/collectivity/search`, {});
      if (!ok) return toast.error(code || "Une erreur est survenue");
      setCollectivities(data);
    } catch (error) {
      toast.error(error || "Une erreur est survenue");
    }
  };

  useEffect(() => {
    fetchReferenceAction();
    fetchCollectivities();
  }, []);

  useEffect(() => {
    setActionData(action);
  }, [action]);

  const handleSave = async () => {
    try {
      const { ok, data, code } = await api.put(`/action/${action._id}`, actionData);
      if (!ok) return toast.error(code || "Une erreur est survenue");
      toast.success("Action sauvegardée !");
    } catch (error) {
      toast.error(error || "Une erreur est survenue");
    }
  };

  const ActionButtons = () => (
    <div className="flex justify-end gap-3">
      <button onClick={handleSave} className= "button-primary">
        Enregistrer
      </button>
    </div>
  );

  return (
    <div className="card-shadow">
      {/* En-tête + boutons (haut) */}
      <div className="flex items-start justify-between gap-4 p-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Détails de l'action</h1>
          <p className="text-gray-500 mt-1">Gère les informations, l'avancement et le contexte de l'action.</p>
        </div>
        <ActionButtons />
      </div>

      {/* Informations générales */}
      <div className="pt-6 mt-6 border-t border-light-border px-6">
        <h2 className="text-lg font-semibold mb-4">Informations générales</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2">
            <label className="block text-sm font-semibold mb-2">Nom de l'action</label>
            <input
              type="text"
              value={actionData.name || ""}
              onChange={(e) => setActionData({...actionData, name: e.target.value})}
              className="w-full input-primary"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold mb-2">Priorité</label>
            <Select
              value={actionData.priority || ""}
              onChange={(value) => setActionData({...actionData, priority: value})}
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
              value={actionData.status}
              onChange={(value) => setActionData({...actionData, status: value})}
              options={[
                { value: "no_status", label: "Pas de statut" },
                { value: "upcoming", label: "À venir" },
                { value: "in_progress", label: "En cours" },
                { value: "blocked", label: "Bloqué" },
                { value: "completed", label: "Terminé" }
              ]}
            />
          </div>
          {actionData.status === "blocked" ? (
            <div className="md:col-span-2">
              <label className="block text-sm font-semibold mb-2">Raison de blocage</label>
              <input
                type="text"
                value={actionData.blocked_reason || ""}
                onChange={(e) => setActionData({...actionData, blocked_reason: e.target.value})}
                className="w-full input-primary"
              />
            </div>
          ) : null}
        </div>
      </div>

      {/* Type et référence */}
      <div className="pt-6 mt-6 border-t border-light-border px-6">
        <h2 className="text-lg font-semibold mb-4">Type et référence</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold mb-2">Type</label>
            <Select
              value={actionData.type}
              onChange={(value) => setActionData({...actionData, type: value})}
              options={[
                { value: "custom", label: "Custom" },
                { value: "reference", label: "Reference" }
              ]}
            />
          </div>
          <div>
            <label className="block text-sm font-semibold mb-2">Charte Action liée</label>
            <Select
              value={actionData.action_reference_id || ""}
              onChange={(value) => {
                const selectedAction = referenceAction.find(ref => ref._id === value);
                setActionData({ ...actionData, action_reference_id: value, action_reference_name: selectedAction?.name });
              }}
              options={[
                { value: "", label: "Sélectionner" },
                ...referenceAction.map((refAction) => ({
                  value: refAction._id,
                  label: refAction.name
                }))
              ]}
            />
          </div>
        </div>

        <div className="flex items-center justify-between border rounded-xl p-4 bg-gray-50 mt-4">
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={actionData.is_subsidized_by_program || false}
              onChange={(e) => setActionData({...actionData, is_subsidized_by_program: e.target.checked})}
              className="w-4 h-4"
            />
            <span className="text-sm font-medium text-gray-800">Subventionné par le programme</span>
          </label>
        </div>
      </div>

      {/* Collectivité et calendrier */}
      <div className="pt-6 mt-6 border-t border-light-border px-6">
        <h2 className="text-lg font-semibold mb-4">Collectivité et calendrier</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-semibold mb-2">Collectivité</label>
            <Select
              value={actionData.collectivity_id || ""}
              onChange={(value) => setActionData({
                ...actionData,
                collectivity_id: value,
                collectivity_name: collectivities.find(c => c._id === value)?.name
              })}
              options={[
                { value: "", label: "Sélectionner" },
                ...collectivities.map((collectivity) => ({
                  value: collectivity._id,
                  label: collectivity.name
                }))
              ]}
            />
          </div>
          <div>
            <label className="block text-sm font-semibold mb-2">Date de début</label>
            <input
              type="date"
              value={actionData.date_start ? new Date(actionData.date_start).toISOString().split('T')[0] : ""}
              onChange={(e) => setActionData({...actionData, date_start: e.target.value})}
              className="w-full input-primary"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold mb-2">Date de fin</label>
            <input
              type="date"
              value={actionData.date_end ? new Date(actionData.date_end).toISOString().split('T')[0] : ""}
              onChange={(e) => setActionData({...actionData, date_end: e.target.value})}
              className="w-full input-primary"
            />
          </div>
        </div>
      </div>

      {/* Responsables et partenaires */}
      <div className="pt-6 mt-6 border-t border-light-border px-6">
        <h2 className="text-lg font-semibold mb-4">Responsables et partenaires</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold mb-2">Pilote</label>
            <Select
              value={actionData.pilote || ""}
              onChange={(value) => setActionData({...actionData, pilote: value})}
              options={[
                { value: "", label: "Sélectionner" },
                { value: "epci", label: "EPCI" },
                { value: "acteur_economique", label: "Acteur économique" }
              ]}
            />
          </div>
          <div>
            <label className="block text-sm font-semibold mb-2">Description du pilote</label>
            <input
              type="text"
              value={actionData.pilote_description || ""}
              onChange={(e) => setActionData({...actionData, pilote_description: e.target.value})}
              className="w-full input-primary"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold mb-2">Partenaires</label>
            <Select
              value={actionData.partners || ""}
              onChange={(value) => setActionData({...actionData, partners: value})}
              options={[
                { value: "", label: "Sélectionner" },
                { value: "epci", label: "EPCI" },
                { value: "acteur_economique", label: "Acteur économique" }
              ]}
            />
          </div>
          <div>
            <label className="block text-sm font-semibold mb-2">Description des partenaires</label>
            <input
              type="text"
              value={actionData.partners_description || ""}
              onChange={(e) => setActionData({...actionData, partners_description: e.target.value})}
              className="w-full input-primary"
            />
          </div>
        </div>
      </div>

      {/* Budget */}
      <div className="pt-6 mt-6 border-t border-light-border px-6">
        <h2 className="text-lg font-semibold mb-4">Budget</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold mb-2">Coûts budget</label>
            <input
              type="number"
              value={actionData.budget_costs || ""}
              onChange={(e) => setActionData({...actionData, budget_costs: e.target.value})}
              className="w-full input-primary"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold mb-2">Description du budget</label>
            <input
              type="text"
              value={actionData.budget_description || ""}
              onChange={(e) => setActionData({...actionData, budget_description: e.target.value})}
              className="w-full input-primary"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold mb-2">Aide financière</label>
            <input
              type="number"
              value={actionData.financial_aid || ""}
              onChange={(e) => setActionData({...actionData, financial_aid: e.target.value})}
              className="w-full input-primary"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold mb-2">Description aide financière</label>
            <input
              type="text"
              value={actionData.financial_aid_description || ""}
              onChange={(e) => setActionData({...actionData, financial_aid_description: e.target.value})}
              className="w-full input-primary"
            />
          </div>
        </div>
      </div>

      {/* Contenu et suivi */}
      <div className="pt-6 mt-6 border-t border-light-border px-6">
        <h2 className="text-lg font-semibold mb-4">Contenu et suivi</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold mb-2">Initiatives liées</label>
            <textarea
              rows="4"
              value={actionData.related_initiatives || ""}
              onChange={(e) => setActionData({...actionData, related_initiatives: e.target.value})}
              className="w-full input-primary rounded-lg"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold mb-2">Description des étapes</label>
            <textarea
              rows="4"
              value={actionData.step_description || ""}
              onChange={(e) => setActionData({...actionData, step_description: e.target.value})}
              className="w-full input-primary rounded-lg"
            />
          </div>
        </div>
        <div className="mt-4">
          <label className="block text-sm font-semibold mb-2">Description</label>
          <textarea
            value={actionData.description || ""}
            onChange={(e) => setActionData({...actionData, description: e.target.value})}
            rows="4"
            className="w-full input-primary rounded-lg"
          />
        </div>
        <div className="mt-4">
          <label className="block text-sm font-semibold mb-2">Commentaire</label>
          <textarea
            value={actionData.comment || ""}
            onChange={(e) => setActionData({...actionData, comment: e.target.value})}
            rows="4"
            className="w-full input-primary rounded-lg"
          />
        </div>
      </div>

      {/* Boutons bas */}
      <div className="pt-6 mt-6 border-t border-light-border px-6 pb-6">
        <ActionButtons />
      </div>
    </div>
  );
}

// Modal pour ajouter un indicateur
const AddIndicatorModal = ({ isOpen, onClose, onAdd, action }) => {
  const [allIndicators, setAllIndicators] = useState([]);
  const [selectedIndicatorId, setSelectedIndicatorId] = useState("");

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
    if (!selectedIndicatorId) return toast.error("Veuillez sélectionner un indicateur");
    const selectedIndicator = allIndicators.find((i) => i._id === selectedIndicatorId);
    if (!selectedIndicator) return;

    try {
      const response = await api.post(`/action/initialize_indicator_values`, {
        action_id: action._id,
        action_name: action.name,
        collectivity_id: action.collectivity_id,
        collectivity_name: action.collectivity_name,
        indicator_id: selectedIndicator._id,
        indicator_name: selectedIndicator.name,
      });

      const { ok, code } = response;
      if (!ok) return toast.error(code || "Une erreur est survenue");

      toast.success("Indicateur ajouté avec succès");
      setSelectedIndicatorId("");
      onClose();
      onAdd();
    } catch (error) {
      toast.error(error.message || "Indicateur déjà associé à cette action");
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => { onClose(); setSelectedIndicatorId("")}}
      className="max-w-lg"
    >
      <div className="p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-6">Ajouter un indicateur</h2>
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">Sélectionner un indicateur</label>
          <Select 
            value={selectedIndicatorId}
            onChange={setSelectedIndicatorId}
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