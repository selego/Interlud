import React, { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import api from "@/services/api"
import toast from "react-hot-toast"
import useStore from "@/services/store"
import { FiArrowLeft, FiDownload, FiPlus, FiLayers, FiZap, FiShield, FiCheckCircle, FiAlertCircle, FiTrendingUp, FiTrendingDown, FiTarget, FiEdit } from "react-icons/fi"
import { HiCheckCircle } from "react-icons/hi2"
import Loader from "@/components/loader"

const SITUATION_LABELS = {init: "Initiale",ref: "Référence",prev: "Prévisionnel",expost: "Ex-post"}


  const formatBigNumber = (val) => {
    if (!val && val !== 0) return "-"
    return Math.round(val).toLocaleString("fr-FR").replace(/\s/g, " ")
  }

export default function Dashboard({ action }) {
  const { userActionRights, user, collectivity } = useStore()
  const navigate = useNavigate()
  
  const [stats, setStats] = useState({ total: 0, filled: 0, empty: 0, completeness: 0, bySituation: { init: { filled: 0, total: 0 }, ref: { filled: 0, total: 0 }, prev: { filled: 0, total: 0 }, expost: { filled: 0, total: 0 } } })

  const [processedData, setProcessedData] = useState({ges: { value: 0, trend: 0 }, energy: { value: 0, trend: 0 }, pollutants: { value: 0, count: 0 }, score: 0, bestIndicator: { label: "-", val: -1 }, worstIndicator: { label: "-", val: 9999 }, indicators: [] })
  const [isAggregationLoading, setIsAggregationLoading] = useState(false)

  const isAdmin = user.role === "admin" || user.collectivities.some((c) => c.id === action.collectivity_id && c.role === "admin")
  const isEconomicActorAsRight = user.role === "economic_actor" && action.owner === "economic_actor" && user.economic_actor_id === action.economic_actor_id
  const right = userActionRights.find((right) => right.action_id === action._id)

  const isIndicatorValueFilled = (indicatorValue) => {
    const val = indicatorValue.value?.[indicatorValue.indicator_type]
    if (indicatorValue.indicator_type === "checkbox") return Array.isArray(val) && val.length > 0
    return val !== null && val !== undefined && val !== ""
  }

  const calculateStats = (data) => {
    const bySituation = {
      init: { filled: data.filter((v) => v.situation === "init" && isIndicatorValueFilled(v)).length, total: data.filter((v) => v.situation === "init").length },
      ref: { filled: data.filter((v) => v.situation === "ref" && isIndicatorValueFilled(v)).length, total: data.filter((v) => v.situation === "ref").length },
      prev: { filled: data.filter((v) => v.situation === "prev" && isIndicatorValueFilled(v)).length, total: data.filter((v) => v.situation === "prev").length },
      expost: { filled: data.filter((v) => v.situation === "expost" && isIndicatorValueFilled(v)).length, total: data.filter((v) => v.situation === "expost").length },
    }
    return { total: data.length, filled: data.filter(isIndicatorValueFilled).length, empty: data.length - data.filter(isIndicatorValueFilled).length, completeness: Math.round((data.filter(isIndicatorValueFilled).length / data.length) * 100) || 0, bySituation }
  }

  const fetchIndicatorValues = async () => {
    try {
      const { ok, data, code } = await api.post(`/indicator_value/search`, { action_id: action._id, limit: 10000 })
      if (!ok) return toast.error(code || "Une erreur est survenue")
      setStats(calculateStats(data))
    } catch (error) {
      console.error(error)
      toast.error("Une erreur est survenue lors du chargement des indicateurs")
    }
  }

  const loadAggregation = async () => {
    if (!collectivity?.excelFileId || !action?.excel_worksheetname) return

    try {
      setIsAggregationLoading(true)
      const { ok, data } = await api.post(`/excel/action_aggregation`, { excelFileId: collectivity.excelFileId, action: action.excel_worksheetname })
      if (!ok) return toast.error(data.error)
      setProcessedData(data)
    } catch (error) {
      console.error(error)
      toast.error("Erreur lors du chargement des données d'agrégation")
    } finally {
      setIsAggregationLoading(false)
    }
  }

  useEffect(() => {
    fetchIndicatorValues()
  }, [action])

  useEffect(() => {
    loadAggregation()
  }, [collectivity?.excelFileId, action])

  if (!isAdmin && !isEconomicActorAsRight && !right?.can_read) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg text-gray-600">Vous n'avez pas les droits pour accéder à cette action</div>
      </div>
    )
  }




  if (isAggregationLoading) return <Loader /> 

  return (
    <div className="min-h-screen p-8 bg-gray-50/50">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* Header */}
        <div>
          <div className="flex items-center gap-2 text-sm text-gray-600 mb-4">
            <button onClick={() => navigate("/actions")} className="hover:text-primary-green transition-colors">Actions</button>
            <span>/</span>
            <span className="text-gray-900 font-medium truncate max-w-[200px]">{action.name}</span>
          </div>
          
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div className="space-y-1">
                <div className="flex items-center gap-3">
                    <button onClick={() => navigate(-1)} className="p-1 rounded-full hover:bg-gray-200 text-gray-500 transition-colors">
                        <FiArrowLeft size={20} />
                    </button>
                    <h1 className="text-2xl font-bold text-gray-900">{action.name}</h1>
                </div>
                <p className="text-sm text-gray-500 pl-9">
                    Période d'analyse : {action.date_start && action.date_end ? `${new Date(action.date_start).getFullYear()} -> ${new Date(action.date_end).getFullYear()}` : "Non définie"}
                </p>
            </div>
            
            <div className="flex gap-3">
                <button className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                    <FiDownload size={16} />
                    Exporter
                </button>
                <button 
                    className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                    onClick={() => navigate(`/actions/${action._id}/completion`)}
                >
                    <FiEdit size={16} />
                    Compléter
                </button>
                {(isAdmin || right?.can_write || isEconomicActorAsRight) && (
                    <button 
                        className="flex items-center gap-2 px-4 py-2 bg-primary-green text-white rounded-lg text-sm font-medium hover:bg-primary-green/90 transition-colors"
                        onClick={() => navigate(`/actions/${action._id}/settings`)}
                    >
                        <FiPlus size={16} />
                        Modifier
                    </button>
                )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
            <TopCard 
                label="GES Évités" 
                value={formatBigNumber(processedData.ges.value)} 
                unit="tCO2e/an"
                trend={processedData.ges.trend}
            />
            <TopCard 
                label="Énergie Économisée" 
                value={formatBigNumber(processedData.energy.value)} 
                unit="GWh/an"
                trend={processedData.energy.trend}
            />
            <TopCard 
                label="Polluants Réduits" 
                value={formatBigNumber(processedData.pollutants.value)} 
                unit="tonnes/an"
                subLabel="PM, NOx, HC, CO"
            />
            <ScoreCard score={processedData.score} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-6">
                <div className="bg-white rounded-2xl p-8 card-shadow border border-gray-100 h-full">
                    <div className="flex items-center justify-between mb-8">
                        <h3 className="text-lg font-bold text-gray-900">Progression vers les objectifs</h3>
                        <span className="text-xs text-gray-400">La barre représente l'atteinte de l'objectif prévisionnel</span>
                    </div>

                    <div className="space-y-8">
                        {processedData.indicators.map((indicator, index) => (
                            <ProgressBar key={index} indicator={indicator} />
                        ))}
                    </div>
                </div>
            </div>

            <div className="space-y-6">
                <div className="bg-white rounded-2xl p-8 card-shadow border border-gray-100">
                    <h3 className="text-lg font-bold text-gray-900 mb-6">Saisie des données</h3>
                    
                    <div className="flex items-center justify-center mb-8">
                        <div className="relative w-24 h-24 flex items-center justify-center">
                           <svg className="w-full h-full" viewBox="0 0 36 36">
                                <path
                                    className="text-gray-100"
                                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="3"
                                />
                                <path
                                    className="text-primary-green transition-all duration-1000 ease-out"
                                    strokeDasharray={`${stats.completeness}, 100`}
                                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="3"
                                />
                            </svg>
                            <span className="absolute text-xl font-bold text-gray-900">{stats.completeness}%</span>
                        </div>
                    </div>

                    <div className="space-y-4">
                        {["init", "ref", "prev", "expost"].map((key) => {
                            const { filled, total } = stats.bySituation[key];
                            const isComplete = total > 0 && filled === total;
                            return (
                                <div key={key} className="flex items-center justify-between rounded-lg hover:bg-gray-50 transition-colors cursor-pointer" onClick={() => navigate(`/actions/${action._id}/completion`)}>
                                    <div className="flex items-center gap-3">
                                        <div className={`w-2 h-2 rounded-full ${isComplete ? "bg-primary-green" : "bg-orange-400"}`} />
                                        <span className="text-sm font-medium text-gray-700">{SITUATION_LABELS[key]}</span>
                                    </div>
                                    {isComplete ? (
                                        <HiCheckCircle className="text-primary-green" size={20} />
                                    ) : (
                                        <span className="text-xs text-gray-400">{filled}/{total}</span>
                                    )}
                                </div>
                            )
                        })}
                    </div>
                </div>

                    <div className="bg-gray-900 rounded-2xl p-8 text-white card-shadow">
                        <div className="mb-6">
                            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">Résumé</h3>
                            
                            <div className="space-y-4">
                                <div>
                                    <div className="flex items-center gap-2 text-primary-green mb-1">
                                        <FiTarget size={14} />
                                        <span className="text-xs font-medium">Meilleur résultat</span>
                                    </div>
                                    <div className="text-lg font-bold">
                                        {processedData.bestIndicator.label} <span className="text-primary-green">— {Math.round(processedData.bestIndicator.val)}% atteint</span>
                                    </div>
                                </div>

                                <div>
                                    <div className="flex items-center gap-2 text-primary-green/70 mb-1">
                                        <FiAlertCircle size={14} />
                                        <span className="text-xs font-medium">À améliorer</span>
                                    </div>
                                    <div className="text-lg font-bold">
                                        {processedData.worstIndicator.label} <span className="text-primary-green/60">— {Math.round(processedData.worstIndicator.val)}% atteint</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        <div className="pt-4 border-t border-gray-800 flex justify-between items-center text-xs text-gray-400">
                            <span>Indicateurs</span>
                            <span className="text-white font-bold">{processedData.indicators.length} suivis</span>
                    </div>
                </div>
            </div>
        </div>
      </div>
    </div>
  )
}

