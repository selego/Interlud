import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import api from "@/services/api";
import toast from "react-hot-toast";
import { SITUATION_TYPES } from "@/utils/constants";
import DebounceInput from "@/components/debounceInput";
import { FiArrowLeft, FiChevronDown, FiChevronRight } from "react-icons/fi";

export default function Completion({ action }) {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState(SITUATION_TYPES.INIT);
  const [selectedIndicator, setSelectedIndicator] = useState(null);

  if (!action) return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-lg text-gray-600">Chargement...</div>
    </div>
  );

  return (
    <div className="flex h-screen">
      <div className="w-80 bg-white border-r border-gray-200 flex flex-col h-full">
        <div className="p-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Indicateurs</h3>
        </div>
        <div className="flex-1 overflow-y-auto p-4 pt-4">
          {/* <IndicatorsList action={action} activeTab={activeTab} selectedIndicator={selectedIndicator} onSelectIndicator={setSelectedIndicator} /> */}
          <IndicatorsListDemo selectedIndicator={selectedIndicator} onSelectIndicator={setSelectedIndicator} />
        </div>
      </div>

      <div className="flex-1 p-8 overflow-y-auto">
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
          <p className="text-gray-600 mt-1">Complétion des indicateurs</p>
        </div>
        <div className="flex border-b border-gray-200 mb-6">
          <button
            className={`px-6 py-3 text-sm font-semibold transition-all ${
              activeTab === SITUATION_TYPES.INIT  ? "text-primary-green border-b-2 border-primary-green"  : "text-gray-500 hover:text-primary-green"}`}
            onClick={() => setActiveTab(SITUATION_TYPES.INIT)}
          >
            Initial
          </button>

          <button
            className={`px-6 py-3 text-sm font-semibold transition-all ${
              activeTab === SITUATION_TYPES.REF   ? "text-primary-green border-b-2 border-primary-green"  : "text-gray-500 hover:text-primary-green" }`}
            onClick={() => setActiveTab(SITUATION_TYPES.REF)}
          >
            Référence
          </button>

          <button
            className={`px-6 py-3 text-sm font-semibold transition-all ${
              activeTab === SITUATION_TYPES.PREV ? "text-primary-green border-b-2 border-primary-green" : "text-gray-500 hover:text-primary-green"}`}
            onClick={() => setActiveTab(SITUATION_TYPES.PREV)}
          >
            Prévisionnel
          </button>

          <button
            className={`px-6 py-3 text-sm font-semibold transition-all ${
              activeTab === SITUATION_TYPES.EXPOST  ? "text-primary-green border-b-2 border-primary-green" : "text-gray-500 hover:text-primary-green"}`}
            onClick={() => setActiveTab(SITUATION_TYPES.EXPOST)}
          >
            Ex-post
          </button>
        </div>

        {activeTab === SITUATION_TYPES.INIT && <SituationTab action={action} situation={SITUATION_TYPES.INIT} selectedIndicator={selectedIndicator} />}
        {activeTab === SITUATION_TYPES.REF && <SituationTab action={action} situation={SITUATION_TYPES.REF} selectedIndicator={selectedIndicator} />}
        {activeTab === SITUATION_TYPES.PREV && <SituationTab action={action} situation={SITUATION_TYPES.PREV} selectedIndicator={selectedIndicator} />}
        {activeTab === SITUATION_TYPES.EXPOST && <SituationTab action={action} situation={SITUATION_TYPES.EXPOST} selectedIndicator={selectedIndicator} />}
      </div>
    </div>
  );
}

