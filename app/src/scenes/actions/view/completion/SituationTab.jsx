import React, { useState } from "react"
import { FiStar } from "react-icons/fi"
import { isIndicatorValueFilled } from "@/utils/indicatorHelpers"
import IndicatorValueInput from "./IndicatorValueInput"
import Loader from "@/components/loader"

const SITUATION_LABELS = { init: 'Initiale', ref: 'Référence', prev: 'Prévisionnel', expost: 'Ex-post' }

export default function SituationTab({ displayedIndicatorValues, selectedCategory, activeSituation, economicActorData, onSave, isViewLoading }) {
  if (isViewLoading) {
    return (
      <div className="card-shadow rounded-2xl p-6 flex items-center justify-center py-20">
        <Loader size="small" />
      </div>
    )
  }

  let filteredValues = displayedIndicatorValues
  if (selectedCategory) {
    if (selectedCategory.subCategoryName) {
      filteredValues = filteredValues.filter(iv => iv.indicator_category_name === selectedCategory.categoryName && iv.indicator_sub_category_name === selectedCategory.subCategoryName)
    } else {
      filteredValues = filteredValues.filter(iv => iv.indicator_category_name === selectedCategory.categoryName && !iv.indicator_sub_category_name)
    }
  }

  // Stable sort: primordiaux first within the filtered list
  filteredValues = [...filteredValues].sort((a, b) => (b.is_primordial ? 1 : 0) - (a.is_primordial ? 1 : 0))

  return (
    <div className="card-shadow rounded-2xl p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="font-bold text-font-primary text-lg">
          {selectedCategory?.subCategoryName || selectedCategory?.categoryName || (activeSituation ? SITUATION_LABELS[activeSituation] : '')}
        </h2>
      </div>

      <div className="space-y-4">
        {filteredValues.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-gray-400">
            <svg className="w-12 h-12 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-sm font-medium">Aucun indicateur pour cette catégorie</p>
          </div>
        )}

        {filteredValues.map(iv => (
          <IndicatorCard
            key={iv._id}
            indicatorValue={iv}
            economicActorValues={economicActorData[iv.indicator_id] || []}
            onSave={onSave}
          />
        ))}
      </div>
    </div>
  )
}

