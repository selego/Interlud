import React, { useState, useEffect } from "react";
import api from "@/services/api";
import toast from "react-hot-toast";
import { SITUATION_TYPES } from "@/utils/constants";

export default function Completion({ action }) {
  const [activeTab, setActiveTab] = useState(SITUATION_TYPES.INIT);

  if (!action) return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-lg text-gray-600">Chargement...</div>
    </div>
  );

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">{action.name}</h1>
        <p className="text-gray-600 mt-1">Complétion des indicateurs</p>
      </div>
      <div className="flex border-b border-gray-200 mb-6">
        <button
          className={`px-6 py-3 text-sm font-semibold transition-all ${
            activeTab === SITUATION_TYPES.INIT  ? "text-green-600 border-b-2 border-green-600"  : "text-gray-500 hover:text-green-600"}`}
          onClick={() => setActiveTab(SITUATION_TYPES.INIT)}
        >
          Initial
        </button>

        <button
          className={`px-6 py-3 text-sm font-semibold transition-all ${
            activeTab === SITUATION_TYPES.REF   ? "text-green-600 border-b-2 border-green-600"  : "text-gray-500 hover:text-green-600" }`}
          onClick={() => setActiveTab(SITUATION_TYPES.REF)}
        >
          Référence
        </button>

        <button
          className={`px-6 py-3 text-sm font-semibold transition-all ${
            activeTab === SITUATION_TYPES.PREV ? "text-green-600 border-b-2 border-green-600" : "text-gray-500 hover:text-green-600"}`}
          onClick={() => setActiveTab(SITUATION_TYPES.PREV)}
        >
          Prévisionnel
        </button>

        <button
          className={`px-6 py-3 text-sm font-semibold transition-all ${
            activeTab === SITUATION_TYPES.EXPOST  ? "text-green-600 border-b-2 border-green-600" : "text-gray-500 hover:text-green-600"}`}
          onClick={() => setActiveTab(SITUATION_TYPES.EXPOST)}
        >
          Ex-post
        </button>
      </div>

      {activeTab === SITUATION_TYPES.INIT && <SituationTab action={action} situation={SITUATION_TYPES.INIT} />}
      {activeTab === SITUATION_TYPES.REF && <SituationTab action={action} situation={SITUATION_TYPES.REF} />}
      {activeTab === SITUATION_TYPES.PREV && <SituationTab action={action} situation={SITUATION_TYPES.PREV} />}
      {activeTab === SITUATION_TYPES.EXPOST && <SituationTab action={action} situation={SITUATION_TYPES.EXPOST} />}
    </div>
  );
}

function SituationTab({ action, situation }) {
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

  const situationLabels = {
    init: "Initial",
    ref: "Référence",
    prev: "Prévisionnel",
    expost: "Ex-post"
  };

  useEffect(() => {
    fetchIndicatorsValue();
  }, [action._id, situation]);

  if (values.length === 0) return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-lg text-gray-600">Aucune valeur trouvée</div>
    </div>
  );

  return (
    <div className="p-8 card-shadow">
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900">Situation : {situationLabels[situation]}</h2>
        <p className="text-sm text-gray-600 mt-1">Renseigner les valeurs des indicateurs</p>
      </div>
        <div className="space-y-6">
          {values.map((value) => {
            return (
              <div key={value._id} className="p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">{value.indicator_name}</h3>
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Valeur</label>
                    <input
                      type="number"
                      className="w-full input-primary"
                      value={value.value || ""}
                      onChange={(e) => setValues(values.map((v) => v._id === value._id ? { ...v, value: e.target.value } : v))}
                      placeholder="Entrer la valeur"
                    />  
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Année</label>
                    <input
                      type="number"
                      className="w-full input-primary"
                      value={value.year || ""}
                      onChange={(e) => setValues(values.map((v) => v._id === value._id ? { ...v, year: e.target.value } : v))}
                      placeholder="2024"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Source</label>
                    <input
                      type="text"
                      className="w-full input-primary"
                      value={value.source || ""}
                      onChange={(e) => setValues(values.map((v) => v._id === value._id ? { ...v, source: e.target.value } : v))}
                      placeholder="Source des données"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Commentaire</label>
                    <input
                      type="text"
                      className="w-full input-primary"
                      value={value.comment || ""}
                      onChange={(e) => setValues(values.map((v) => v._id === value._id ? { ...v, comment: e.target.value } : v))}
                      placeholder="Commentaire optionnel"
                    />
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    className="button-primary"
                    onClick={() => handleSave(value)}
                  >
                    Enregistrer
                  </button>
                </div>
              </div>
            );
          })}
        </div>
    </div>
  );
}