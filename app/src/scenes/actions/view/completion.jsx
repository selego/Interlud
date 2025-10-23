import React, { useState, useEffect } from "react";
import api from "@/services/api";
import toast from "react-hot-toast";
import { SITUATION_TYPES } from "@/utils/constants";

export default function Completion({ action }) {
  const [activeTab, setActiveTab] = useState(SITUATION_TYPES.INIT);
  const [selectedIndicator, setSelectedIndicator] = useState(null);

  if (!action) return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-lg text-gray-600">Chargement...</div>
    </div>
  );

  return (
    <div className="flex">
      <div className="w-80 bg-white border-r border-gray-200 p-4 sticky top-0 h-full overflow-y-auto">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Indicateurs</h3>
        <IndicatorsList 
          action={action} 
          activeTab={activeTab}
          selectedIndicator={selectedIndicator}
          onSelectIndicator={setSelectedIndicator}
        />
      </div>

      <div className="flex-1 p-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900">{action.name}</h1>
          <p className="text-gray-600 mt-1">Complétion des indicateurs</p>
        </div>
        <div className="flex border-b border-gray-200 mb-6">
          <button
            className={`px-6 py-3 text-sm font-semibold transition-all ${
              activeTab === SITUATION_TYPES.INIT  ? "text-primary-green border-b-2 border-primary-green"  : "text-gray-500 hover:text-primary-green"}`}
            onClick={() => setActiveTab(SITUATION_TYPES.INIT)}
          >
            Initial
          </button>

          <button
            className={`px-6 py-3 text-sm font-semibold transition-all ${
              activeTab === SITUATION_TYPES.REF   ? "text-primary-green border-b-2 border-primary-green"  : "text-gray-500 hover:text-primary-green" }`}
            onClick={() => setActiveTab(SITUATION_TYPES.REF)}
          >
            Référence
          </button>

          <button
            className={`px-6 py-3 text-sm font-semibold transition-all ${
              activeTab === SITUATION_TYPES.PREV ? "text-primary-green border-b-2 border-primary-green" : "text-gray-500 hover:text-primary-green"}`}
            onClick={() => setActiveTab(SITUATION_TYPES.PREV)}
          >
            Prévisionnel
          </button>

          <button
            className={`px-6 py-3 text-sm font-semibold transition-all ${
              activeTab === SITUATION_TYPES.EXPOST  ? "text-primary-green border-b-2 border-primary-green" : "text-gray-500 hover:text-primary-green"}`}
            onClick={() => setActiveTab(SITUATION_TYPES.EXPOST)}
          >
            Ex-post
          </button>
        </div>

        {activeTab === SITUATION_TYPES.INIT && <SituationTab action={action} situation={SITUATION_TYPES.INIT} selectedIndicator={selectedIndicator} />}
        {activeTab === SITUATION_TYPES.REF && <SituationTab action={action} situation={SITUATION_TYPES.REF} selectedIndicator={selectedIndicator} />}
        {activeTab === SITUATION_TYPES.PREV && <SituationTab action={action} situation={SITUATION_TYPES.PREV} selectedIndicator={selectedIndicator} />}
        {activeTab === SITUATION_TYPES.EXPOST && <SituationTab action={action} situation={SITUATION_TYPES.EXPOST} selectedIndicator={selectedIndicator} />}
      </div>
    </div>
  );
}

function IndicatorsList({ action, activeTab, selectedIndicator, onSelectIndicator }) {
  const [indicators, setIndicators] = useState([]);

  const fetchIndicators = async () => {
    try {
      const { ok, data, code } = await api.post(`/indicator_value/search`, {  action_id: action._id,  situation: activeTab  });
      if (!ok) return toast.error(code || "Une erreur est survenue");
      setIndicators(data);
    } catch (error) {
      toast.error("Une erreur est survenue");
    }
  };

  useEffect(() => {
    fetchIndicators();
  }, [action, activeTab]);

  return (
    <div className="space-y-1">
      {indicators.map((indicator) => (
        <div
          key={indicator._id}
          className={`p-2 rounded cursor-pointer transition-colors text-sm ${ selectedIndicator?._id === indicator._id  ? "bg-secondary-green text-primary-green"  : ""}`}
          onClick={() => onSelectIndicator(indicator)}
        >
          {indicator.value ? "✓" : "○"} {indicator.indicator_name}
        </div>
      ))}
    </div>
  );
}

function SituationTab({ action, situation, selectedIndicator }) {
  const [values, setValues] = useState([]);

  const fetchIndicatorsValue = async () => {
    try {
      const { ok, data, code } = await api.post(`/indicator_value/search`, { action_id: action._id, situation: situation });
      if (!ok) return toast.error(code || "Une erreur est survenue");
      setValues(data);
    } catch (error) {
      toast.error("Une erreur est survenue");
    }
  };

  const handleSave = async (value) => {
    try {
      const { ok, code } = await api.put(`/indicator_value/${value._id}`, value);
      if (!ok) return toast.error(code || "Une erreur est survenue");
      toast.success("Valeurs enregistrées");
      await fetchIndicatorsValue();
    } catch (error) {
      toast.error("Une erreur est survenue");
    }
  }

  const situationLabels = { init: "Initial", ref: "Référence", prev: "Prévisionnel", expost: "Ex-post"  };

  useEffect(() => {
    fetchIndicatorsValue();
  }, [action]);

  useEffect(() => {
    if (selectedIndicator) {
      const element = document.getElementById(`indicator-${selectedIndicator._id}`);
      if (element) element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [selectedIndicator]);
  
  if (values.length === 0) return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-lg text-gray-600">Aucune valeur trouvée</div>
    </div>
  );

  return (
    <div className="p-4">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Situation : {situationLabels[situation]}</h2>
      </div>
      
      <div className="space-y-3">
        {values.map((value) => (
          <div 
            key={value._id} 
            id={`indicator-${value._id}`}
            className={`bg-white card-shadow ${ selectedIndicator?._id === value._id  ? "border-primary-green border-2"  : ""}`}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-medium text-gray-900">{value.indicator_name}</h3>
              <button
                className="px-2 py-1 text-xs button-primary"
                onClick={() => handleSave(value)}
              >
                Enregistrer
              </button>
            </div>
            
            <div className="grid grid-cols-4 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Valeur</label>
                <input
                  type="text"
                  className="w-full input-primary"
                  value={value.value || ""}
                  onChange={(e) => setValues(values.map((v) => v._id === value._id ? { ...v, value: e.target.value } : v))}
                  placeholder="Valeur"
                />  
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Année</label>
                <input
                  type="number"
                  className="w-full input-primary"
                  value={value.year || ""}
                  onChange={(e) => setValues(values.map((v) => v._id === value._id ? { ...v, year: e.target.value } : v))}
                  placeholder="2024"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Source</label>
                <input
                  type="text"
                  className="w-full input-primary"
                  value={value.source || ""}
                  onChange={(e) => setValues(values.map((v) => v._id === value._id ? { ...v, source: e.target.value } : v))}
                  placeholder="Source"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Commentaire</label>
                <input
                  type="text"
                  className="w-full input-primary"
                  value={value.comment || ""}
                  onChange={(e) => setValues(values.map((v) => v._id === value._id ? { ...v, comment: e.target.value } : v))}
                  placeholder="Commentaire"
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}