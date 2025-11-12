export const getDisplayedIndicators = (selectedIndicator, indicators, actionId, activeTab) => {
  if (!selectedIndicator || !actionId || !activeTab) {
    return [];
  }

  const { indicator_category_name: categoryName, indicator_sub_category_name: subCategoryName, indicator_id } = selectedIndicator;

  return indicators.filter(indicator => {
    if (!categoryName) {
      return indicator.indicator_id === indicator_id;
    }

    if (subCategoryName) {
      return indicator.indicator_category_name === categoryName && indicator.indicator_sub_category_name === subCategoryName;
    }

    return indicator.indicator_category_name === categoryName;
  });
};

export const groupIndicatorsByCategory = (indicators) => {
  const grouped = {};
  const uncategorized = [];

  indicators.forEach(indicator => {
    const categoryName = indicator.indicator_category_name;

    if (!categoryName) {
      uncategorized.push(indicator);
      return;
    }

    if (!grouped[categoryName]) {
      grouped[categoryName] = {
        subCategories: {},
        directIndicators: []
      };
    }

    const category = grouped[categoryName];
    const subCategoryName = indicator.indicator_sub_category_name;

    if (subCategoryName) {
      if (!category.subCategories[subCategoryName]) {
        category.subCategories[subCategoryName] = [];
      }
      category.subCategories[subCategoryName].push(indicator);
    } else {
      category.directIndicators.push(indicator);
    }
  });

  return { grouped, uncategorized };
};

export const calculateCompletion = (indicators) => {
  if (indicators.length === 0) return 0;
  const filledCount = indicators.filter(ind => ind.value !== null && ind.value !== "").length;
  return Math.round((filledCount / indicators.length) * 100);
};

export const findFirstIndicator = (groupedData, uncategorized) => {
  const firstCategory = Object.keys(groupedData)[0];
  if (firstCategory) {
    const category = groupedData[firstCategory];
    
    if (category.directIndicators.length > 0) {
      return category.directIndicators[0];
    }
    
    const firstSubCategory = Object.keys(category.subCategories)[0];
    if (firstSubCategory && category.subCategories[firstSubCategory].length > 0) {
      return category.subCategories[firstSubCategory][0];
    }
  }

  if (uncategorized.length > 0) {
    return uncategorized[0];
  }

  return null;
};
