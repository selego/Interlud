export const getDisplayedIndicators = (selectedIndicator, indicators, actionId, activeTab) => {
  if (!selectedIndicator || !actionId || !activeTab) {
    return [];
  }

  const { indicator_category_name: categoryName, indicator_sub_category_name: subCategoryName, indicator_id } = selectedIndicator;

  const filtered = indicators.filter(indicator => {
    if (!categoryName) {
      return indicator.indicator_id === indicator_id;
    }

    if (subCategoryName) {
      return indicator.indicator_category_name === categoryName && indicator.indicator_sub_category_name === subCategoryName;
    }

    return indicator.indicator_category_name === categoryName;
  });

  return filtered.sort((a, b) => {
    const nameA = (a.indicator_name || "").toLowerCase();
    const nameB = (b.indicator_name || "").toLowerCase();
    if (nameA !== nameB) {
      return nameA.localeCompare(nameB);
    }
    return (a.indicator_id || "").localeCompare(b.indicator_id || "");
  });
};

export const groupIndicatorsByCategory = (indicators) => {
  const sortedIndicators = [...indicators].sort((a, b) => {
    const nameA = (a.indicator_name || "").toLowerCase();
    const nameB = (b.indicator_name || "").toLowerCase();
    if (nameA !== nameB) {
      return nameA.localeCompare(nameB);
    }
    return (a.indicator_id || "").localeCompare(b.indicator_id || "");
  });

  const grouped = {};
  const uncategorized = [];

  sortedIndicators.forEach(indicator => {
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

  const sortedGrouped = {};
  Object.keys(grouped)
    .sort((a, b) => a.localeCompare(b))
    .forEach(categoryName => {
      const category = grouped[categoryName];
      
      const sortedSubCategories = {};
      Object.keys(category.subCategories)
        .sort((a, b) => a.localeCompare(b))
        .forEach(subCategoryName => {
          sortedSubCategories[subCategoryName] = category.subCategories[subCategoryName];
        });
      
      sortedGrouped[categoryName] = {
        subCategories: sortedSubCategories,
        directIndicators: category.directIndicators
      };
    });

  const sortedUncategorized = uncategorized;

  return { grouped: sortedGrouped, uncategorized: sortedUncategorized };
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
