import { useParams, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { FiInfo, FiBarChart2, FiSave, FiTrash2 } from "react-icons/fi";
import api from "@/services/api"
import toast from "react-hot-toast"
import Select from "@/components/Select"

export default function View() {
    const {id} = useParams()
    const [activeTab, setActiveTab] = useState("info")
    const [indicator, setIndicator] = useState({
      name: "",
      description: "",
      value_unit: "",
      value_type: "",
      value_possibilities: [],
      indicator_category_id: "",
      indicator_category_name: "",
      indicator_sub_category_id: "",
      indicator_sub_category_name: ""
    });

    const getIndicator = async () => {
      try {
        const { ok, data, code } = await api.get(`/indicator/${id}`);
        if (!ok) return toast.error(code || "Une erreur est survenue")
        setIndicator(data)
      } catch (error) {
        toast.error(error || "Une erreur est survenue")
      }
    };

    useEffect(() => {
        getIndicator()
    }, [id])

    
    return (
      <div className="p-8">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold mb-2">
            {indicator.name || "Détails de l'indicateur"}
          </h1>
          {indicator.indicator_category_name && (
            <div className="flex items-center gap-2 text-sm">
              <span className="px-3 py-1 rounded-full bg-primary-green/10 text-primary-green font-medium">
                {indicator.indicator_category_name}
              </span>
              {indicator.indicator_sub_category_name && (
                <>
                  <span className="text-gray-400">›</span>
                  <span className="px-3 py-1 rounded-full bg-secondary-green/10 text-secondary-green font-medium">
                    {indicator.indicator_sub_category_name}
                  </span>
                </>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-center">
          <div className="w-full max-w-5xl">
            
            {/* Tabs Navigation */}
            <div className="flex border-b border-gray-200 mb-6">
              <button
                className={`px-6 py-3 text-sm font-semibold transition-all flex items-center gap-2 ${
                  activeTab === "info" 
                    ? "text-primary-green border-b-2 border-primary-green" 
                    : "text-gray-500 hover:text-primary-green"
                }`}
                onClick={() => setActiveTab("info")}
              >
                <FiInfo size={16} />
                Informations
              </button>

              <button
                className={`px-6 py-3 text-sm font-semibold transition-all flex items-center gap-2 ${
                  activeTab === "values" 
                    ? "text-primary-green border-b-2 border-primary-green" 
                    : "text-gray-500 hover:text-primary-green"
                }`}
                onClick={() => setActiveTab("values")}
              >
                <FiBarChart2 size={16} />
                Suivi des valeurs
              </button>
            </div>

            {/* Tab Content */}
            <div>
              {activeTab === "info" && (
                <InfoTab 
                  indicator={indicator} 
                  setIndicator={setIndicator}
                />
              )}
              {activeTab === "values" && (
                <ValueIndicator 
                  indicator={indicator} 
                />
              )}
            </div>

          </div>
        </div>
      </div>
    );
}

function InfoTab({ indicator, setIndicator }) {
  const [principalCategories, setPrincipalCategories] = useState([])
  const [subCategories, setSubCategories] = useState([])
  const navigate = useNavigate()

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

  const handleDelete = async () => {
    try {
      if (!confirm("Êtes-vous sûr de vouloir supprimer cet indicateur?")) return
      const { ok, data, code } = await api.delete(`/indicator/${indicator._id}`);
      if (!ok) return toast.error(code || "Une erreur est survenue")
      toast.success("Indicateur supprimé !")
      navigate("/admin/indicator")
    } catch (error) {
      toast.error(error || "Une erreur est survenue")
    }
  }

  const handleSave = async () => {
    try {
      const { ok, data, code } = await api.put(`/indicator/${indicator._id}`, indicator);
      if (!ok) return toast.error(code || "Une erreur est survenue")
      toast.success("Indicateur sauvegardé !")
    } catch (error) {
      toast.error(error || "Une erreur est survenue")
    }
  }

  useEffect(() => {
    fetchPrincipalCategories()
    fetchSubCategories()
  }, [])

  return (
    <div className="space-y-6">
      {/* Informations générales */}
      <div className="space-y-4 card-shadow">
        <h2 className="text-lg font-semibold text-gray-900 pb-2 border-b">
          Informations générales
        </h2>
        
        <div>
          <label className="block text-sm font-medium mb-2">Nom de l'indicateur</label>
          <input
            type="text"
            value={indicator.name || ""}
            onChange={(e) => setIndicator({...indicator, name: e.target.value})}
            className="w-full input-primary"
          />
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium mb-2">Unité de mesure</label>
            <input
              type="text"
              value={indicator.value_unit || ""}
              onChange={(e) => setIndicator({...indicator, value_unit: e.target.value})}
              className="w-full input-primary"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Type de valeur</label>
            <Select
              value={indicator.value_type || ""}
              onChange={(value) => setIndicator({...indicator, value_type: value})}
              options={[
                { value: "number", label: "Nombre" },
                { value: "text", label: "Texte" },
                { value: "radio", label: "Radio" },
                { value: "checkbox", label: "Checkbox" }
              ]}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Catégorie principale</label>
            <Select
              value={indicator.indicator_category_id || ""}
              onChange={(value) => {
                const selectedCategory = principalCategories.find(cat => cat._id === value);
                setIndicator({ ...indicator, indicator_category_id: value, indicator_category_name: selectedCategory?.name });
              }}
              options={[
                { value: "", label: "Sélectionner" },
                ...principalCategories.map((cat) => ({
                  value: cat._id,
                  label: cat.name
                }))
              ]}
            />
          </div>
        </div>

        {(indicator.value_type === "checkbox" || indicator.value_type === "radio") && (
          <div>
            <label className="block text-sm font-medium mb-2">Options disponibles</label>
            <div className="space-y-2">
              {(indicator.value_possibilities || []).map((option, index) => (
                <div key={index} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={option}
                    onChange={(e) => {
                      setIndicator({ ...indicator, value_possibilities: (indicator.value_possibilities || []).map((option, i) => i === index ? e.target.value : option) });
                    }}
                    className="flex-1 input-primary"
                    placeholder={`Option ${index + 1}`}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setIndicator({...indicator, value_possibilities: [...(indicator.value_possibilities || []).filter((_, i) => i !== index)]});
                    }}
                    className="px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <FiTrash2 size={16} />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => {
                  setIndicator({...indicator, value_possibilities: [...(indicator.value_possibilities || []), ""]});
                }}
                className="px-4 py-2 text-primary-green hover:bg-primary-green/10 rounded-lg border border-primary-green transition-colors"
              >
                Ajouter une option
              </button>
            </div>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium mb-2">Sous-catégorie</label>
          <Select
            value={indicator.indicator_sub_category_id || ""}
            onChange={(value) => {
              const selectedCategory = subCategories.find(cat => cat._id === value);
              setIndicator({ ...indicator, indicator_sub_category_id: value, indicator_sub_category_name: selectedCategory?.name });
            }}
            options={[
              { value: "", label: "Sélectionner" },
              ...subCategories.map((cat) => ({
                value: cat._id,
                label: cat.name
              }))
            ]}
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Description</label>
          <textarea
            value={indicator.description || ""}
            onChange={(e) => setIndicator({...indicator, description: e.target.value})}
            rows="4"
            className="w-full input-primary rounded-lg"
          />
        </div>
      </div>

      <div className="flex items-center justify-between pt-4">
        <button 
          onClick={handleDelete} 
          className="inline-flex items-center gap-2 px-5 py-2 text-sm font-medium text-red-600 bg-red-50 rounded-full hover:bg-red-100 transition-colors"
        >
          <FiTrash2 size={16} />
          Supprimer
        </button>
        
        <button 
          onClick={handleSave} 
          className="button-primary inline-flex items-center gap-2"
        >
          <FiSave size={16} />
          Enregistrer
        </button>
      </div>
    </div>
  )
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

  if (valueIndicators.length === 0) {
    return (
      <div className="bg-deco-background-green rounded-lg p-8 text-center border border-secondary-green">
        <FiBarChart2 className="mx-auto text-4xl text-primary-green mb-3" />
        <p className="text-gray-600">Aucune valeur enregistrée pour cet indicateur</p>
      </div>
    );
  }

  const collectivities = Object.values(
  valueIndicators.reduce((acc, value) => {
    const collectivityId = value.collectivity_id;
    const actionKey = value.action_id || 'no_action';
    
    if (!acc[collectivityId]) acc[collectivityId] = { collectivity_id: collectivityId, collectivity_name: value.collectivity_name, actions: {} };
    if (!acc[collectivityId].actions[actionKey]) acc[collectivityId].actions[actionKey] = { action_name: value.action_name || 'Sans action', situations: {} };
    acc[collectivityId].actions[actionKey].situations[value.situation] = value;
    return acc;
    }, {})
  ).map(coll => ({ ...coll, actions: Object.values(coll.actions) }));


  const situations = ['init', 'ref', 'prev', 'expost'];
  const situationLabels = { init: 'Initial', ref: 'Référence', prev: 'Prévisionnel', expost: 'Ex-post' };

  return (
    <div className="space-y-4 card-shadow">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Suivi des valeurs</h2>
        <span className="text-xs text-gray-500">
          {collectivities.length} collectivité{collectivities.length > 1 ? 's' : ''}
        </span>
      </div>

      <div className="space-y-3">
        {collectivities.map((collectivity) => (
          <div 
            key={collectivity.collectivity_id} 
            className="bg-white rounded-lg border border-gray-200 overflow-hidden"
          >
            {/* Header collectivité */}
            <div className="bg-primary-green/10 border-b border-primary-green/20 px-4 py-2">
              <h3 className="font-semibold text-sm text-primary-green">
                {collectivity.collectivity_name}
              </h3>
            </div>
            
            {/* Actions */}
            <div className="p-3 space-y-3">
              {collectivity.actions.map((action, idx) => (
                <div key={idx}>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-1 h-4 bg-secondary-green rounded-full"></div>
                    <h4 className="text-xs font-semibold text-gray-800">{action.action_name}</h4>
                  </div>
                  
                  {/* Grille des situations - Plus compacte */}
                  <div className="grid grid-cols-4 gap-2">
                    {situations.map((situation) => {
                      const value = action.situations[situation];
                      
                      return (
                        <div 
                          key={situation} 
                          className={`rounded-lg p-2 border ${
                            value?.value 
                              ? 'bg-deco-background-green border-secondary-green' 
                              : 'bg-gray-50 border-gray-200'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className={`text-[10px] font-bold uppercase ${
                              value?.value ? 'text-primary-green' : 'text-gray-500'
                            }`}>
                              {situationLabels[situation]}
                            </span>
                            {value?.year && (
                              <span className="text-[9px] text-gray-500 bg-white px-1.5 py-0.5 rounded-full">
                                {value.year}
                              </span>
                            )}
                          </div>
                          
                          <div className={`text-lg font-bold ${
                            value?.value ? 'text-gray-900' : 'text-gray-400'
                          }`}>
                            {value?.value || "—"}
                            {value?.value && indicator.value_unit && (
                              <span className="text-xs font-normal text-gray-600 ml-0.5">
                                {indicator.value_unit}
                              </span>
                            )}
                          </div>
                          
                          {value?.source && (
                            <div className="text-[9px] text-gray-600 mt-1 truncate" title={value.source}>
                              📊 {value.source}
                            </div>
                          )}
                          
                          {value?.comment && (
                            <div className="text-[9px] text-gray-500 italic mt-0.5 truncate" title={value.comment}>
                              💬 {value.comment}
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