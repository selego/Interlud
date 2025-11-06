import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import api from "@/services/api";
import toast from "react-hot-toast";
import { SITUATION_TYPES } from "@/utils/constants";
import ProgressCircle from "@/components/ProgressCircle";
import { FiArrowLeft } from "react-icons/fi";
import IndicatorsList from "./IndicatorsList";
import SituationTab from "./SituationTab";
import { getDisplayedIndicators } from "./utils";

export const SITUATION_TABS = [
  { key: SITUATION_TYPES.INIT, label: "Initial" },
  { key: SITUATION_TYPES.REF, label: "Référence" },
  { key: SITUATION_TYPES.PREV, label: "Prévisionnel" },
  { key: SITUATION_TYPES.EXPOST, label: "Ex-post" }
]

export default function Completion({ action }) {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState(SITUATION_TYPES.INIT);
  const [selectedIndicator, setSelectedIndicator] = useState(null);
  const [indicators, setIndicators] = useState([]);

  const handleIndicatorSelection = useCallback((indicator) => {
    setSelectedIndicator(indicator);
  }, []);

  const fetchAllIndicators = async () => {
    try {
      const { ok, data, code } = await api.post(`/indicator_value/search`, { action_id: action._id, situation: activeTab });
      if (!ok) return toast.error(code || "Erreur lors du chargement");
      setIndicators(data);
    } catch (error) {
      toast.error("Une erreur est survenue");
    }
  };

  useEffect(() => {
    fetchAllIndicators();
  }, [action._id, activeTab]);

  const displayedIndicators = getDisplayedIndicators(selectedIndicator, indicators, action._id, activeTab);

  if (!action) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg text-gray-600">Chargement...</div>
      </div>
    );
  }

  return (
    <div className="flex h-screen">
      <div className="w-80 bg-white border-r border-gray-200 flex flex-col h-full">
        <div className="p-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Indicateurs</h3>
        </div>
        <div className="flex-1 overflow-y-auto p-4 pt-4">
          <IndicatorsList allIndicators={indicators} selectedIndicator={selectedIndicator} onSelectIndicator={handleIndicatorSelection} key={activeTab} />
        </div>
      </div>

      <div className="flex-1 p-8 overflow-y-auto">
        <div className="mb-6">
          <button
            onClick={() => navigate(`/actions/${action._id}/dashboard`)}
            className="flex items-center gap-2 text-gray-600 hover:text-primary-green transition-colors text-sm font-medium"
          >
            <FiArrowLeft size={16} />
            Retour au dashboard
          </button>
        </div>

        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900">{action.name}</h1>
          <div className="flex gap-2 items-center mt-2">
            <ProgressCircle percentage={action.completeness} size={20} />
            <p className="text-sm text-gray-900">
              Complété à <strong>{action.completeness}%</strong>
            </p>
            <p className="text-sm text-gray-600">
              - Dernière mise à jour le <strong>{new Date(action.updatedAt).toLocaleDateString()}</strong> par <strong>User1234</strong>
            </p>
          </div>
        </div>

        <div className="flex border-b border-gray-200 mb-6">
          {SITUATION_TABS.map(tab => (
            <TabButton key={tab.key} isActive={activeTab === tab.key} onClick={() => setActiveTab(tab.key)}>
              {tab.label}
            </TabButton>
          ))}
        </div>

        <SituationTab situation={activeTab} values={displayedIndicators} selectedIndicator={selectedIndicator} onUpdate={fetchAllIndicators} />
      </div>
    </div>
  )
}

function TabButton({ isActive, onClick, children }) {
  return (
    <button
      className={`px-6 py-3 text-sm font-semibold transition-all ${
        isActive ? "text-primary-green border-b-2 border-primary-green" : "text-gray-500 hover:text-primary-green"
      }`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
