import React, { useState, useEffect } from "react";
import api from "@/services/api";
import toast from "react-hot-toast";
import DebounceInput from "@/components/debounceInput";
import { SITUATION_TYPES } from "@/utils/constants";
import IndicatorValueInput from "./IndicatorValueInput";

export const SITUATION_LABELS = {
  [SITUATION_TYPES.INIT]: "Initial",
  [SITUATION_TYPES.REF]: "Référence",
  [SITUATION_TYPES.PREV]: "Prévisionnel",
  [SITUATION_TYPES.EXPOST]: "Ex-post"
}

export default function SituationTab({ situation, values, selectedIndicator, onUpdate }) {
  const [localValues, setLocalValues] = useState(values);

  useEffect(() => {
    setLocalValues(values);
  }, [values]);

  useEffect(() => {
    if (localValues.length > 0) {
      const firstValue = localValues[0];
      const element = document.getElementById(`indicator-${firstValue._id}`);
      if (element) element.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [localValues]);

  const handleAutoSave = async (updatedValue) => {
    try {
      setLocalValues(prev => prev.map(v => v._id === updatedValue._id ? updatedValue : v));
      
      const { ok, code } = await api.put(`/indicator_value/${updatedValue._id}`, updatedValue);
      
      if (!ok) {
        toast.error(code || "Une erreur est survenue");
        setLocalValues(values);
        return;
      }

      toast.success("Enregistrement automatique effectué");
      await onUpdate();
    } catch (error) {
      toast.error("Une erreur est survenue");
      setLocalValues(values);
    }
  };

  const handleValueChange = (valueId, field, newValue) => {
    const updatedValue = localValues.find(v => v._id === valueId);
    if (!updatedValue) return;
    handleAutoSave({ ...updatedValue, [field]: newValue });
  };

  if (localValues.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg text-gray-600">Aucune valeur trouvée</div>
      </div>
    );
  }

  return (
    <div className="p-4">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Situation : {SITUATION_LABELS[situation]}</h2>
      </div>

      <div className="space-y-3">
        {localValues.map((value) => (
          <div
            key={value._id}
            id={`indicator-${value._id}`}
            className={`bg-white card-shadow ${selectedIndicator?._id === value._id ? "border-primary-green border-2" : ""}`}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-medium text-gray-900">{value.indicator_name}</h3>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-2">Valeur</label>
                <IndicatorValueInput
                  value={value.value}
                  indicatorType={value.indicator_type}
                  options={value.indicator_value_possibilities}
                  onChange={(newValue) => handleValueChange(value._id, "value", newValue)}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Commentaire</label>
                <DebounceInput
                  type="text"
                  value={value.comment || ""}
                  onChange={(e) => handleValueChange(value._id, "comment", e.target.value)}
                  placeholder="Commentaire"
                  debounce={800}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