const COLORS = {
  primary: { base: "text-primary-green",bg: "bg-primary-green",light: "bg-[#D9EFE3]",border: "border-primary-green"},
  gradient: {start: "#2DAC6A",end: "#D9EFE3"}
}

function TopCard({ label, value, unit, trend, subLabel }) {
    const trendIsPositive = trend > 0;

    return (
        <div className="bg-white p-6 rounded-2xl card-shadow border border-gray-100 flex flex-col justify-between h-full relative overflow-hidden group hover:border-primary-green/30 transition-all duration-300">
            <div className="flex justify-between items-start mb-2">
                <p className="text-sm font-medium text-gray-500">{label}</p>
                {trend !== undefined && trend !== null && (
                    <div className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold ${COLORS.primary.light} ${COLORS.primary.base}`}>
                        {trendIsPositive ? <FiTrendingUp /> : <FiTrendingDown />}
                        {(Math.abs(trend) * 100).toFixed(1)}%
                    </div>
                )}
            </div>
            
            <div>
                <div className="flex items-baseline gap-2">
                    <h3 className="text-3xl font-bold text-gray-900">{value}</h3>
                    <span className="text-xs font-medium text-gray-400">{unit}</span>
                </div>
                {subLabel && (
                     <p className="text-xs text-gray-400 mt-1">
                        {subLabel}
                    </p>
                )}
            </div>
        </div>
    )
}

function ScoreCard({ score }) {
    let text = "Excellent";
    if (score < 80) { text = "Bon"; }
    if (score < 60) { text = "Moyen"; }
    if (score < 40) { text = "Faible"; }

    return (
        <div className="bg-white p-6 rounded-2xl card-shadow border border-gray-100 flex flex-col justify-between h-full group hover:border-primary-green/30 transition-all duration-300">
            <div className="flex justify-between items-start mb-2">
                 <p className="text-sm font-medium text-gray-500">Score Performance</p>
                <span className={`px-2 py-1 rounded-lg text-xs font-bold ${COLORS.primary.light} ${COLORS.primary.base}`}>
                    {text}
                </span>
            </div>
             <div>
                 <div className="flex items-baseline gap-2">
                    <h3 className={`text-3xl font-bold ${COLORS.primary.base}`}>{score}%</h3>
                    <span className={`text-xs font-medium ${COLORS.primary.base} opacity-60`}>réel vs objectif</span>
                </div>
            </div>
        </div>
    )
}

function ProgressBar({ indicator }) {
    const { label, achievement, objective, real, objectiveVal, realVal } = indicator;
    
    const config = { icon: label.substring(0, 2), bg: "bg-[#D9EFE3]", color: "bg-primary-green" };

    const icons = { GES: "GES", PM: "PM", NOx: "NOx", HC: "HC", CO: "CO", Énergie: "Énergie" };
    const iconText = icons[label] || label.substring(0, 2);

    let status = "En retard";
    let statusClass = "text-primary-green/60"

    if (achievement >= 95) status = "Excellent"
    if (achievement >= 80) status = "En bonne voie"
    if (achievement >= 60) { status = "À surveiller"; statusClass = "text-primary-green/80"; }

    if (!objective && objective !== 0) return null

    return (
        <div className="flex items-center gap-6 group">
            <div className={`w-12 h-12 shrink-0 rounded-xl flex items-center justify-center text-xs font-bold ${config.bg} text-primary-green transition-colors group-hover:bg-primary-green group-hover:text-white`}>
                {iconText}
            </div>
            
            <div className="flex-1 space-y-2">
                <div className="flex justify-between items-center mb-1">
                    <span className="font-bold text-gray-900">{label} <span className="text-xs font-normal text-gray-400 ml-2">{indicator.unit}</span></span>
                </div>
                
                <div className="relative h-3 w-full bg-gray-100 rounded-full overflow-hidden">
                    <div 
                        className={`absolute top-0 left-0 h-full rounded-full ${config.color} transition-all duration-1000`} 
                        style={{ width: `${Math.min(achievement || 0, 100)}%`, opacity: Math.max(0.4, Math.min((achievement || 0) / 100, 1)) }}
                    />
                </div>

                <div className="flex justify-between text-xs font-medium mt-1">
                    <span className="text-primary-green">Réel: {formatBigNumber(realVal)} {indicator.unit}</span>
                    <div className="text-right">
                        <span className="text-gray-400 mr-4">Objectif: {formatBigNumber(objectiveVal)} {indicator.unit}</span>
                    </div>
                </div>
            </div>

            <div className="w-32 text-right">
                 <div className={`text-xl font-bold ${statusClass}`}>
                     {Math.round(achievement)}%
                 </div>
                 <div className="text-xs text-gray-400">{status}</div>
            </div>
        </div>
    )
}
