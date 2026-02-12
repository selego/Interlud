import React, { useState } from "react"
import { FiChevronDown, FiChevronRight } from "react-icons/fi"
import ProgressCircle from "@/components/ProgressCircle"
import { isIndicatorValueFilled } from "@/utils/indicatorHelpers"

const calculateCompletion = (ivs) => {
  if (!ivs || ivs.length === 0) return 0
  return Math.round((ivs.filter(isIndicatorValueFilled).length / ivs.length) * 100)
}

const getAllCategoryIndicators = (categoryData) => {
  return [...categoryData.directIndicatorValues, ...Object.values(categoryData.subCategories).flat()]
}

export default function IndicatorsList({ displayedIndicatorValues, selectedCategory, onSelectCategory }) {
  const [openCategories, setOpenCategories] = useState(new Set())

  const categoriesGrouped = {}
  for (const iv of displayedIndicatorValues) {
    const cat = iv.indicator_category_name
    const subCat = iv.indicator_sub_category_name
    if (!categoriesGrouped[cat]) categoriesGrouped[cat] = { subCategories: {}, directIndicatorValues: [] }
    if (subCat) {
      if (!categoriesGrouped[cat].subCategories[subCat]) categoriesGrouped[cat].subCategories[subCat] = []
      categoriesGrouped[cat].subCategories[subCat].push(iv)
    } else {
      categoriesGrouped[cat].directIndicatorValues.push(iv)
    }
  }

  const toggleCategory = (name) => {
    setOpenCategories(prev => {
      const next = new Set(prev)
      next.has(name) ? next.delete(name) : next.add(name)
      return next
    })
  }

  const isCategoryActive = (categoryName) => selectedCategory?.categoryName === categoryName && !selectedCategory?.subCategoryName
  const isSubCategoryActive = (categoryName, subCategoryName) => selectedCategory?.categoryName === categoryName && selectedCategory?.subCategoryName === subCategoryName

  return (
    <div className="space-y-1">
      {Object.entries(categoriesGrouped).map(([categoryName, categoryData]) => {
        return (
          <div key={categoryName}>
            <div
              className={`flex items-center gap-2 p-2 rounded cursor-pointer transition-colors text-sm font-medium ${isCategoryActive(categoryName) ? 'bg-primary-green/10 border-l-2 border-primary-green' : 'hover:bg-gray-50'}`}
              onClick={() => { toggleCategory(categoryName); onSelectCategory({ categoryName }) }}
            >
              {Object.keys(categoryData.subCategories).length > 0 ? (
                openCategories.has(categoryName) ? <FiChevronDown size={16} /> : <FiChevronRight size={16} />
              ) : <span className="w-4" />}
              <span className="flex-1">{categoryName}</span>
              <div className="flex items-center gap-2">
                <ProgressCircle percentage={calculateCompletion(getAllCategoryIndicators(categoryData))} size={20} />
                <span className="text-xs text-gray-500">{calculateCompletion(getAllCategoryIndicators(categoryData))}%</span>
              </div>
            </div>

            {openCategories.has(categoryName) && (
              <div className="ml-4 space-y-1">
                {Object.entries(categoryData.subCategories).map(([subCategoryName, subIndicators]) => (
                  <div
                    key={subCategoryName}
                    className={`flex items-center gap-2 p-2 rounded cursor-pointer transition-colors text-xs ${
                      isSubCategoryActive(categoryName, subCategoryName) ? 'bg-primary-green/10 border-l-2 border-primary-green' : 'hover:bg-gray-50'
                    }`}
                    onClick={() => onSelectCategory({ categoryName, subCategoryName })}
                  >
                    <span className="flex-1 text-gray-700">{subCategoryName}</span>
                    <div className="flex items-center gap-2">
                      <ProgressCircle percentage={calculateCompletion(subIndicators)} size={18} />
                      <span className="text-xs text-gray-500">{calculateCompletion(subIndicators)}%</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
