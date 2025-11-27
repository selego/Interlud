import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import api from "@/services/api";
import toast from "react-hot-toast";
import { SITUATION_TYPES } from "@/utils/constants";
import ProgressCircle from "@/components/ProgressCircle";
import IndicatorsList from "./IndicatorsList";
import SituationTab from "./SituationTab";
import { FiArrowLeft } from "react-icons/fi";

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
  const [allIndicatorValues, setAllIndicatorValues] = useState([]);

  const fetchIndicatorsValues = async () => {
    try {
      const { ok, data, code } = await api.post(`/indicator_value/search`, { action_id: action._id, situation: activeTab });
      if (!ok) return toast.error(code || "Erreur lors du chargement");
      setIndicatorValues(data);
    } catch (error) {
      toast.error("Une erreur est survenue");
    }
  };

  const fetchAllIndicatorsValues = async () => {
    try {
      const { ok, data, code } = await api.post(`/indicator_value/search`, { action_id: action._id });
      if (!ok) return toast.error(code || "Erreur lors du chargement");
      setAllIndicatorValues(data);
    } catch (error) {
      toast.error("Une erreur est survenue");
    }
  };

  const isIndicatorValueFilled = (indicatorValue) => {
    const val = indicatorValue.value?.[indicatorValue.indicator_type];
    if (indicatorValue.indicator_type === 'checkbox')  return Array.isArray(val) && val.length > 0;
    return val !== null && val !== undefined && val !== '';
  };

  useEffect(() => {
    fetchIndicatorsValues();
  }, [action._id, activeTab]);

  useEffect(() => {
    fetchAllIndicatorsValues();
  }, [action._id]);



  return (
    <div className="min-h-screen p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
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
            <span className="text-gray-900 font-medium">Complétion</span>
          </div>
          
          <div className="flex justify-between items-center gap-4">
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate(-1)}
                className="p-2 rounded-full hover:bg-gray-100 text-gray-600 hover:text-primary-green transition-colors"
                aria-label="Revenir à la page précédente"
              >
                <FiArrowLeft size={18} />
              </button>
              <h1 className="text-3xl font-bold text-gray-900">
                {action.name}
              </h1>
            </div>
          </div>

        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900">{action.name}</h1>
          <div className="flex gap-2 items-center mt-2">
            <ProgressCircle percentage={ Math.round((allIndicatorValues.filter(isIndicatorValueFilled).length / allIndicatorValues.length) * 100)} size={20} />
            <p className="text-sm text-gray-900">
              Complété à <strong>{Math.round((allIndicatorValues.filter(isIndicatorValueFilled).length / allIndicatorValues.length) * 100)}%</strong>
            </p>
            <p className="text-sm text-gray-600">
              - Dernière mise à jour le <strong>{new Date(action.last_modif_date).toLocaleDateString()}</strong>
              <span> par <strong>{action.last_modif_by_name || "Inconnu"}</strong></span>
            </p>
          </div>
        </div>

        <div className="flex border-b border-gray-200 mb-8">
          {SITUATION_TABS.map(tab => (
            <button 
              key={tab.key} 
              className={`px-6 py-3 text-sm font-semibold transition-all ${activeTab === tab.key ? "text-primary-green border-b-2 border-primary-green" : "text-gray-500 hover:text-primary-green"}`} 
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex flex-col lg:flex-row gap-6">
          <div className="w-full lg:w-72 shrink-0">
            <div className="card-shadow p-4 sticky top-8 self-start">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Indicateurs</h3>
              <div className="overflow-y-auto max-h-[calc(100vh-300px)]">
                <IndicatorsList indicatorValues={indicatorValues} onSelectIndicatorValue={setSelectedIndicatorValue} />
              </div>
            </div>
          </div>

          <div className="flex-1">
            <SituationTab situation={activeTab} indicatorValues={indicatorValues} onUpdate={fetchIndicatorsValues} selectedIndicatorValue={selectedIndicatorValue} />
          </div>
        </div>
      </div>
    </div>
  )
}
