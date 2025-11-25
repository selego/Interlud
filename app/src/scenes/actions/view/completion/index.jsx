import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import api from "@/services/api";
import toast from "react-hot-toast";
import { SITUATION_TYPES } from "@/utils/constants";
import ProgressCircle from "@/components/ProgressCircle";
import { FiArrowLeft } from "react-icons/fi";
import IndicatorsList from "./IndicatorsList";
import SituationTab from "./SituationTab";

export const SITUATION_TABS = [
  { key: SITUATION_TYPES.INIT, label: "Initial" },
  { key: SITUATION_TYPES.REF, label: "Référence" },
  { key: SITUATION_TYPES.PREV, label: "Prévisionnel" },
  { key: SITUATION_TYPES.EXPOST, label: "Ex-post" }
];

export default function Completion({ action }) {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState(SITUATION_TYPES.INIT);
  const [selectedIndicatorValue, setSelectedIndicatorValue] = useState(null);
  const [indicatorValues, setIndicatorValues] = useState([]);

  const fetchIndicatorsValues = async () => {
    try {
      const { ok, data, code } = await api.post(`/indicator_value/search`, { action_id: action._id, situation: activeTab });
      if (!ok) return toast.error(code || "Erreur lors du chargement");
      setIndicatorValues(data);
    } catch (error) {
      toast.error("Une erreur est survenue");
    }
  };


  useEffect(() => {
    fetchIndicatorsValues();
  }, [action._id, activeTab]);



  return (
    <div className="flex min-h-screen">
      <div className="w-80 bg-white border-r border-gray-200 flex flex-col h-screen sticky top-0">
        <div className="p-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Indicateurs</h3>
        </div>
        <div className="flex-1 overflow-y-auto p-4 pt-4">
          <IndicatorsList indicatorValues={indicatorValues} onSelectIndicatorValue={setSelectedIndicatorValue} />
        </div>
      </div>

      <div className="flex-1 p-8">
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
                - Dernière mise à jour le <strong>{new Date(action.last_modif_date).toLocaleDateString()}</strong>
                <span> par <strong>{action.last_modif_by_name || "Inconnu"}</strong></span>
              </p>
          </div>
        </div>

        <div className="flex border-b border-gray-200 mb-6">
          {SITUATION_TABS.map(tab => (
            <button key={tab.key} className={`px-6 py-3 text-sm font-semibold transition-all ${activeTab === tab.key ? "text-primary-green border-b-2 border-primary-green" : "text-gray-500 hover:text-primary-green"}`} onClick={() => setActiveTab(tab.key)}>
              {tab.label}
            </button>
          ))}
        </div>

        <SituationTab situation={activeTab} indicatorValues={indicatorValues} onUpdate={fetchIndicatorsValues} selectedIndicatorValue={selectedIndicatorValue} />
      </div>
    </div>
  )
}
