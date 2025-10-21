import React, { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import api from "@/services/api";
import toast from "react-hot-toast";
import Modal from "@/components/modal";

export default function Settings({ action }) {
  const { id } = useParams();
  const [indicatorValues, setIndicatorValues] = useState([]);
  const [indicators, setIndicators] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const fetchIndicatorValues = async () => {
    try{
        const { ok, data, code } = await api.post(`/indicator_value/search`, { action_id: id });
        if (!ok) return toast.error(code || "Une erreur est survenue");
        setIndicatorValues(data);
    }catch (error) {
        toast.error("Une erreur est survenue");
    }
  };

  const fetchIndicators = async () => {
    try{
    const ids = [...new Set(indicatorValues.map(v => v.indicator_id))];
        const { ok, data, code } = await api.post(`/indicator/search`, { _id: { $in: ids } });
        if (!ok) return toast.error(code || "Une erreur est survenue");
        setIndicators(data);
    }catch (error) {
        toast.error("Une erreur est survenue");
    }
  };


  useEffect(() => {
    fetchIndicatorValues();
  }, [id]);

  useEffect(() => {
    if (indicatorValues.length > 0) fetchIndicators();
  }, [indicatorValues]);


  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Liste des Indicateurs</h1>
        <button
          onClick={() => setIsModalOpen(true)}
          className="button-primary"
        >
          Ajouter
        </button>
      </div>
      
      <table className="w-full bg-white shadow-md rounded-lg overflow-hidden">
        <thead className="bg-gray-100">
          <tr>
            <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Nom</th>
            <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Description</th>
            <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Unité</th>
            <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Type</th>
            <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Catégorie</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {indicators.map((indicator) => (
            <tr key={indicator._id} className="hover:bg-gray-50">
              <td className="px-6 py-4 text-sm font-medium text-gray-900">{indicator.name}</td>
              <td className="px-6 py-4 text-sm text-gray-600">{indicator.description || "-"}</td>
              <td className="px-6 py-4 text-sm text-gray-600">{indicator.value_unit || "-"}</td>
              <td className="px-6 py-4 text-sm text-gray-600">{indicator.value_type || "-"}</td>
              <td className="px-6 py-4 text-sm text-gray-600">{indicator.indicator_category_name || "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <AddIndicatorModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} action={action} />

    </div>
  );
}

const AddIndicatorModal = ({ isOpen, onClose, action}) => {
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
        const selectedIndicator = allIndicators.find(i => i._id === selectedIndicatorId);
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
        } catch (error) {
          toast.error(error.message || "Indicateur déjà associé à cette action");
        }
      };

  return (
    <Modal isOpen={isOpen} onClose={() => { onClose(); setSelectedIndicatorId(""); }} className="max-w-md" >
    <div className="p-6">
      <h2 className="text-xl font-bold mb-4">Ajouter un indicateur</h2>
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Sélectionner un indicateur
        </label>
        <select
          value={selectedIndicatorId}
          onChange={(e) => setSelectedIndicatorId(e.target.value)}
          className="input-primary"
        >
          <option value="">-- Choisir un indicateur --</option>
          {allIndicators.map((indicator) => (
            <option key={indicator._id} value={indicator._id}>
              {indicator.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex justify-end">
        <button onClick={handleAddIndicator} className="button-primary" >
          Ajouter
        </button>
      </div>
    </div>
  </Modal>
  );
};