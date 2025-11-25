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

  return (
    <div className="p-4">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Situation : {SITUATION_LABELS[situation]}</h2>
        <button
          className="inline-flex items-center justify-center px-4 py-2 rounded-full text-sm font-medium bg-primary-green text-white w-fit"
          onClick={ () => console.log("use default values")}
        >
          Utiliser la valeur par défaut pour tous
        </button  >
      </div>

      <div className="space-y-3">
        {indicatorValues.map(indicatorValue => {
          const isSelected = selectedIndicatorValue?._id === indicatorValue._id;
          return (
            <div 
              key={indicatorValue._id} 
              id={`indicator-${indicatorValue._id}`} 
              className={`bg-white card-shadow transition-all ${isSelected ? 'ring-2 ring-primary-green shadow-lg' : ''}`}
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-medium text-gray-900">{indicatorValue.indicator_name}</h3>
              </div>

            <div className="grid grid-cols-2 gap-x-6 gap-y-4">
              <div className="flex flex-col">
                <label className="block text-xs font-medium text-gray-600 mb-2">Valeur</label>
                <IndicatorValueInput
                  key={`${indicatorValue._id}-${indicatorValue.value?.[indicatorValue.indicator_type] || 'empty'}`}
                  value={indicatorValue.value?.[indicatorValue.indicator_type]}
                  indicatorType={indicatorValue.indicator_type}
                  options={indicatorValue.indicator_value_possibilities}
                  onChange={newValue => handleSaveIndicatorValue({ ...indicatorValue, value: { [indicatorValue.indicator_type]: newValue } })}
                />
              </div>

              <div className="flex flex-col">
                <label className="block text-xs font-medium text-gray-600 mb-2">Valeur par défaut</label>
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
