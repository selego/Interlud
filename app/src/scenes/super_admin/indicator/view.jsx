import { useParams, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import api from "@/services/api"
import toast from "react-hot-toast"

export default function View() {
    const {id} = useParams()
    const navigate = useNavigate()
    const [principalCategories, setPrincipalCategories] = useState([])
    const [subCategories, setSubCategories] = useState([])
    const [indicator, setIndicator] = useState({
      name: "",
      description: "",
      value_unit: "",
      value_type: "",
      indicator_category_id: "",
      indicator_category_name: "",
      indicator_sub_category_id: "",
      indicator_sub_category_name: ""
    });
    const fetchPrincipalCategories = async () => {
      try {
        const { ok, data, code } = await api.post(`/indicator_category/search`, { type: "principal" });
        if (!ok) return toast.error(code || "Une erreur est survenue")
        setPrincipalCategories(data)
      } catch (error) {
        toast.error(error || "Une erreur est survenue")
      }
    }

    const fetchSubCategories = async () => {
      try {
        const { ok, data, code } = await api.post(`/indicator_category/search`, { type: "sub" });
        if (!ok) return toast.error(code || "Une erreur est survenue")
        setSubCategories(data)
      } catch (error) {
        toast.error(error || "Une erreur est survenue")
      }
    }

    const getIndicator = async () => {
      try {
        const { ok, data, code } = await api.get(`/indicator/${id}`);
        if (!ok) return toast.error(code || "Une erreur est survenue")
        setIndicator(data)
      } catch (error) {
        toast.error(error || "Une erreur est survenue")
      }
    };

    const handleDelete = async () => {
      try {
        if (!confirm("Are you sure you want to delete this indicator?")) return
        const { ok, data, code } = await api.delete(`/indicator/${id}`);
        if (!ok) return toast.error(code || "Une erreur est survenue")
        toast.success("Indicateur supprimé !")
        navigate("/admin/indicator")
      } catch (error) {
        toast.error(error || "Une erreur est survenue")
      }
    }

    const handleSave = async () => {
      try {
        const { ok, data, code } = await api.put(`/indicator/${id}`, indicator);
        if (!ok) return toast.error(code || "Une erreur est survenue")
        toast.success("Indicateur sauvegardé !")
      } catch (error) {
        toast.error(error || "Une erreur est survenue")
      }
    }

    useEffect(() => {
        getIndicator()
        fetchPrincipalCategories()
        fetchSubCategories()
    }, [id])


  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold mb-8">Détails de l'indicateur</h1>
      
      <div className="flex justify-center">
        <div className="w-full max-w-4xl">
          <div className="space-y-6">
            
            <div className="flex gap-6">
              <div className="flex-1">
                <label className="block text-sm font-semibold mb-2">Nom de l'indicateur</label>
                <input
                  type="text"
                  value={indicator.name || ""}
                  onChange={(e) => setIndicator({...indicator, name: e.target.value})}
                  className="w-full input-primary"
                />
              </div>

              <div className="flex-1">
                <label className="block text-sm font-semibold mb-2">Unité de mesure</label>
                <input
                  type="text"
                  value={indicator.value_unit || ""}
                  onChange={(e) => setIndicator({...indicator, value_unit: e.target.value})}
                  className="w-full input-primary"
                />
              </div>

              <div className="flex-1">
                <label className="block text-sm font-semibold mb-2">Type de valeur</label>
                <input
                  type="text"
                  value={indicator.value_type || ""}
                  onChange={(e) => setIndicator({...indicator, value_type: e.target.value})}
                  className="w-full input-primary"
                />
              </div>
            </div>

            <div className="flex gap-6">
                <div className="flex-1">
                  <label className="block text-sm font-semibold mb-2">Catégorie principale</label>
                  <select
                    value={indicator.indicator_category_id || ""}
                    onChange={(e) => {
                      const selectedCategory = principalCategories.find(cat => cat._id === e.target.value);
                      setIndicator({ ...indicator, indicator_category_id: e.target.value, indicator_category_name: selectedCategory.name });
                    }}
                    className="w-full input-primary"
                  >
                    <option value="">Sélectionner</option>
                    {principalCategories.map((cat) => (
                      <option key={cat._id} value={cat._id}>{cat.name}</option>
                    ))}
                  </select>
                </div>

                <div className="flex-1">
                  <label className="block text-sm font-semibold mb-2">Sous-catégorie</label>
                  <select
                    value={indicator.indicator_sub_category_id || ""}
                    onChange={(e) => {
                      const selectedCategory = subCategories.find(cat => cat._id === e.target.value);
                      setIndicator({ ...indicator, indicator_sub_category_id: e.target.value, indicator_sub_category_name: selectedCategory.name });
                    }}
                    className="w-full input-primary"
                  >
                    <option value="">Sélectionner</option>
                    {subCategories.map((cat) => (
                      <option key={cat._id} value={cat._id}>{cat.name}</option>
                    ))}
                  </select>
                </div>
            </div>

            <div>
              <label className="block text-sm font-semibold mb-2">Description</label>
              <textarea
                value={indicator.description || ""}
                onChange={(e) => setIndicator({...indicator, description: e.target.value})}
                rows="4"
                className="w-full input-primary rounded-lg"
              />
            </div>

            <ValueIndicator indicator={indicator} />

            <div className="flex justify-end pt-4 gap-4">
              <button 
                onClick={handleDelete} 
                className="px-6 py-2 bg-red-600 text-white rounded-full hover:bg-red-700 transition-colors font-medium"
              >
                Supprimer
              </button>
              <button onClick={handleSave} className="button-primary">
                Enregistrer
              </button>
            </div>
          </div>



        </div>
      </div>
    </div>
  );
}

