import React, { useState, useEffect } from "react";
import { FiChevronDown, FiChevronRight } from "react-icons/fi";
import ProgressCircle from "@/components/ProgressCircle";
import { groupIndicatorsByCategory, calculateCompletion, findFirstIndicator } from "./utils";
import { HiCheck } from "react-icons/hi";

export default function IndicatorsList({ allIndicators, selectedIndicator, onSelectIndicator }) {
  const [openCategories, setOpenCategories] = useState(new Set());
  const [openSubCategories, setOpenSubCategories] = useState(new Set());

  const { grouped, uncategorized } = groupIndicatorsByCategory(allIndicators);

  useEffect(() => {
    if (!allIndicators || allIndicators.length === 0) return;

    const hasSelectedIndicator = selectedIndicator && allIndicators.some(ind => ind._id === selectedIndicator._id);
    if (hasSelectedIndicator) return;

    const firstIndicator = findFirstIndicator(grouped, uncategorized);
    if (firstIndicator) {
      onSelectIndicator(firstIndicator);

      const categoryName = firstIndicator.indicator_category_name;
      if (categoryName) {
        setOpenCategories(new Set([categoryName]));

        const subCategoryName = firstIndicator.indicator_sub_category_name;
        if (subCategoryName) {
          setOpenSubCategories(new Set([`${categoryName}-${subCategoryName}`]));
        }
      }
    }
  }, [allIndicators, selectedIndicator]);

  useEffect(() => {
    if (!selectedIndicator) return;

    const categoryName = selectedIndicator.indicator_category_name;
    if (!categoryName) return;

    setOpenCategories(prev => {
      if (prev.has(categoryName)) return prev;
      return new Set([...prev, categoryName]);
    });

    const subCategoryName = selectedIndicator.indicator_sub_category_name;
    if (subCategoryName) {
      const key = `${categoryName}-${subCategoryName}`;
      setOpenSubCategories(prev => {
        if (prev.has(key)) return prev;
        return new Set([...prev, key]);
      });
    }
  }, [selectedIndicator]);

  const toggleSet = (setState, value) => {
    setState(prev => {
      const next = new Set(prev);
      if (next.has(value)) {
        next.delete(value);
      } else {
        next.add(value);
      }
      return next;
    });
  };

  const toggleCategory = (categoryName) => {
    toggleSet(setOpenCategories, categoryName);
  };

  const toggleSubCategory = (categoryName, subCategoryName) => {
    const key = `${categoryName}-${subCategoryName}`;
    toggleSet(setOpenSubCategories, key);
  };

  const isCategoryOpen = (categoryName) => {
    return openCategories.has(categoryName);
  };

  const isSubCategoryOpen = (categoryName, subCategoryName) => {
    return openSubCategories.has(`${categoryName}-${subCategoryName}`);
  };

  return (
    <div className="space-y-1">
      {Object.entries(grouped).map(([categoryName, categoryData]) => {
        const allCategoryIndicators = [
          ...categoryData.directIndicators,
          ...Object.values(categoryData.subCategories).flat()
        ];
        const categoryCompletion = calculateCompletion(allCategoryIndicators);

        return (
          <div key={categoryName}>
            <div
              className="flex items-center gap-2 p-2 rounded cursor-pointer transition-colors text-sm font-medium hover:bg-gray-50"
              onClick={() => toggleCategory(categoryName)}
            >
              {isCategoryOpen(categoryName) ? <FiChevronDown size={16} /> : <FiChevronRight size={16} />}
              <span className="flex-1">{categoryName}</span>
              <div className="flex items-center gap-2">
                <ProgressCircle percentage={categoryCompletion} size={20} />
                <span className="text-xs text-gray-500">{categoryCompletion}%</span>
              </div>
            </div>

            {isCategoryOpen(categoryName) && (
              <div className="ml-4 space-y-1">
                {categoryData.directIndicators.length > 0 && (
                  <div className="space-y-1">
                    {categoryData.directIndicators.map(indicator => (
                      <IndicatorItem
                        key={indicator._id}
                        indicator={indicator}
                        isSelected={selectedIndicator?._id === indicator._id}
                        onClick={() => onSelectIndicator(indicator)}
                      />
                    ))}
                  </div>
                )}

                {Object.entries(categoryData.subCategories).map(([subCategoryName, indicators]) => {
                  const subCategoryCompletion = calculateCompletion(indicators);

                  return (
                    <div key={subCategoryName}>
                      <div
                        className="flex items-center gap-2 p-2 rounded cursor-pointer transition-colors text-xs hover:bg-gray-50"
                        onClick={() => toggleSubCategory(categoryName, subCategoryName)}
                      >
                        {isSubCategoryOpen(categoryName, subCategoryName) ? <FiChevronDown size={14} /> : <FiChevronRight size={14} />}
                        <span className="flex-1 text-gray-700">{subCategoryName}</span>
                        <div className="flex items-center gap-2">
                          <ProgressCircle percentage={subCategoryCompletion} size={18} />
                          <span className="text-xs text-gray-500">{subCategoryCompletion}%</span>
                        </div>
                      </div>

                      {isSubCategoryOpen(categoryName, subCategoryName) && (
                        <div className="ml-4 space-y-1">
                          {indicators.map(indicator => (
                            <IndicatorItem
                              key={indicator._id}
                              indicator={indicator}
                              isSelected={selectedIndicator?._id === indicator._id}
                              onClick={() => onSelectIndicator(indicator)}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {uncategorized.length > 0 && (
        <div className="space-y-1 mt-4">
          {uncategorized.map(indicator => (
            <IndicatorItem
              key={indicator._id}
              indicator={indicator}
              isSelected={selectedIndicator?._id === indicator._id}
              onClick={() => onSelectIndicator(indicator)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function IndicatorItem({ indicator, isSelected, onClick }) {
  const hasValue = indicator.value !== null && indicator.value !== "";

  return (
    <div
      className={`p-2 rounded cursor-pointer transition-colors text-xs ${
        isSelected ? "bg-secondary-green text-primary-green font-medium" : "hover:bg-gray-50"
      }`}
      onClick={onClick}
    >
      <div className="flex items-center gap-2">
        {hasValue ? (
          <HiCheck size={12} className="text-primary-green" />
        ) : (
          <span className="mr-2">○</span>
        )}
        {indicator.indicator_name}
      </div>
    </div>
  );
}