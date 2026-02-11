import React, { useState, useEffect } from "react"
import api from "@/services/api"
import toast from "react-hot-toast"
import ProgressCircle from "@/components/ProgressCircle"
import useStore from "@/services/store"
import IndicatorValueInput from "../actions/view/completion/IndicatorValueInput"
import { isIndicatorValueFilled, shouldDisplayIndicator as shouldDisplayIndicatorHelper } from "@/utils/indicatorHelpers"

export default function Onboarding({ collectivity }) {
  const { setCollectivity } = useStore()
  const [indicatorValues, setIndicatorValues] = useState([])
  const [allCollectivityIndicatorValues, setAllCollectivityIndicatorValues] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  
  const fetchIndicatorValues = async () => {
    try {
      setIsLoading(true)
      const { ok, data, code } = await api.post("/indicator_value/search", { collectivity_id: collectivity._id,  action_name: "Données de base", situation: "init",  limit: 10000 })
      if (!ok) return toast.error(code || "Une erreur est survenue")
      setIndicatorValues(data.filter((i) => !["ActionsAutres", "ActionsCharte"].includes(i.indicator_excel_id)))
    } catch (error) {
      toast.error("Une erreur est survenue lors du chargement des indicateurs")
    } finally {
      setIsLoading(false)
    }
  }

  const fetchAllCollectivityIndicatorValues = async () => {
    try {
      const { ok, data, code } = await api.post(`/indicator_value/search`, { collectivity_id: collectivity._id, limit: 10000 })
      if (!ok) return toast.error(code || "Erreur lors du chargement")
      setAllCollectivityIndicatorValues(data)
    } catch (error) {
      toast.error("Une erreur est survenue")
    }
  }

  const shouldDisplayIndicator = (indicatorValue) => shouldDisplayIndicatorHelper(indicatorValue, allCollectivityIndicatorValues)

  const handleSaveIndicatorValue = async (indicatorValue, newValue) => {
    const currentValue = indicatorValue.value?.[indicatorValue.indicator_type]
    if (currentValue === newValue || (JSON.stringify(currentValue) === JSON.stringify(newValue))) return
    try {
      const updatedIndicatorValue = {...indicatorValue, value: { [indicatorValue.indicator_type]: newValue } }
      const { ok, code } = await api.put(`/indicator_value/${indicatorValue._id}`, { source: 'manual', ...updatedIndicatorValue  }) 
      if (!ok) return toast.error(code || "Une erreur est survenue")
      setIndicatorValues(prev => prev.map(iv => iv._id === indicatorValue._id ? updatedIndicatorValue : iv))
      setAllCollectivityIndicatorValues(prev => prev.map(iv => iv._id === indicatorValue._id ? updatedIndicatorValue : iv))
    } catch (error) {
      toast.error("Une erreur est survenue")
    }
  }

  const handleFinish = async () => {
    try {
      setIsSaving(true)
      const { ok, code } = await api.put(`/collectivity/${collectivity._id}`, { is_onboarded: true })
      if (!ok) return toast.error(code || "Une erreur est survenue")
      setCollectivity({ ...collectivity, is_onboarded: true })
      toast.success("Bienvenue sur Interlud !")
    } catch (error) {
      toast.error("Une erreur est survenue")
    } finally {
      setIsSaving(false)
    }
  }

  useEffect(() => {
    if (collectivity) {
      fetchIndicatorValues()
      fetchAllCollectivityIndicatorValues()
    }
  }, [collectivity?._id])

  return (
    <div className="max-w-5xl mx-auto bg-white rounded-2xl shadow-sm border border-gray-100 my-8">
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="p-8 pb-6 border-b border-gray-100 bg-gradient-to-r from-primary-green/5 to-primary-teal/5">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-14 h-14 rounded-2xl bg-primary-green/10 flex items-center justify-center">
              <svg className="w-7 h-7 text-primary-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Bienvenue sur Interlud !</h2>
              <p className="text-gray-600 mt-1">Configurez les données de base de votre collectivité</p>
            </div>
          </div>
          
          <div className="flex items-center gap-4 bg-white rounded-xl p-4 shadow-sm">
            <ProgressCircle percentage={Math.round((indicatorValues.filter(shouldDisplayIndicator).filter(isIndicatorValueFilled).length / indicatorValues.filter(shouldDisplayIndicator).length) * 100)} size={48} strokeWidth={4} />
            <div className="flex-1">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700">Progression</span>
                <span className="text-sm font-bold text-primary-green">{Math.round((indicatorValues.filter(shouldDisplayIndicator).filter(isIndicatorValueFilled).length / indicatorValues.filter(shouldDisplayIndicator).length) * 100)}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-primary-green h-2 rounded-full transition-all duration-500" 
                  style={{ width: `${Math.round((indicatorValues.filter(shouldDisplayIndicator).filter(isIndicatorValueFilled).length / indicatorValues.filter(shouldDisplayIndicator).length) * 100)}%` }}
                />
              </div>
              <p className="text-xs text-gray-500 mt-2">
                {indicatorValues.filter(shouldDisplayIndicator).filter(isIndicatorValueFilled).length} / {indicatorValues.filter(shouldDisplayIndicator).length} indicateurs remplis
              </p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 p-8">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-green"></div>
            </div>
          ) : (
            <div className="space-y-4">
              {indicatorValues
                .filter(shouldDisplayIndicator)
                .map((indicatorValue) => {
                  const isFilled = isIndicatorValueFilled(indicatorValue)
                  
                  return (
                    <div 
                      key={indicatorValue._id}
                      className={`bg-white rounded-xl border-2 p-5 transition-all ${ isFilled  ? 'border-primary-green/30 bg-primary-green/5'  : 'border-gray-200 hover:border-gray-300' }`}
                    >
                      <div className="flex items-start gap-4">
                        <div className={`mt-1 w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${ isFilled ? 'bg-primary-green' : 'bg-gray-200'}`}>
                          {isFilled ? (
                            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                          ) : (
                            <span className="text-xs font-medium text-gray-500">?</span>
                          )}
                        </div>
                        
                        <div className="flex-1 min-w-0">
                          <label className="block text-sm font-semibold text-gray-900 mb-3">
                            {indicatorValue.indicator_name}
                            {indicatorValue.indicator_value_unit && (
                              <span className="text-gray-500 font-normal ml-2">({indicatorValue.indicator_value_unit})</span>
                            )}
                          </label>
                          
                          <IndicatorValueInput
                            value={indicatorValue.value?.[indicatorValue.indicator_type]}
                            indicatorType={indicatorValue.indicator_type}
                            options={indicatorValue.indicator_value_possibilities}
                            onChange={newValue => handleSaveIndicatorValue(indicatorValue, newValue)}
                            className="w-full"
                          />
                        </div>
                      </div>
                    </div>
                  )
                })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-100 bg-gray-50">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">
              {Math.round((indicatorValues.filter(shouldDisplayIndicator).filter(isIndicatorValueFilled).length / indicatorValues.filter(shouldDisplayIndicator).length) * 100) === 100 ? "🎉 Tous les indicateurs sont remplis !" : "Remplissez tous les indicateurs pour continuer"}
            </p>
            <button
              onClick={handleFinish}
              disabled={Math.round((indicatorValues.filter(shouldDisplayIndicator).filter(isIndicatorValueFilled).length / indicatorValues.filter(shouldDisplayIndicator).length) * 100) !== 100 || isSaving}
              className={`px-6 py-3 rounded-xl font-semibold transition-all ${
                Math.round((indicatorValues.filter(shouldDisplayIndicator).filter(isIndicatorValueFilled).length / indicatorValues.filter(shouldDisplayIndicator).length) * 100) === 100  ? 'bg-primary-green text-white hover:bg-primary-green/90 shadow-lg shadow-primary-green/25' : 'bg-gray-200 text-gray-400 cursor-not-allowed'}`}
            >
              {isSaving ? (
                <span className="flex items-center gap-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  Enregistrement...
                </span>
              ) : (
                "Commencer"
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
