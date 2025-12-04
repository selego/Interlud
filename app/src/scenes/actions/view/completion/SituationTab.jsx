import React, { useState, useEffect } from "react";
import api from "@/services/api";
import toast from "react-hot-toast";
import { SITUATION_TYPES } from "@/utils/constants";
import IndicatorValueInput from "./IndicatorValueInput";

export const SITUATION_LABELS = {
  [SITUATION_TYPES.INIT]: "Initial",
  [SITUATION_TYPES.REF]: "Référence",
  [SITUATION_TYPES.PREV]: "Prévisionnel",
  [SITUATION_TYPES.EXPOST]: "Ex-post"
}

export default function SituationTab({ situation, indicatorValues, onUpdate, selectedIndicatorValue }) {

  useEffect(() => {
    if (selectedIndicatorValue) {
      const element = document.getElementById(`indicator-${selectedIndicatorValue._id}`);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [selectedIndicatorValue]);

  const handleSaveIndicatorValue = async (indicatorValue) => {
    try {
      const { ok, code } = await api.put(`/indicator_value/${indicatorValue._id}`, indicatorValue);
      if (!ok) return toast.error(code || "Une erreur est survenue");
      toast.success("Valeur enregistrée avec succès");
      await onUpdate();
    } catch (error) {
      toast.error("Une erreur est survenue");
    }
  };

  const handleUseAllDefaultValues = async () => {
    try {
      const indicatorsWithDefaults = indicatorValues.filter( iv => iv.value_default?.[iv.indicator_type] !== undefined && iv.value_default?.[iv.indicator_type] !== null);
      if (indicatorsWithDefaults.length === 0) return toast.error("Aucune valeur par défaut disponible");

      await Promise.all(indicatorsWithDefaults.map(async indicatorValue => {
        await api.put(`/indicator_value/${indicatorValue._id}`, { ...indicatorValue, value: { [indicatorValue.indicator_type]: indicatorValue.value_default[indicatorValue.indicator_type] }})
      }));
      toast.success("Valeurs par défaut appliquées avec succès");

    } catch (error) {
      toast.error("Une erreur est survenue");
    }
    await onUpdate();
  };

  return (
    <div className="card-shadow p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-lg font-semibold text-gray-900">Situation : {SITUATION_LABELS[situation]}</h2>
        <button
          className="inline-flex items-center justify-center px-4 py-2 rounded-full text-sm font-medium bg-primary-green text-white w-fit"
          onClick={handleUseAllDefaultValues}
        >
          Utiliser la valeur par défaut pour tous
        </button>
      </div>

      <div className="space-y-4">
        {[...indicatorValues].sort((a, b) => {
          if (a.indicator_category_name !== b.indicator_category_name) return a.indicator_category_name.localeCompare(b.indicator_category_name);
          if (!a.indicator_sub_category_name && b.indicator_sub_category_name) return -1;
          if (a.indicator_sub_category_name && !b.indicator_sub_category_name) return 1;
          if (a.indicator_sub_category_name !== b.indicator_sub_category_name) return a.indicator_sub_category_name.localeCompare(b.indicator_sub_category_name);
          return (a.indicator_name || "").toLowerCase().localeCompare((b.indicator_name || "").toLowerCase());
        }).map(indicatorValue => {
          const isSelected = selectedIndicatorValue?._id === indicatorValue._id;
          return (
            <div 
              key={indicatorValue._id} 
              id={`indicator-${indicatorValue._id}`} 
              className={`bg-white p-4 rounded-lg border border-gray-200 transition-all ${isSelected ? 'ring-2 ring-primary-green shadow-lg border-primary-green' : ''}`}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <h3 className="font-medium text-gray-900">{indicatorValue.indicator_name}</h3>
                  <Tooltip content="Saisissez la valeur de l'indicateur pour cette situation"/>
                </div>
              </div>

            <div className="grid grid-cols-2 gap-x-6 gap-y-4">
              <div className="flex flex-col">
                <label className="block text-xs font-medium text-gray-600 mb-2">
                  Valeur{indicatorValue.indicator_value_unit ? ` (${indicatorValue.indicator_value_unit})` : ''}
                </label>
                <IndicatorValueInput
                  key={`${indicatorValue._id}-${indicatorValue.value?.[indicatorValue.indicator_type] || 'empty'}`}
                  value={indicatorValue.value?.[indicatorValue.indicator_type]}
                  indicatorType={indicatorValue.indicator_type}
                  options={indicatorValue.indicator_value_possibilities}
                  onChange={newValue => handleSaveIndicatorValue({ ...indicatorValue, value: { [indicatorValue.indicator_type]: newValue } })}
                />
              </div>

              <div className="flex flex-col">
                <label className="block text-xs font-medium text-gray-600 mb-2">
                  Valeur par défaut{indicatorValue.indicator_value_unit ? ` (${indicatorValue.indicator_value_unit})` : ''}
                </label>
                  {!indicatorValue.value_default?.[indicatorValue.indicator_type] && <p className="text-gray-600 mt-2">Aucune valeur par défaut</p>}
                {indicatorValue.value_default?.[indicatorValue.indicator_type] && (
                  <div className="flex justify-between items-center gap-2">
                    <p className="text-gray-600">
                      {Array.isArray(indicatorValue.value_default[indicatorValue.indicator_type]) ? indicatorValue.value_default[indicatorValue.indicator_type].join(', ') : indicatorValue.value_default[indicatorValue.indicator_type]}
                    </p>
                    <button
                      onClick={() => handleSaveIndicatorValue({ ...indicatorValue, value: { [indicatorValue.indicator_type]: indicatorValue.value_default[indicatorValue.indicator_type] } })}
                      className="inline-flex items-center justify-center px-4 py-2 rounded-full text-sm font-medium bg-primary-green text-white w-fit"
                    >
                      Utiliser la valeur par défaut
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
        })}
      </div>
    </div>
  )
}


function Tooltip({ content }) {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <div className="relative inline-flex items-center">
      <div
        onMouseEnter={() => setIsVisible(true)}
        onMouseLeave={() => setIsVisible(false)}
        className="cursor-help"
      >
        <svg  className="w-4 h-4 text-gray-400 hover:text-gray-600"  fill="currentColor" viewBox="0 0 20 20">
            <path 
              fillRule="evenodd" 
              d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" 
              clipRule="evenodd" 
            />
          </svg>
      </div>
      {isVisible && (
        <div className="absolute z-50 bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 text-sm text-white bg-gray-900 rounded-lg shadow-lg whitespace-nowrap">
          {content}
          <div className="absolute top-full left-1/2 transform -translate-x-1/2 -mt-1">
            <div className="border-4 border-transparent border-t-gray-900"></div>
          </div>
        </div>
      )}
    </div>
  );
}