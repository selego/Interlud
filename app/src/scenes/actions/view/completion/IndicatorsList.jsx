import React, { useState, useEffect } from "react";
import { FiChevronDown, FiChevronRight } from "react-icons/fi";
import ProgressCircle from "@/components/ProgressCircle";
import { HiCheck } from "react-icons/hi";

const groupIndicatorsByCategory = indicators => {
  const grouped = {}
  const uncategorized = []

  indicators.forEach(indicator => {
    const categoryName = indicator.indicator_category_name

    if (!categoryName) {
      uncategorized.push(indicator)
      return
    }

    if (!grouped[categoryName]) {
      grouped[categoryName] = {
        subCategories: {},
        directIndicators: []
      }
    }

    const category = grouped[categoryName]
    const subCategoryName = indicator.indicator_sub_category_name

    if (subCategoryName) {
      if (!category.subCategories[subCategoryName]) {
        category.subCategories[subCategoryName] = []
      }
      category.subCategories[subCategoryName].push(indicator)
    } else {
      category.directIndicators.push(indicator)
    }
  })

  return { grouped, uncategorized }
}

const calculateCompletion = indicators => {
  if (indicators.length === 0) return 0
  const filledCount = indicators.filter(ind => ind.value !== null && ind.value !== "").length
  return Math.round((filledCount / indicators.length) * 100)
}

const findFirstIndicator = (groupedData, uncategorized) => {
  const firstCategory = Object.keys(groupedData)[0]
  if (firstCategory) {
    const category = groupedData[firstCategory]

    if (category.directIndicators.length > 0) {
      return category.directIndicators[0]
    }

    const firstSubCategory = Object.keys(category.subCategories)[0]
    if (firstSubCategory && category.subCategories[firstSubCategory].length > 0) {
      return category.subCategories[firstSubCategory][0]
    }
  }

  if (uncategorized.length > 0) {
    return uncategorized[0]
  }

  return null
}

export default function IndicatorsList({ allIndicators, selectedIndicator, onSelectIndicator }) {
  const [openCategories, setOpenCategories] = useState(new Set());
  const [openSubCategories, setOpenSubCategories] = useState(new Set());

  const { grouped, uncategorized } = groupIndicatorsByCategory(allIndicators);

  useEffect(() => {
    if (!allIndicators || allIndicators.length === 0) return;

    const hasSelectedIndicator = selectedIndicator && allIndicators.some(
      ind => ind._id === selectedIndicator._id || ind.indicator_id === selectedIndicator.indicator_id
    );
    if (hasSelectedIndicator) return;

    const firstIndicator = findFirstIndicator(grouped, uncategorized);
    if (!firstIndicator) return;

    onSelectIndicator(firstIndicator);

    const categoryName = firstIndicator.indicator_category_name;
    if (!categoryName) return;

    setOpenCategories(new Set([categoryName]));

    const subCategoryName = firstIndicator.indicator_sub_category_name;
    if (subCategoryName) {
      setOpenSubCategories(new Set([`${categoryName}-${subCategoryName}`]));
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
    if (!subCategoryName) return;
    const key = `${categoryName}-${subCategoryName}`;
    setOpenSubCategories(prev => {
      if (prev.has(key)) return prev;
      return new Set([...prev, key]);
    });
  }, [selectedIndicator]);

  const toggleSet = (setState, value) => {
    setState(prev => {
      const next = new Set(prev);
      next.has(value) ? next.delete(value) : next.add(value);
      return next;
    });
  };

  const toggleCategory = (categoryName, categoryData) => {
    toggleSet(setOpenCategories, categoryName);
    
    const firstIndicator = categoryData.directIndicators.length > 0
      ? categoryData.directIndicators[0]
      : (() => {
          const firstSubCategory = Object.keys(categoryData.subCategories)[0];
          if (firstSubCategory && categoryData.subCategories[firstSubCategory].length > 0) {
            return categoryData.subCategories[firstSubCategory][0];
          }
          return null;
        })();
    
    if (!firstIndicator) return;
    onSelectIndicator(firstIndicator);
  };

  const toggleSubCategory = (categoryName, subCategoryName, indicators) => {
    const key = `${categoryName}-${subCategoryName}`;
    toggleSet(setOpenSubCategories, key);
    
    if (indicators && indicators.length > 0) {
      onSelectIndicator(indicators[0]);
    }
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
              onClick={() => toggleCategory(categoryName, categoryData)}
            >
              {openCategories.has(categoryName) ? <FiChevronDown size={16} /> : <FiChevronRight size={16} />}
              <span className="flex-1">{categoryName}</span>
              <div className="flex items-center gap-2">
                <ProgressCircle percentage={categoryCompletion} size={20} />
                <span className="text-xs text-gray-500">{categoryCompletion}%</span>
              </div>
            </div>

            {openCategories.has(categoryName) && (
              <div className="ml-4 space-y-1">
                {categoryData.directIndicators.length > 0 && (
                  <div className="space-y-1">
                    {categoryData.directIndicators.map(indicator => (
                      <IndicatorItem key={indicator._id} indicator={indicator} isSelected={selectedIndicator?._id === indicator._id} onClick={() => onSelectIndicator(indicator)} />
                    ))}
                  </div>
                )}

                {Object.entries(categoryData.subCategories).map(([subCategoryName, indicators]) => {
                  const subCategoryCompletion = calculateCompletion(indicators)

                  return (
                    <div key={subCategoryName}>
                      <div
                        className="flex items-center gap-2 p-2 rounded cursor-pointer transition-colors text-xs hover:bg-gray-50"
                        onClick={() => toggleSubCategory(categoryName, subCategoryName, indicators)}
                      >
                        {openSubCategories.has(`${categoryName}-${subCategoryName}`) ? <FiChevronDown size={14} /> : <FiChevronRight size={14} />}
                        <span className="flex-1 text-gray-700">{subCategoryName}</span>
                        <div className="flex items-center gap-2">
                          <ProgressCircle percentage={subCategoryCompletion} size={18} />
                          <span className="text-xs text-gray-500">{subCategoryCompletion}%</span>
                        </div>
                      </div>

                      {openSubCategories.has(`${categoryName}-${subCategoryName}`) && (
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
                  )
                })}
              </div>
            )}
          </div>
        )
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