import React, { useState } from "react"
import { FiChevronDown, FiChevronRight } from "react-icons/fi"
import { isIndicatorValueFilled } from "@/utils/indicatorHelpers"

const countRemaining = (ivs) => ivs.filter((iv) => !isIndicatorValueFilled(iv)).length

const getAllCategoryIndicators = (categoryData) => {
  return [...categoryData.directIndicatorValues, ...Object.values(categoryData.subCategories).flat()]
}

function RemainingLabel({ indicatorValues }) {
  return (
    <span className={`text-xs font-semibold whitespace-nowrap ${countRemaining(indicatorValues) > 0 ? "text-[#5b6b66]" : "text-[#b3beba]"}`}>
      {countRemaining(indicatorValues) > 0 ? `${countRemaining(indicatorValues)} à remplir` : "À jour"}
    </span>
  )
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
    <div className="space-y-0.5">
      {Object.entries(categoriesGrouped).map(([categoryName, categoryData]) => {
        return (
          <div key={categoryName}>
            <div
              className={`flex items-center justify-between gap-2.5 px-2.5 py-[11px] rounded-[9px] cursor-pointer transition-colors ${isCategoryActive(categoryName) ? 'bg-[#F1F4F3]' : 'hover:bg-gray-50'}`}
              onClick={() => { toggleCategory(categoryName); onSelectCategory({ categoryName }) }}
            >
              <div className="flex items-center gap-1.5 min-w-0">
                {Object.keys(categoryData.subCategories).length > 0 ? (
                  openCategories.has(categoryName) ? <FiChevronDown size={14} className="shrink-0 text-[#768776]" /> : <FiChevronRight size={14} className="shrink-0 text-[#768776]" />
                ) : null}
                <span className="text-[13.5px] font-semibold text-[#123314] leading-tight">{categoryName}</span>
              </div>
              <RemainingLabel indicatorValues={getAllCategoryIndicators(categoryData)} />
            </div>

            {openCategories.has(categoryName) && (
              <div className="ml-4 space-y-0.5">
                {Object.entries(categoryData.subCategories).map(([subCategoryName, subIndicators]) => (
                  <div
                    key={subCategoryName}
                    className={`flex items-center justify-between gap-2.5 px-2.5 py-2 rounded-[9px] cursor-pointer transition-colors ${
                      isSubCategoryActive(categoryName, subCategoryName) ? 'bg-[#F1F4F3]' : 'hover:bg-gray-50'
                    }`}
                    onClick={() => onSelectCategory({ categoryName, subCategoryName })}
                  >
                    <span className="text-xs text-gray-700 leading-tight">{subCategoryName}</span>
                    <RemainingLabel indicatorValues={subIndicators} />
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
