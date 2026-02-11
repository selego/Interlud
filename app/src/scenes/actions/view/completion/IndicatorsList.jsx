import React, { useState } from "react";
import { FiChevronDown, FiChevronRight } from "react-icons/fi";
import ProgressCircle from "@/components/ProgressCircle";

const groupIndicatorValuesByCategory = indicatorValues => {
  if (!indicatorValues || indicatorValues.length === 0) return {};
  const grouped = indicatorValues
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


export default function IndicatorsList({ indicatorValues, onSelectIndicatorValue, selectedCategory, onSelectCategory }) {
  const [openCategories, setOpenCategories] = useState(new Set());
  const grouped = groupIndicatorValuesByCategory(indicatorValues);

  const toggleSet = (setState, value) => {
    setState(prev => {
      const next = new Set(prev);
      next.has(value) ? next.delete(value) : next.add(value);
      return next;
    });
  };

  const isCategoryActive = (categoryName) => selectedCategory?.categoryName === categoryName && !selectedCategory?.subCategoryName;
  const isSubCategoryActive = (categoryName, subCategoryName) => selectedCategory?.categoryName === categoryName && selectedCategory?.subCategoryName === subCategoryName;

  return (
    <div className="space-y-1">
      {Object.entries(grouped).map(([categoryName, categoryData]) => {
        return (
          <div key={categoryName}>
            <div
              className={`flex items-center gap-2 p-2 rounded cursor-pointer transition-colors text-sm font-medium ${isCategoryActive(categoryName) ? 'bg-primary-green/10 border-l-2 border-primary-green' : 'hover:bg-gray-50'}`}
              onClick={() => { toggleSet(setOpenCategories, categoryName); onSelectCategory({ categoryName }) }}
            >
              {Object.keys(categoryData.subCategories).length > 0 ? (openCategories.has(categoryName) ? <FiChevronDown size={16} /> : <FiChevronRight size={16} />) : <span className="w-4" />}
              <span className="flex-1">{categoryName}</span>
              <div className="flex items-center gap-2">
                <ProgressCircle percentage={calculateCompletion(getAllCategoryIndicators(categoryData))} size={20} />
                <span className="text-xs text-gray-500">{calculateCompletion(getAllCategoryIndicators(categoryData))}%</span>
              </div>
            </div>

            {openCategories.has(categoryName) && (
              <div className="ml-4 space-y-1">
                {Object.entries(categoryData.subCategories).map(([subCategoryName, indicatorValues]) => (
                  <div
                    key={subCategoryName}
                    className={`flex items-center gap-2 p-2 rounded cursor-pointer transition-colors text-xs ${isSubCategoryActive(categoryName, subCategoryName) ? 'bg-primary-green/10 border-l-2 border-primary-green' : 'hover:bg-gray-50'}`}
                    onClick={() => onSelectCategory({ categoryName, subCategoryName })}
                  >
                    <span className="flex-1 text-gray-700">{subCategoryName}</span>
                    <div className="flex items-center gap-2">
                      <ProgressCircle percentage={calculateCompletion(indicatorValues)} size={18} />
                      <span className="text-xs text-gray-500">{calculateCompletion(indicatorValues)}%</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}

    </div>
  );
}