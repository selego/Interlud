import React, { useState } from "react"
import { FiStar } from "react-icons/fi"
import { isIndicatorValueFilled } from "@/utils/indicatorHelpers"
import IndicatorValueInput from "./IndicatorValueInput"
import Loader from "@/components/loader"

// Mapping état → style (palette de marque Interlud)
const STATE_STYLES = {
  prio: {
    accent: "#F59600",
    tagText: "Primordiale",
    tagBg: "#FFF3E0",
    tagColor: "#B45309",
    inputClass: "!border-[1.5px] !border-[#F59600] !bg-[#FFFBF5] placeholder:!text-[#C2410C]",
    cardShadow: "0 4px 16px rgba(245,150,0,.16)"
  },
  todo: {
    accent: "#56BDB8",
    tagText: "À remplir",
    tagBg: "#D2EDEC",
    tagColor: "#0A6B66",
    inputClass: "!border-[1.5px] !border-[#56BDB8] !bg-[#F5FBFB] placeholder:!text-[#0A6B66]",
    cardShadow: "0 1px 3px rgba(10,54,65,.06)"
  },
  done: {
    accent: "#2DAC6A",
    tagText: "Rempli",
    tagBg: "#D9EFE3",
    tagColor: "#1B7A47",
    inputClass: "!border-[#e1e5e8] !bg-white",
    cardShadow: "0 1px 2px rgba(10,54,65,.05)"
  }
}

