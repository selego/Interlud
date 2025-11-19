import React, { useState, useEffect } from "react";
import api from "@/services/api";
import toast from "react-hot-toast";
import { SITUATION_TYPES } from "@/utils/constants";
import IndicatorValueInput from "./IndicatorValueInput";
import useStore from "@/services/store";

export const SITUATION_LABELS = {
  [SITUATION_TYPES.INIT]: "Initial",
  [SITUATION_TYPES.REF]: "Référence",
  [SITUATION_TYPES.PREV]: "Prévisionnel",
  [SITUATION_TYPES.EXPOST]: "Ex-post"
}

export default function SituationTab({ situation, displayedIndicators, selectedIndicator, onUpdate, action }) {
  const { userIndicatorRights, user } = useStore();
  const [localValues, setLocalValues] = useState(displayedIndicators);
  
  const isAdmin = user.role === "admin" || user.collectivities.some(c => c.id === action?.collectivity_id && c.role === "admin");
  const isActor = user.collectivities.some(c => c.id === action?.collectivity_id && c.role === "actor");
  
  const canReadIndicator = (indicatorId) => {
    if (isAdmin) return true;
    if (!isActor) return true;
    const right = userIndicatorRights.find(r => r.indicator_id === indicatorId && r.action_id === action?._id);
    return right?.can_read !== false;
  };
  
  const canWriteIndicator = (indicatorId) => {
    if (isAdmin) return true;
    if (!isActor) return true;
    const right = userIndicatorRights.find(r => r.indicator_id === indicatorId && r.action_id === action?._id);
    return right?.can_write === true;
  };

  useEffect(() => {
    setLocalValues(displayedIndicators)
  }, [displayedIndicators])

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
        setLocalValues(displayedIndicators);
        return;
      }

      toast.success("Enregistrement automatique effectué");
      await onUpdate();
    } catch (error) {
      toast.error("Une erreur est survenue");
      setLocalValues(displayedIndicators);
    }
  };

  const handleValueChange = (valueId, field, newValue) => {
    const updatedValue = localValues.find(v => v._id === valueId);
    if (!canWriteIndicator(updatedValue?.indicator_id)) {
      toast.error("Vous n'avez pas les droits pour modifier cet indicateur");
      return;
    }
    handleAutoSave({ ...updatedValue, [field]: newValue });
  };

  if (localValues.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg text-gray-600">Aucune valeur trouvée</div>
      </div>
    );
  }

  const handleUseDefaultValues = async () => {
    try {
      const valuesToUpdate = localValues.filter(value => {
        if (!value.indicator_default_value) return false
        if (!canWriteIndicator(value.indicator_id)) return false
        if (Array.isArray(value.indicator_value_possibilities) && value.indicator_value_possibilities.length > 0) {
          return value.indicator_value_possibilities.includes(value.indicator_default_value)
        }
        return true
      })

      if (valuesToUpdate.length === 0) return toast.error("Aucune valeur par défaut disponible")

      setLocalValues(prev =>
        prev.map(v => {
          const toUpdate = valuesToUpdate.find(vtu => vtu._id === v._id)
          return toUpdate ? { ...v, value: toUpdate.indicator_default_value } : v
        })
      )

      const updatePromises = valuesToUpdate.map(value => 
        api.put(`/indicator_value/${value._id}`, { value: value.indicator_default_value })
      )

      const results = await Promise.allSettled(updatePromises)

      const successful = results.filter(r => r.status === "fulfilled" && r.value?.ok).length
      const failed = results.filter(r => r.status === "rejected" || !r.value?.ok).length

      if (failed > 0) {
        toast.error(`${failed} mise(s) à jour ont échoué`)
      }

      if (successful > 0) {
        toast.success(`${successful} valeur(s) par défaut appliquée(s)`)
      }

      await onUpdate()
    } catch (error) {
      toast.error("Une erreur est survenue lors de la mise à jour");
      setLocalValues(displayedIndicators);
    }
  };

  return (
    <div className="p-4">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Situation : {SITUATION_LABELS[situation]}</h2>
        {localValues.some(value => canWriteIndicator(value.indicator_id)) && (
          <button
            className="inline-flex items-center justify-center px-4 py-2 rounded-full text-sm font-medium bg-primary-green text-white w-fit"
            onClick={handleUseDefaultValues}
          >
            Utiliser la valeur par défaut pour tous
          </button>
        )}
      </div>

      <div className="space-y-3">
        {localValues
          .filter(value => canReadIndicator(value.indicator_id))
          .map(value => {
            const canWrite = canWriteIndicator(value.indicator_id);
            return (
              <div key={value._id} id={`indicator-${value._id}`} className={`bg-white card-shadow ${selectedIndicator?._id === value._id ? "border-primary-green border-2" : ""} ${!canWrite ? "opacity-75" : ""}`}>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-medium text-gray-900">{value.indicator_name}</h3>
                  {!canWrite && (
                    <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">Lecture seule</span>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                  <div className="flex flex-col">
                    <label className="block text-xs font-medium text-gray-600 mb-2">Valeur</label>
                    {canWrite ? (
                      <IndicatorValueInput
                        key={`${value._id}-${value.value || 'empty'}`}
                        value={value.value}
                        indicatorType={value.indicator_type}
                        options={value.indicator_value_possibilities}
                        onChange={newValue => handleValueChange(value._id, "value", newValue)}
                      />
                    ) : (
                      <div className="text-gray-600 font-medium">{value.value || "Aucune valeur"}</div>
                    )}
                  </div>

              <div className="flex flex-col">
                <label className="block text-xs font-medium text-gray-600 mb-2">Valeur par défaut</label>
                {!value.indicator_default_value && <p className="text-gray-600 mt-2">Aucune valeur par défaut</p>}
                {value.indicator_default_value && (
                  <div className="flex justify-between items-center gap-2">
                    <p className="text-gray-600">{value.indicator_default_value}</p>
                    {canWrite && (
                      <button
                        onClick={() => handleValueChange(value._id, "value", value.indicator_default_value)}
                        className="inline-flex items-center justify-center px-4 py-2 rounded-full text-sm font-medium bg-primary-green text-white w-fit"
                      >
                        Utiliser la valeur par défaut
                      </button>
                    )}
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