function IndicatorCard({ indicatorValue, economicActorValues, onSave }) {
  const filledEAValues = economicActorValues.filter(isIndicatorValueFilled)
  let aggregatedValue = null
  if (filledEAValues.length >= 3 && indicatorValue.indicator_type === 'number') {
    const numbers = filledEAValues.map(iv => iv.value?.number).filter(n => n !== null && n !== undefined)
    if (numbers.length > 0) aggregatedValue = indicatorValue.indicator_value_unit === '%' ? numbers.reduce((a, b) => a + b, 0) / numbers.length : numbers.reduce((a, b) => a + b, 0)
  }

  return (
    <div
      id={`indicator-${indicatorValue._id}`}
      className="bg-white p-4 rounded-lg border border-gray-200 transition-all"
    >
      <div className="flex items-center gap-2 mb-4">
        <h3 className="font-medium text-gray-900">{indicatorValue.indicator_name}</h3>
        {indicatorValue.indicator_description && <Tooltip content={indicatorValue.indicator_description} />}
        {indicatorValue.is_primordial && (
          <Tooltip content="Indicateur primordial : il a un fort impact sur le calcul des gains, à renseigner manuellement en priorité.">
            <FiStar className="w-3.5 h-3.5 fill-amber-400 stroke-amber-500 cursor-help" />
          </Tooltip>
        )}
      </div>

      <div className="grid grid-cols-[2fr_2fr_2fr] gap-x-6 gap-y-4">
        <div className="flex flex-col">
          <label className="block text-xs font-medium text-gray-600 mb-2">Valeur</label>
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <IndicatorValueInput
                value={indicatorValue.value?.[indicatorValue.indicator_type]}
                indicatorType={indicatorValue.indicator_type}
                options={indicatorValue.indicator_value_possibilities}
                onChange={newValue => onSave({ ...indicatorValue, value: { [indicatorValue.indicator_type]: newValue } })}
                className="w-full"
              />
            </div>
            {indicatorValue.indicator_value_unit && <span className="text-xs text-gray-500 whitespace-nowrap">{indicatorValue.indicator_value_unit}</span>}
          </div>
        </div>

        <div className="flex flex-col">
          <div className="flex items-center gap-2 mb-2">
            <label className="block text-xs font-medium text-gray-600">Valeur par défaut</label>
            {indicatorValue.value_default?.[indicatorValue.indicator_type] != null && (
              <Tooltip content="Appliquer cette valeur">
                <button
                  onClick={() => onSave({ ...indicatorValue, value: { [indicatorValue.indicator_type]: indicatorValue.value_default[indicatorValue.indicator_type] } })}
                  className="p-1 rounded-lg hover:bg-primary-green/10 text-primary-green transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                  </svg>
                </button>
              </Tooltip>
            )}
          </div>
          {indicatorValue.value_default?.[indicatorValue.indicator_type] == null && <p className="text-gray-600 mt-2">Aucune valeur par défaut</p>}
          {indicatorValue.value_default?.[indicatorValue.indicator_type] != null && (
            <p className="text-gray-600 text-sm truncate max-w-[20em]" title={Array.isArray(indicatorValue.value_default[indicatorValue.indicator_type]) ? indicatorValue.value_default[indicatorValue.indicator_type].join(', ') : indicatorValue.value_default[indicatorValue.indicator_type]}>
              {Array.isArray(indicatorValue.value_default[indicatorValue.indicator_type]) ? indicatorValue.value_default[indicatorValue.indicator_type].join(', ') : indicatorValue.value_default[indicatorValue.indicator_type]}
            </p>
          )}
        </div>

        <EconomicActorValues
          indicatorValue={indicatorValue}
          economicActorData={economicActorValues}
          filledEAValues={filledEAValues}
          aggregatedValue={aggregatedValue}
          onApplyValue={(value) => onSave({ ...indicatorValue, value: { [indicatorValue.indicator_type]: value } })}
        />
      </div>
    </div>
  )
}

function EconomicActorValues({ indicatorValue, filledEAValues, aggregatedValue, onApplyValue }) {
  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2 mb-2">
        <label className="block text-xs font-medium text-gray-600">Valeurs Acteurs économiques</label>
        {filledEAValues.length >= 3 ? (
          <>
            <Tooltip content={`Valeur agrégée de ${filledEAValues.length} acteur${filledEAValues.length > 1 ? 's' : ''} économique${filledEAValues.length > 1 ? 's' : ''}`} />
            <Tooltip content="Appliquer cette valeur">
              <button
                onClick={() => onApplyValue(aggregatedValue)}
                className="p-1 rounded-lg hover:bg-primary-green/10 text-primary-green transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                </svg>
              </button>
            </Tooltip>
          </>
        ) : (
          <Tooltip content="Pour respecter la confidentialité des acteurs, la valeur n'est affichée que si au moins 3 acteurs ont rempli l'indicateur" />
        )}
      </div>
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <p className="text-gray-900 font-medium text-sm">{aggregatedValue ?? 'Pas de valeur'}</p>
        </div>
      </div>
    </div>
  )
}

function Tooltip({ content, children }) {
  const [isVisible, setIsVisible] = useState(false)

  return (
    <div className="relative inline-flex items-center">
      <div onMouseEnter={() => setIsVisible(true)} onMouseLeave={() => setIsVisible(false)} className={children ? "" : "cursor-help"}>
        {children || (
          <svg className="w-4 h-4 text-gray-400 hover:text-gray-600" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
          </svg>
        )}
      </div>
      {isVisible && (
        <div className="absolute z-50 bottom-full right-0 mb-2 px-3 py-2 text-sm text-white bg-gray-900 rounded-lg shadow-lg w-80">
          {content}
          <div className="absolute top-full right-2 -mt-1">
            <div className="border-4 border-transparent border-t-gray-900"></div>
          </div>
        </div>
      )}
    </div>
  )
}