export default function SituationTab({ displayedIndicatorValues, selectedCategory, economicActorData, onSave, isViewLoading }) {
  const [doneCollapsed, setDoneCollapsed] = useState(true)

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

  // Regroupement basé sur l'état au chargement : un indicateur rempli en cours de session reste visible dans sa section
  const groupPrio = filteredValues.filter(iv => !iv.initially_filled && iv.is_primordial)
  const groupTodo = filteredValues.filter(iv => !iv.initially_filled && !iv.is_primordial)
  const groupDone = filteredValues.filter(iv => iv.initially_filled)

  if (filteredValues.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-gray-400">
        <svg className="w-12 h-12 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <p className="text-sm font-medium">Aucun indicateur pour cette catégorie</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-[26px]">
      {groupPrio.length > 0 && (
        <div>
          <div className="flex items-center gap-2.5 mb-3">
            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-[#FFF3E0] text-[#F59600] text-[13px]">
              <FiStar className="w-3.5 h-3.5 fill-[#F59600] stroke-[#F59600]" />
            </span>
            <h3 className="text-base font-bold text-[#B45309] m-0">À remplir en priorité</h3>
            <span className="text-xs font-semibold px-2.5 py-[3px] rounded-full bg-[#FFF3E0] text-[#B45309]">{groupPrio.length} restant(s)</span>
          </div>
          <div className="bg-[#FFFBF5] border border-[#FCE6C8] rounded-[14px] px-[13px] pt-[11px] pb-[13px] flex flex-col gap-[11px]">
            <p className="text-[12.5px] text-[#9a6a1f] m-0 leading-relaxed">Fort impact sur le calcul des gains — à renseigner manuellement.</p>
            {groupPrio.map(iv => (
              <IndicatorCard key={iv._id} indicatorValue={iv} economicActorValues={economicActorData[iv.indicator_id] || []} onSave={onSave} />
            ))}
          </div>
        </div>
      )}

      {groupTodo.length > 0 && (
        <div>
          <div className="flex items-center gap-2.5 mb-3">
            <span className="w-[13px] h-[13px] rounded-full bg-[#56BDB8]" />
            <h3 className="text-base font-bold text-[#0A6B66] m-0">À compléter</h3>
            <span className="text-xs font-semibold px-2.5 py-[3px] rounded-full bg-[#D2EDEC] text-[#0A6B66]">{groupTodo.length}</span>
          </div>
          <div className="flex flex-col gap-[11px]">
            {groupTodo.map(iv => (
              <IndicatorCard key={iv._id} indicatorValue={iv} economicActorValues={economicActorData[iv.indicator_id] || []} onSave={onSave} />
            ))}
          </div>
        </div>
      )}

      {groupDone.length > 0 && (
        <div>
          <div onClick={() => setDoneCollapsed(prev => !prev)} className="flex items-center gap-2.5 mb-3 cursor-pointer">
            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-[#D9EFE3] text-[#2DAC6A] text-xs font-bold">✓</span>
            <h3 className="text-base font-bold text-[#1B7A47] m-0">Déjà renseignés</h3>
            <span className="text-xs font-semibold px-2.5 py-[3px] rounded-full bg-[#D9EFE3] text-[#1B7A47]">{groupDone.length}</span>
            <span className="text-[13px] font-semibold text-[#768776]">{doneCollapsed ? "Afficher ▾" : "Masquer ▴"}</span>
          </div>
          {!doneCollapsed && (
            <div className="flex flex-col gap-[11px]">
              {groupDone.map(iv => (
                <IndicatorCard key={iv._id} indicatorValue={iv} economicActorValues={economicActorData[iv.indicator_id] || []} onSave={onSave} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function IndicatorCard({ indicatorValue, economicActorValues, onSave }) {
  const filled = isIndicatorValueFilled(indicatorValue)
  const stateStyle = STATE_STYLES[filled ? "done" : indicatorValue.is_primordial ? "prio" : "todo"]

  const filledEAValues = economicActorValues.filter(isIndicatorValueFilled)
  let aggregatedValue = null
  if (filledEAValues.length >= 3 && indicatorValue.indicator_type === 'number') {
    const numbers = filledEAValues.map(iv => iv.value?.number).filter(n => n !== null && n !== undefined)
    if (numbers.length > 0) aggregatedValue = indicatorValue.indicator_value_unit === '%' ? numbers.reduce((a, b) => a + b, 0) / numbers.length : numbers.reduce((a, b) => a + b, 0)
  }

  return (
    <div
      id={`indicator-${indicatorValue._id}`}
      className="bg-white rounded-xl border border-[#eef1f0] px-[18px] py-4 transition-all"
      style={{ borderLeft: `4px solid ${stateStyle.accent}`, boxShadow: stateStyle.cardShadow }}
    >
      <div className="flex items-center gap-2.5 mb-3.5">
        <span className="w-[9px] h-[9px] rounded-full shrink-0" style={{ background: stateStyle.accent }} />
        <h3 className="text-[15px] font-bold text-[#123314] m-0 leading-tight">{indicatorValue.indicator_name}</h3>
        {indicatorValue.indicator_description && <Tooltip content={indicatorValue.indicator_description} />}
        {indicatorValue.is_primordial && (
          <Tooltip content="Indicateur primordial : il a un fort impact sur le calcul des gains, à renseigner manuellement en priorité.">
            <FiStar className="w-3.5 h-3.5 fill-[#F59600] stroke-[#F59600] cursor-help" />
          </Tooltip>
        )}
        <span
          className="ml-auto inline-flex items-center text-[11.5px] font-semibold px-[11px] py-1 rounded-full whitespace-nowrap"
          style={{ background: stateStyle.tagBg, color: stateStyle.tagColor }}
        >
          {stateStyle.tagText}
        </span>
      </div>

      <div className="grid grid-cols-[1.3fr_1fr_1fr] gap-6">
        <div className="flex flex-col">
          <label className="block text-[10.5px] font-semibold uppercase tracking-wider text-[#9aa8a4] mb-2">Valeur</label>
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <IndicatorValueInput
                value={indicatorValue.value?.[indicatorValue.indicator_type]}
                indicatorType={indicatorValue.indicator_type}
                options={indicatorValue.indicator_value_possibilities}
                onChange={newValue => onSave({ ...indicatorValue, value: { [indicatorValue.indicator_type]: newValue } })}
                className={`w-full ${stateStyle.inputClass}`}
              />
            </div>
            {indicatorValue.indicator_value_unit && <span className="text-xs text-[#768776] whitespace-nowrap">{indicatorValue.indicator_value_unit}</span>}
          </div>
        </div>

        <div className="flex flex-col">
          <label className="block text-[10.5px] font-semibold uppercase tracking-wider text-[#9aa8a4] mb-2">Valeur par défaut</label>
          <div className="flex items-center gap-2 min-h-[38px]">
            {indicatorValue.value_default?.[indicatorValue.indicator_type] == null ? (
              <p className="text-[13px] text-[#5b6b66]">Aucune valeur par défaut</p>
            ) : (
              <>
                <p className="text-[13px] text-[#5b6b66] truncate max-w-[20em]" title={Array.isArray(indicatorValue.value_default[indicatorValue.indicator_type]) ? indicatorValue.value_default[indicatorValue.indicator_type].join(', ') : indicatorValue.value_default[indicatorValue.indicator_type]}>
                  {Array.isArray(indicatorValue.value_default[indicatorValue.indicator_type]) ? indicatorValue.value_default[indicatorValue.indicator_type].join(', ') : indicatorValue.value_default[indicatorValue.indicator_type]}
                </p>
                <Tooltip content="Appliquer cette valeur">
                  <button
                    onClick={() => onSave({ ...indicatorValue, value: { [indicatorValue.indicator_type]: indicatorValue.value_default[indicatorValue.indicator_type] } })}
                    className="inline-flex items-center justify-center w-[26px] h-[26px] rounded-lg bg-[#D9EFE3] text-[#2DAC6A] hover:bg-[#c4e5d4] transition-colors shrink-0"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                    </svg>
                  </button>
                </Tooltip>
              </>
            )}
          </div>
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
        <label className="block text-[10.5px] font-semibold uppercase tracking-wider text-[#9aa8a4]">Acteurs économiques</label>
        {filledEAValues.length >= 3 ? (
          <Tooltip content={`Valeur agrégée de ${filledEAValues.length} acteur${filledEAValues.length > 1 ? 's' : ''} économique${filledEAValues.length > 1 ? 's' : ''}`} />
        ) : (
          <Tooltip content="Pour respecter la confidentialité des acteurs, la valeur n'est affichée que si au moins 3 acteurs ont rempli l'indicateur" />
        )}
      </div>
      <div className="flex items-center gap-2 min-h-[38px]">
        <p className="text-[13px] text-[#123314] font-semibold">{aggregatedValue ?? '—'}</p>
        {filledEAValues.length >= 3 && aggregatedValue != null && (
          <Tooltip content="Appliquer cette valeur">
            <button
              onClick={() => onApplyValue(aggregatedValue)}
              className="inline-flex items-center justify-center w-[26px] h-[26px] rounded-lg bg-[#D9EFE3] text-[#2DAC6A] hover:bg-[#c4e5d4] transition-colors shrink-0"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
              </svg>
            </button>
          </Tooltip>
        )}
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
