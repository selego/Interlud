import React, { useState, useEffect } from "react";
import { FiChevronDown, FiChevronRight } from "react-icons/fi";
import ProgressCircle from "@/components/ProgressCircle";

const groupIndicatorValuesByCategory = indicatorValues => {
  if (!indicatorValues || indicatorValues.length === 0) return {};
  
  const grouped = indicatorValues
    .sort((a, b) => {
      const nameA = (a.indicator_name || "").toLowerCase();
      const nameB = (b.indicator_name || "").toLowerCase();
      return nameA !== nameB ? nameA.localeCompare(nameB) : (a.indicator_id || "").localeCompare(b.indicator_id || "");
    })
    .reduce((acc, indicatorValue) => {
      const categoryName = indicatorValue.indicator_category_name;
      const subCategoryName = indicatorValue.indicator_sub_category_name;
      
      if (!acc[categoryName]) acc[categoryName] = { subCategories: {}, directIndicatorValues: [] };

      if (subCategoryName) {
        if (!acc[categoryName].subCategories[subCategoryName]) acc[categoryName].subCategories[subCategoryName] = [];
        acc[categoryName].subCategories[subCategoryName].push(indicatorValue);
      }
      if (!subCategoryName) acc[categoryName].directIndicatorValues.push(indicatorValue);
      return acc;
    }, {});

  return grouped;
};

const calculateCompletion = indicatorValues => {
  const filledCount = indicatorValues.filter(indicatorValue => {
    const val = indicatorValue.value?.[indicatorValue.indicator_type];
    if (indicatorValue.indicator_type === 'checkbox') return Array.isArray(val) && val.length > 0;
    return val !== null && val !== undefined && val !== '';
  }).length;
  return Math.round((filledCount / indicatorValues.length) * 100);
};

const getAllCategoryIndicators = categoryData => {
  const allIndicators = [...categoryData.directIndicatorValues];
  for (const subCategoryIndicators of Object.values(categoryData.subCategories)) {
    allIndicators.push(...subCategoryIndicators);
  }
  return allIndicators;
};


export default function IndicatorsList({ indicatorValues, onSelectIndicatorValue}) {
  const [openCategories, setOpenCategories] = useState(new Set());
  const [openSubCategories, setOpenSubCategories] = useState(new Set());
  const [selectedIndicatorValue, setSelectedIndicatorValue] = useState(null);
  const grouped = groupIndicatorValuesByCategory(indicatorValues);

  const toggleSet = (setState, value) => {
    setState(prev => {
      const next = new Set(prev);
      next.has(value) ? next.delete(value) : next.add(value);
      return next;
    });
  };

  return (
    <div className="space-y-1">
      {Object.entries(grouped).map(([categoryName, categoryData]) => {
        return (
          <div key={categoryName}>
            <div
              className="flex items-center gap-2 p-2 rounded cursor-pointer transition-colors text-sm font-medium hover:bg-gray-50"
              onClick={() => toggleSet(setOpenCategories, categoryName)}
            >
              {openCategories.has(categoryName) ? <FiChevronDown size={16} /> : <FiChevronRight size={16} />}
              <span className="flex-1">{categoryName}</span>
              <div className="flex items-center gap-2">
                <ProgressCircle percentage={calculateCompletion(getAllCategoryIndicators(categoryData))} size={20} />
                <span className="text-xs text-gray-500">{calculateCompletion(getAllCategoryIndicators(categoryData))}%</span>
              </div>
            </div>

            {openCategories.has(categoryName) && (
              <div className="ml-4 space-y-1">
                {categoryData.directIndicatorValues.length > 0 && (
                  <div className="space-y-1">
                    {categoryData.directIndicatorValues.map(indicatorValue => {
                      return (
                        <button 
                          key={indicatorValue._id} 
                          className={`text-xs p-2 rounded text-left w-full transition-all ${
                            selectedIndicatorValue?._id === indicatorValue._id   ? 'bg-primary-green text-white font-medium'  : 'text-gray-700 hover:bg-gray-50' }`}
                          onClick={() => {  setSelectedIndicatorValue(indicatorValue); onSelectIndicatorValue(indicatorValue) }}
                        >
                          {indicatorValue.indicator_name}
                        </button>
                      );
                    })}
                  </div>
                )}

                {Object.entries(categoryData.subCategories).map(([subCategoryName, indicatorValues]) => {

                  return (
                    <div key={subCategoryName}>
                      <div
                        className="flex items-center gap-2 p-2 rounded cursor-pointer transition-colors text-xs hover:bg-gray-50"
                        onClick={() => toggleSet(setOpenSubCategories, `${categoryName}-${subCategoryName}`)}
                      >
                        {openSubCategories.has(`${categoryName}-${subCategoryName}`) ? <FiChevronDown size={14} /> : <FiChevronRight size={14} />}
                        <span className="flex-1 text-gray-700">{subCategoryName}</span>
                        <div className="flex items-center gap-2">
                          <ProgressCircle percentage={calculateCompletion(indicatorValues)} size={18} />
                          <span className="text-xs text-gray-500">{calculateCompletion(indicatorValues)}%</span>
                        </div>
                      </div>

                      {openSubCategories.has(`${categoryName}-${subCategoryName}`) && (
                        <div className="ml-4 space-y-1">
                          {indicatorValues.map(indicatorValue => {
                            return (
                              <button 
                                key={indicatorValue._id} 
                                className={`text-xs p-2 rounded text-left w-full transition-all ${
                                  selectedIndicatorValue?._id === indicatorValue._id ? 'bg-primary-green text-white font-medium' : 'text-gray-700 hover:bg-gray-50' }`}
                                onClick={() => { setSelectedIndicatorValue(indicatorValue); onSelectIndicatorValue(indicatorValue) }}
                              >
                                {indicatorValue.indicator_name}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}

    </div>
  );
}