function ValueIndicator({ indicator }) {
  const [valueIndicators, setValueIndicators] = useState([])

  const fetchValueIndicators = async () => {
    try {
      const { ok, data, code } = await api.post(`/indicator_value/search`, { indicator_id: indicator._id });
      if (!ok) return toast.error(code || "Une erreur est survenue")
      setValueIndicators(data)
    } catch (error) {
      toast.error(error || "Une erreur est survenue")
    }
  }

  useEffect(() => {
    if (indicator._id) {
      fetchValueIndicators()
    }
  }, [indicator._id])

  if (valueIndicators.length === 0) return null;

  // Grouper par collectivité puis par action - en tableaux
  const collectivitiesMap = new Map();
  
  valueIndicators.forEach((value) => {
    if (!collectivitiesMap.has(value.collectivity_id)) {
      collectivitiesMap.set(value.collectivity_id, {
        collectivity_id: value.collectivity_id,
        collectivity_name: value.collectivity_name,
        actionsMap: new Map()
      });
    }
    
    const collectivity = collectivitiesMap.get(value.collectivity_id);
    const actionKey = value.action_id || 'no_action';
    
    if (!collectivity.actionsMap.has(actionKey)) {
      collectivity.actionsMap.set(actionKey, {
        action_name: value.action_name || 'Sans action',
        situations: {}
      });
    }
    
    collectivity.actionsMap.get(actionKey).situations[value.situation] = value;
  });

  // Convertir en tableaux
  const collectivities = Array.from(collectivitiesMap.values()).map(coll => ({
    ...coll,
    actions: Array.from(coll.actionsMap.values())
  }));

  const situations = ['init', 'ref', 'prev', 'expost'];

  return (
    <div className="mt-4">
      <h2 className="text-lg font-bold mb-2">Valeurs de l'indicateur</h2>
      <div className="space-y-2">
        {collectivities.map((collectivity) => (
          <div key={collectivity.collectivity_id} className="bg-white rounded border border-gray-200 overflow-hidden">
            <div className="bg-gray-50 px-2 py-1 border-b border-gray-200">
              <h3 className="font-semibold text-xs text-gray-900">{collectivity.collectivity_name}</h3>
            </div>
            
            <div className="p-2 space-y-1.5">
              {collectivity.actions.map((action, idx) => (
                <div key={idx} className="border-l-2 border-indigo-400 pl-2">
                  <div className="text-xs font-medium text-gray-900 mb-1">{action.action_name}</div>
                  
                  <div className="grid grid-cols-4 gap-1.5">
                    {situations.map((situation) => {
                      const value = action.situations[situation];
                      return (
                        <div key={situation} className="bg-gray-50 rounded px-1.5 py-1 text-center">
                          <div className="text-[10px] font-semibold text-gray-500 uppercase">
                            {situation}
                          </div>
                          <div className="text-xs font-bold text-gray-900">
                            {value?.value || "-"}
                          </div>
                          {value?.year && (
                            <div className="text-[10px] text-gray-500">{value.year}</div>
                          )}
                          {value?.source && (
                            <div className="text-[10px] text-gray-500 truncate" title={value.source}>
                              {value.source}
                            </div>
                          )}
                          {value?.comment && (
                            <div className="text-[10px] text-gray-400 italic truncate" title={value.comment}>
                              {value.comment}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}