function IndicatorsList({ action, activeTab, selectedIndicator, onSelectIndicator }) {
  const [openCategories, setOpenCategories] = useState(new Set());
  const [openSubCategories, setOpenSubCategories] = useState(new Set());
  const [groupedData, setGroupedData] = useState({});

  const fetchIndicators = async () => {
    try {
      const { ok, data, code } = await api.post(`/indicator_value/search`, { action_id: action._id, situation: activeTab });
      if (!ok) return toast.error(code || "Une erreur est survenue");

      const grouped = {};
      data.forEach(indicator => {
        const categoryName = indicator.indicator_category_name || "Sans catégorie";
        const subCategoryName = indicator.indicator_sub_category_name;

        if (!grouped[categoryName]) {
          grouped[categoryName] = { subCategories: {}, directIndicators: [] };
        }

        if (subCategoryName) {
          if (!grouped[categoryName].subCategories[subCategoryName]) {
            grouped[categoryName].subCategories[subCategoryName] = [];
          }
          grouped[categoryName].subCategories[subCategoryName].push(indicator);
        } else {
          grouped[categoryName].directIndicators.push(indicator);
        }
      });

      setGroupedData(grouped);

      const firstCategory = Object.keys(grouped)[0];
      if (firstCategory) {
        setOpenCategories(new Set([firstCategory]));
        const firstIndicator =
          grouped[firstCategory].directIndicators[0] ||
          (Object.keys(grouped[firstCategory].subCategories).length > 0 ? grouped[firstCategory].subCategories[Object.keys(grouped[firstCategory].subCategories)[0]][0] : null);
        if (firstIndicator) {
          if (firstIndicator.indicator_sub_category_name) {
            setOpenSubCategories(new Set([`${firstCategory}-${firstIndicator.indicator_sub_category_name}`]));
          }
          onSelectIndicator(firstIndicator);
        }
      }
    } catch (error) {
      toast.error("Une erreur est survenue");
    }
  };

  useEffect(() => {
    fetchIndicators();
  }, [action, activeTab]);

  const toggleCategory = (categoryName) => {
    const newOpenCategories = new Set(openCategories);
    if (newOpenCategories.has(categoryName)) {
      newOpenCategories.delete(categoryName);
    } else {
      newOpenCategories.add(categoryName);
    }
    setOpenCategories(newOpenCategories);
  };

  const toggleSubCategory = (categoryName, subCategoryName) => {
    const key = `${categoryName}-${subCategoryName}`;
    const newOpenSubCategories = new Set(openSubCategories);
    if (newOpenSubCategories.has(key)) {
      newOpenSubCategories.delete(key);
    } else {
      newOpenSubCategories.add(key);
    }
    setOpenSubCategories(newOpenSubCategories);
  };

  const isCategoryOpen = (categoryName) => openCategories.has(categoryName);
  const isSubCategoryOpen = (categoryName, subCategoryName) => openSubCategories.has(`${categoryName}-${subCategoryName}`);

  return (
    <div className="space-y-1">
      {Object.entries(groupedData).map(([categoryName, categoryData]) => (
        <div key={categoryName}>
          <div className="flex items-center gap-2 p-2 rounded cursor-pointer transition-colors text-sm font-medium hover:bg-gray-50" onClick={() => toggleCategory(categoryName)}>
            {isCategoryOpen(categoryName) ? <FiChevronDown size={16} /> : <FiChevronRight size={16} />}
            <span className="flex-1">{categoryName}</span>
          </div>

          {isCategoryOpen(categoryName) && (
            <div className="ml-4 space-y-1">
              {categoryData.directIndicators.length > 0 && (
                <div className="space-y-1">
                  {categoryData.directIndicators.map(indicator => (
                    <div
                      key={indicator._id}
                      className={`p-2 rounded cursor-pointer transition-colors text-xs ${
                        selectedIndicator?._id === indicator._id ? "bg-secondary-green text-primary-green font-medium" : "hover:bg-gray-50"
                      }`}
                      onClick={() => onSelectIndicator(indicator)}
                    >
                      <span className="mr-2">{indicator.value ? "✓" : "○"}</span>
                      {indicator.indicator_name}
                    </div>
                  ))}
                </div>
              )}

              {Object.entries(categoryData.subCategories).map(([subCategoryName, indicators]) => (
                <div key={subCategoryName}>
                  <div
                    className="flex items-center gap-2 p-2 rounded cursor-pointer transition-colors text-xs hover:bg-gray-50"
                    onClick={() => toggleSubCategory(categoryName, subCategoryName)}
                  >
                    {isSubCategoryOpen(categoryName, subCategoryName) ? <FiChevronDown size={14} /> : <FiChevronRight size={14} />}
                    <span className="flex-1 text-gray-700">{subCategoryName}</span>
                  </div>

                  {isSubCategoryOpen(categoryName, subCategoryName) && (
                    <div className="ml-4 space-y-1">
                      {indicators.map(indicator => (
                        <div
                          key={indicator._id}
                          className={`p-2 rounded cursor-pointer transition-colors text-xs ${
                            selectedIndicator?._id === indicator._id ? "bg-secondary-green text-primary-green font-medium" : "hover:bg-gray-50"
                          }`}
                          onClick={() => onSelectIndicator(indicator)}
                        >
                          <span className="mr-2">{indicator.value ? "✓" : "○"}</span>
                          {indicator.indicator_name}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
function SituationTab({ action, situation, selectedIndicator }) {
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

  const handleAutoSave = async (updatedValue) => {
    try {
      setValues(values.map((v) => v._id === updatedValue._id ? updatedValue : v));
      const { ok, code } = await api.put(`/indicator_value/${updatedValue._id}`, updatedValue);
      if (!ok) return toast.error(code || "Une erreur est survenue");
      toast.success("Enregistrement automatique effectué");
      await fetchIndicatorsValue();
    } catch (error) {
      toast.error("Une erreur est survenue");
    }
  };

  const situationLabels = { init: "Initial", ref: "Référence", prev: "Prévisionnel", expost: "Ex-post" };

  useEffect(() => {
    fetchIndicatorsValue();
  }, [action]);

  useEffect(() => {
    if (selectedIndicator) {
      const element = document.getElementById(`indicator-${selectedIndicator._id}`);
      if (element) element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [selectedIndicator]);
  
  if (values.length === 0) return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-lg text-gray-600">Aucune valeur trouvée</div>
    </div>
  );

  return (
    <div className="p-4">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Situation : {situationLabels[situation]}</h2>
      </div>
      
      <div className="space-y-3">
        {values.map((value) => (
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
                
                {(value.indicator_type === "text" || value.indicator_type === undefined) && (
                  <DebounceInput
                    type="text"
                    placeholder="Valeur texte"
                    value={value.value || ""}
                    onChange={(e) => handleAutoSave({ ...value, value: e.target.value })}
                    debounce={800}
                  />
                )}

                {value.indicator_type === "number" && (
                  <DebounceInput
                    type="number"
                    value={value.value || ""}
                    onChange={(e) => handleAutoSave({ ...value, value: e.target.value })}
                    placeholder="Valeur numérique"
                    debounce={800}
                  />
                )}

                {value.indicator_type === "radio" && (
                  <div className="space-y-2">
                    {value.indicator_value_possibilities?.map((option, index) => (
                      <label key={index} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name={`value-${value._id}`}
                          value={option}
                          checked={value.value === option}
                          onChange={(e) => handleAutoSave({ ...value, value: e.target.value })}
                          className="text-primary-green focus:ring-primary-green focus:ring-2 focus:ring-primary-green/20"
                          style={{ accentColor: 'primary-green' }}
                        />
                        <span className="text-sm text-gray-700">{option}</span>
                      </label>
                    ))}
                  </div>
                )}

                {value.indicator_type === "checkbox" && (() => {
                  const selectedValues = value.value && typeof value.value === 'string'  ? value.value.split(',').filter(v => v.trim()) : [];
                  return (
                    <div className="space-y-2">
                      {value.indicator_value_possibilities?.map((option, index) => (
                        <label key={index} className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            value={option}
                            checked={selectedValues.includes(option)}
                            onChange={(e) => handleAutoSave({...value,value: e.target.checked ? [...selectedValues, option].join(',') : selectedValues.filter(v => v !== option).join(',') })}
                            className="text-primary-green focus:ring-primary-green focus:ring-2 focus:ring-primary-green/20 rounded"
                            style={{ accentColor: 'primary-green' }}
                          />
                          <span className="text-sm text-gray-700">{option}</span>
                        </label>
                      ))}
                    </div>
                  );
                })()}
              </div>
              
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Commentaire</label>
                <DebounceInput
                  type="text"
                  value={value.comment || ""}
                  onChange={(e) => handleAutoSave({ ...value, comment: e.target.value })}
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
function IndicatorsListDemo({ selectedIndicator, onSelectIndicator }) {
  const indicatorsCategories = [
    {
      categorie: "Aires de livraisons",
      sous_categories: []
    },
    {
      categorie: "Cyclologistique",
      sous_categories: []
    },
    {
      categorie: "Données de base",
      sous_categories: []
    },
    {
      categorie: "Données de production/consommation d'énergie",
      sous_categories: []
    },
    {
      categorie: "Déplacements de particuliers",
      sous_categories: ["Parts modales par mode de déplacement pour les déplacements locaux"]
    },
    {
      categorie: "E-commerce",
      sous_categories: []
    },
    {
      categorie: "Espaces de Logistique Urbains",
      sous_categories: [
        "PL Diesel <=7.5t (Crit'Air 2)",
        "PL Diesel <=7.5t (Crit'Air 3)",
        "PL Diesel <=7.5t (Crit'Air 4)",
        "PL Diesel <=7.5t (Crit'Air 5)",
        "PL Diesel >14-20t (Crit'Air 2)",
        "PL Diesel >14-20t (Crit'Air 3)",
        "PL Diesel >14-20t (Crit'Air 4)",
        "PL Diesel >14-20t (Crit'Air 5)",
        "PL Diesel >20-26t (Crit'Air 2)",
        "PL Diesel >20-26t (Crit'Air 3)",
        "PL Diesel >20-26t (Crit'Air 4)",
        "PL Diesel >20-26t (Crit'Air 5)",
        "PL Diesel >28-34t (Crit'Air 2)",
        "PL Diesel >28-34t (Crit'Air 3)",
        "PL Diesel >28-34t (Crit'Air 4)",
        "PL Diesel >28-34t (Crit'Air 5)",
        "PL Diesel >34-40t (Crit'Air 2)",
        "PL Diesel >34-40t (Crit'Air 3)",
        "PL Diesel >34-40t (Crit'Air 4)",
        "PL Diesel >34-40t (Crit'Air 5)",
        "PL Diesel >7.5-12t (Crit'Air 2)",
        "PL Diesel >7.5-12t (Crit'Air 3)",
        "PL Diesel >7.5-12t (Crit'Air 4)",
        "PL Diesel >7.5-12t (Crit'Air 5)",
        "PL Electrique <=7.5t (Crit'Air E)",
        "PL Electrique >14-20t (Crit'Air E)",
        "PL Electrique >20-26t (Crit'Air E)",
        "PL Electrique >28-34t (Crit'Air E)",
        "PL Electrique >34-40t (Crit'Air E)",
        "PL Electrique >7.5-12t (Crit'Air E)",
        "PL Gaz (GNC) >14-20t (Crit'Air 1)",
        "PL Gaz (GNC) >14-20t (Crit'Air 2)",
        "PL Gaz (GNC) >20-26t (Crit'Air 1)",
        "PL Gaz (GNC) >20-26t (Crit'Air 2)",
        "PL Gaz (GNC) >28-34t (Crit'Air 1)",
        "PL Gaz (GNC) >28-34t (Crit'Air 2)",
        "VUL Diesel (Crit'Air 2)",
        "VUL Diesel (Crit'Air 3)",
        "VUL Diesel (Crit'Air 4)",
        "VUL Diesel (Crit'Air 5)",
        "VUL Electrique (Crit'Air E)",
        "VUL Essence (Crit'Air 1)",
        "VUL Essence <=3,5t (Crit'Air 2)",
        "VUL Essence <=3,5t (Crit'Air 3)",
        "VUL Gaz (GNC) (Crit'Air 1)"
      ]
    },
    {
      categorie: "Fret ferroviaire",
      sous_categories: []
    },
    {
      categorie: "Fret fluvial",
      sous_categories: ["Catégorie 1"]
    },
    {
      categorie: "Fret routier",
      sous_categories: ["Catégorie 1"]
    },
    {
      categorie: "Livraisons silencieuses en horaires décalé",
      sous_categories: []
    },
    {
      categorie: "Logistique de chantiers",
      sous_categories: [
        "Accès au(x) chantier(s) depuis la plateforme",
        "Accès direct au(x) chantier(s)",
        "Accès à la plateforme logistique",
        "Généralités sur le(s) chantier(s)",
        "PL Diesel <=7.5t (Crit'Air 2)",
        "PL Diesel <=7.5t (Crit'Air 3)",
        "PL Diesel <=7.5t (Crit'Air 4)",
        "PL Diesel <=7.5t (Crit'Air 5)",
        "PL Diesel >14-20t (Crit'Air 2)",
        "PL Diesel >14-20t (Crit'Air 3)",
        "PL Diesel >14-20t (Crit'Air 4)",
        "PL Diesel >14-20t (Crit'Air 5)",
        "PL Diesel >20-26t (Crit'Air 2)",
        "PL Diesel >20-26t (Crit'Air 3)",
        "PL Diesel >20-26t (Crit'Air 4)",
        "PL Diesel >20-26t (Crit'Air 5)",
        "PL Diesel >28-34t (Crit'Air 2)",
        "PL Diesel >28-34t (Crit'Air 3)",
        "PL Diesel >28-34t (Crit'Air 4)",
        "PL Diesel >28-34t (Crit'Air 5)",
        "PL Diesel >34-40t (Crit'Air 2)",
        "PL Diesel >34-40t (Crit'Air 3)",
        "PL Diesel >34-40t (Crit'Air 4)",
        "PL Diesel >34-40t (Crit'Air 5)",
        "PL Diesel >7.5-12t (Crit'Air 2)",
        "PL Diesel >7.5-12t (Crit'Air 3)",
        "PL Diesel >7.5-12t (Crit'Air 4)",
        "PL Diesel >7.5-12t (Crit'Air 5)",
        "PL Electrique <=7.5t (Crit'Air E)",
        "PL Electrique >14-20t (Crit'Air E)",
        "PL Electrique >20-26t (Crit'Air E)",
        "PL Electrique >28-34t (Crit'Air E)",
        "PL Electrique >34-40t (Crit'Air E)",
        "PL Electrique >7.5-12t (Crit'Air E)",
        "PL Gaz (GNC) >14-20t (Crit'Air 1)",
        "PL Gaz (GNC) >14-20t (Crit'Air 2)",
        "PL Gaz (GNC) >20-26t (Crit'Air 1)",
        "PL Gaz (GNC) >20-26t (Crit'Air 2)",
        "PL Gaz (GNC) >28-34t (Crit'Air 1)",
        "PL Gaz (GNC) >28-34t (Crit'Air 2)",
        "VUL Diesel (Crit'Air 2)",
        "VUL Diesel (Crit'Air 3)",
        "VUL Diesel (Crit'Air 4)",
        "VUL Diesel (Crit'Air 5)",
        "VUL Electrique (Crit'Air E)",
        "VUL Essence (Crit'Air 1)",
        "VUL Essence <=3,5t (Crit'Air 2)",
        "VUL Essence <=3,5t (Crit'Air 3)",
        "VUL Gaz (GNC) (Crit'Air 1)"
      ]
    },
    {
      categorie: "Projets urbains immobiliers",
      sous_categories: []
    },
    {
      categorie: "ZFEm",
      sous_categories: []
    }
  ];

  const generateIndicatorName = (categoryName, subCategoryName) => {
    if (!subCategoryName) {
      return `${categoryName} - Indicateur`;
    }
    return `Indicateur ${subCategoryName}`;
  };

  const groupedData = {};
  indicatorsCategories.forEach(cat => {
    const categoryName = cat.categorie;
    const hasSubCategories = cat.sous_categories.length > 0;

    if (!groupedData[categoryName]) {
      groupedData[categoryName] = { subCategories: {}, directIndicators: [] };
    }

    if (hasSubCategories) {
      cat.sous_categories.forEach(subCat => {
        if (!groupedData[categoryName].subCategories[subCat]) {
          groupedData[categoryName].subCategories[subCat] = [];
        }

        const indicatorCount = Math.max(2, Math.min(4, (subCat.length % 5) + 2));
        for (let i = 1; i <= indicatorCount; i++) {
          groupedData[categoryName].subCategories[subCat].push({
            _id: `demo-${categoryName}-${subCat}-${i}`,
            indicator_name: `${generateIndicatorName(categoryName, subCat)} ${i > 1 ? i : ""}`.trim(),
            value: i === 1 && Math.random() > 0.5 ? "Valeur exemple" : null,
            indicator_category_name: categoryName,
            indicator_sub_category_name: subCat
          });
        }
      });
    } else {
      const indicatorCount = 3;
      for (let i = 1; i <= indicatorCount; i++) {
        groupedData[categoryName].directIndicators.push({
          _id: `demo-${categoryName}-direct-${i}`,
          indicator_name: `${generateIndicatorName(categoryName, null)} ${i > 1 ? i : ""}`.trim(),
          value: i === 1 && Math.random() > 0.5 ? "Valeur exemple" : null,
          indicator_category_name: categoryName,
          indicator_sub_category_name: null
        });
      }
    }
  });

  const [openCategories, setOpenCategories] = useState(new Set());
  const [openSubCategories, setOpenSubCategories] = useState(new Set());

  useEffect(() => {
    const firstCategory = Object.keys(groupedData)[0];
    if (firstCategory) {
      setOpenCategories(new Set([firstCategory]));
      const firstIndicator =
        groupedData[firstCategory].directIndicators[0] ||
        (Object.keys(groupedData[firstCategory].subCategories).length > 0
          ? groupedData[firstCategory].subCategories[Object.keys(groupedData[firstCategory].subCategories)[0]][0]
          : null);
      if (firstIndicator && onSelectIndicator) {
        if (firstIndicator.indicator_sub_category_name) {
          setOpenSubCategories(new Set([`${firstCategory}-${firstIndicator.indicator_sub_category_name}`]));
        }
        onSelectIndicator(firstIndicator);
      }
    }
  }, []);

  const toggleCategory = (categoryName) => {
    const newOpenCategories = new Set(openCategories);
    if (newOpenCategories.has(categoryName)) {
      newOpenCategories.delete(categoryName);
    } else {
      newOpenCategories.add(categoryName);
    }
    setOpenCategories(newOpenCategories);
  };

  const toggleSubCategory = (categoryName, subCategoryName) => {
    const key = `${categoryName}-${subCategoryName}`;
    const newOpenSubCategories = new Set(openSubCategories);
    if (newOpenSubCategories.has(key)) {
      newOpenSubCategories.delete(key);
    } else {
      newOpenSubCategories.add(key);
    }
    setOpenSubCategories(newOpenSubCategories);
  };

  const isCategoryOpen = (categoryName) => openCategories.has(categoryName);
  const isSubCategoryOpen = (categoryName, subCategoryName) => openSubCategories.has(`${categoryName}-${subCategoryName}`);

  return (
    <div className="space-y-1">
      {Object.entries(groupedData).map(([categoryName, categoryData]) => (
        <div key={categoryName}>
          <div className="flex items-center gap-2 p-2 rounded cursor-pointer transition-colors text-sm font-medium hover:bg-gray-50" onClick={() => toggleCategory(categoryName)}>
            {isCategoryOpen(categoryName) ? <FiChevronDown size={16} /> : <FiChevronRight size={16} />}
            <span className="flex-1">{categoryName}</span>
          </div>

          {isCategoryOpen(categoryName) && (
            <div className="ml-4 space-y-1">
              {categoryData.directIndicators.length > 0 && (
                <div className="space-y-1">
                  {categoryData.directIndicators.map(indicator => (
                    <div
                      key={indicator._id}
                      className={`p-2 rounded cursor-pointer transition-colors text-xs ${
                        selectedIndicator?._id === indicator._id ? "bg-secondary-green text-primary-green font-medium" : "hover:bg-gray-50"
                      }`}
                      onClick={() => onSelectIndicator && onSelectIndicator(indicator)}
                    >
                      <span className="mr-2">{indicator.value ? "✓" : "○"}</span>
                      {indicator.indicator_name}
                    </div>
                  ))}
                </div>
              )}

              {Object.entries(categoryData.subCategories).map(([subCategoryName, indicators]) => (
                <div key={subCategoryName}>
                  <div
                    className="flex items-center gap-2 p-2 rounded cursor-pointer transition-colors text-xs hover:bg-gray-50"
                    onClick={() => toggleSubCategory(categoryName, subCategoryName)}
                  >
                    {isSubCategoryOpen(categoryName, subCategoryName) ? <FiChevronDown size={14} /> : <FiChevronRight size={14} />}
                    <span className="flex-1 text-gray-700">{subCategoryName}</span>
                  </div>

                  {isSubCategoryOpen(categoryName, subCategoryName) && (
                    <div className="ml-4 space-y-1">
                      {indicators.map(indicator => (
                        <div
                          key={indicator._id}
                          className={`p-2 rounded cursor-pointer transition-colors text-xs ${
                            selectedIndicator?._id === indicator._id ? "bg-secondary-green text-primary-green font-medium" : "hover:bg-gray-50"
                          }`}
                          onClick={() => onSelectIndicator && onSelectIndicator(indicator)}
                        >
                          <span className="mr-2">{indicator.value ? "✓" : "○"}</span>
                          {indicator.indicator_name}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
