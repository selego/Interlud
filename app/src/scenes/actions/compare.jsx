import React, { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { FiArrowLeft } from "react-icons/fi"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LabelList } from "recharts"
import api from "@/services/api"
import toast from "react-hot-toast"
import useStore from "@/services/store"
import Loader from "@/components/loader"

const INDICATORS = [
  { key: "GES", label: "Gaz à effet de serre", unit: "tCO₂e" },
  { key: "PM", label: "Particules (PM)", unit: "tPart" },
  { key: "NOx", label: "Oxydes d'azote (NOₓ)", unit: "tNOx" },
  { key: "HC", label: "Hydrocarbures (HC)", unit: "tHC" },
  { key: "CO", label: "Monoxyde de carbone (CO)", unit: "tCO" },
  { key: "Nrj", label: "Énergie", unit: "GWh" },
]

const ACTION_COLORS = [
  "#3B82F6", "#D97706", "#8B5CF6", "#EF4444", "#10B981", "#F472B6",
  "#06B6D4", "#84CC16", "#F97316", "#6366F1",
]

const INTERPOLATED_OPACITY = 0.35

const SITUATION_LABELS = { init: "Init.", ref: "Réf.", expost: "Ex-post", prev: "Prév." }

const GAIN_TYPES = [
  { key: "ecartRefInit", label: "Réf. vs Init.", color: "#8B5E3C" },
  { key: "ecartExpostRef", label: "Ex-post vs Réf.", color: "#2DAC6A" },
  { key: "ecartPrevRef", label: "Prév. vs Réf.", color: "#A3B84B" },
  { key: "ecartExpostPrev", label: "Ex-post vs Prév.", color: "#8B5E3C" },
]

const fmtAxis = (v) => {
  const abs = Math.abs(v)
  if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `${(v / 1_000).toFixed(0)}k`
  return String(v)
}

export default function CompareActions() {
  const navigate = useNavigate()
  const { collectivity } = useStore()

  const [actions, setActions] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadingData, setLoadingData] = useState(false)
  const [selectedType, setSelectedType] = useState(null)
  const [selectedActionIds, setSelectedActionIds] = useState([])
  const [actionData, setActionData] = useState(null)
  const [activeIndicator, setActiveIndicator] = useState("GES")
  const [selectedYears, setSelectedYears] = useState([])
  const [viewTab, setViewTab] = useState("emissions")
  const [activeGainType, setActiveGainType] = useState("ecartExpostRef")

  const fetchActions = async () => {
    if (!collectivity?._id) return
    try {
      setLoading(true)
      const { ok, data, code } = await api.post("/action/search", { collectivity_id: collectivity._id })
      if (!ok) return toast.error(code || "Erreur lors du chargement des actions")
      setActions(data)
    } catch (error) {
      toast.error(error.code || "Erreur lors du chargement des actions")
    } finally {
      setLoading(false)
    }
  }


  useEffect(() => {
    fetchActions()
  }, [collectivity])

  const groups = {}
  for (const action of actions) {
    if (!groups[action.excel_worksheetname]) groups[action.excel_worksheetname] = []
    groups[action.excel_worksheetname].push(action)
  }
  const actionsByType = Object.fromEntries(Object.entries(groups).filter(([, v]) => v.length >= 2))
  const availableTypes = Object.keys(actionsByType).sort()

  useEffect(() => {
    if (!selectedType && availableTypes.length > 0) setSelectedType(availableTypes[0])
  }, [availableTypes])

  useEffect(() => {
    if (selectedType && actionsByType[selectedType]) setSelectedActionIds(actionsByType[selectedType].map((a) => a._id))
  }, [selectedType])

  const fetchData = async () => {
    if (!selectedActionIds.length || !collectivity) return
    try {
      setLoadingData(true)
      const { ok, data, code } = await api.post("/excel/compare_actions", { collectivity, action_ids: selectedActionIds })
      if (!ok) return toast.error(code || "Erreur lors du chargement des actions")
      setActionData(data)
    } catch (error) {
      toast.error(error.code || "Erreur lors du chargement des actions")
    } finally {
      setLoadingData(false)
    }
  }


  useEffect(() => {
    fetchData()
  }, [selectedActionIds, collectivity])

  const selectedActions = selectedActionIds.map((id) => actions.find((a) => a._id === id)).filter(Boolean)
  const allAvailableYears = actionData?.availableYears?.[activeIndicator] ?? []

  useEffect(() => {
    setSelectedYears(allAvailableYears)
  }, [allAvailableYears.join(",")])

  const availableIndicators = INDICATORS.filter((i) => actionData?.availableIndicators?.includes(i.key))
  const availableGainTypes = GAIN_TYPES.filter((gt) => actionData?.availableGainTypes?.includes(gt.key))
  const activeInd = INDICATORS.find((i) => i.key === activeIndicator)

  const chartData = selectedYears.map((year) => {
    const row = { year }
    for (const action of selectedActions) {
      const p = actionData?.emissions?.[action._id]?.[activeIndicator]?.[year]
      row[`val_${action._id}`] = p?.value ?? null
      row[`interp_${action._id}`] = p?.interpolated ?? false
      row[`sit_${action._id}`] = p && !p.interpolated ? (SITUATION_LABELS[p.situationType] || "") : ""
    }
    return row
  })

  const gainsChartData = selectedYears.map((year) => {
    const row = { year }
    for (const action of selectedActions) {
      const p = actionData?.gains?.[action._id]?.[activeIndicator]?.[activeGainType]?.[year]
      row[`gain_${action._id}`] = p?.value ?? null
      row[`gainInterp_${action._id}`] = p?.interpolated ?? false
    }
    return row
  })

  if (loading) return <Loader />

  if (availableTypes.length === 0) {
    return (
      <div className="max-w-7xl mx-auto px-6 sm:px-8 lg:px-10 py-8">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => navigate(-1)} className="p-1.5 rounded-full hover:bg-gray-200 text-gray-500 transition-colors">
            <FiArrowLeft size={20} />
          </button>
          <h1 className="text-2xl font-semibold text-[#111]">Comparaison d'actions</h1>
        </div>
        <div className="card-shadow p-8 text-center text-gray-500">
          <p className="text-lg mb-2">Aucune comparaison possible</p>
          <p className="text-sm">Il faut au moins 2 actions du même type (même fiche) pour pouvoir les comparer.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-6 sm:px-8 lg:px-10 py-8 space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-1.5 rounded-full hover:bg-gray-200 text-gray-500 transition-colors">
          <FiArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-2xl font-semibold text-[#111]">Comparaison d'actions</h1>
          <p className="text-sm text-[#888] mt-1">
            Comparez les émissions en valeur absolue entre des actions de même type
          </p>
        </div>
      </div>

      <div className="card-shadow p-4">
        <div className="text-xs text-[#9ca3af] uppercase tracking-wider font-medium mb-3">Type d'action</div>
        <div className="flex gap-2 flex-wrap">
          {availableTypes.map((type) => (
            <button
              key={type}
              onClick={() => setSelectedType(type)}
              className={`px-4 py-1.5 rounded-md text-xs cursor-pointer border transition-all ${
                selectedType === type
                  ? "bg-[#1D9E75] text-white border-[#1D9E75] font-medium"
                  : "bg-transparent text-[#888] border-[#ddd] hover:border-[#1D9E75] hover:text-[#555]"
              }`}
            >
              {type} ({actionsByType[type].length} actions)
            </button>
          ))}
        </div>
      </div>

      {selectedType && actionsByType[selectedType] && (
        <div className="card-shadow p-4">
          <div className="text-xs text-[#9ca3af] uppercase tracking-wider font-medium mb-3">Actions à comparer</div>
          <div className="flex gap-3 flex-wrap">
            {actionsByType[selectedType].map((action, idx) => {
              const selected = selectedActionIds.includes(action._id)
              const color = ACTION_COLORS[idx % ACTION_COLORS.length]
              return (
                <button
                  key={action._id}
                  onClick={() => {
                    if (selected) {
                      setSelectedActionIds((prev) => prev.filter((id) => id !== action._id))
                    } else {
                      setSelectedActionIds((prev) => [...prev, action._id])
                    }
                  }}
                  className={`px-4 py-2 rounded-lg text-sm cursor-pointer border-2 transition-all flex items-center gap-2 ${
                    selected ? "font-medium text-white" : "bg-transparent text-[#666] border-[#ddd] hover:border-[#aaa]"
                  }`}
                  style={selected ? { backgroundColor: color, borderColor: color } : undefined}
                >
                  {!selected && <span className="w-3 h-3 rounded-full border-2" style={{ borderColor: color }} />}
                  {selected && <span className="w-3 h-3 rounded-full bg-white/40" />}
                  {action.name}{action.instance_number > 1 ? ` #${action.instance_number}` : ""}
                </button>
              )
            })}
          </div>
          {selectedActionIds.length < 2 && (
            <p className="text-xs text-orange-500 mt-2">Sélectionnez au moins 2 actions pour comparer.</p>
          )}
        </div>
      )}

      {selectedActionIds.length >= 2 && (
        <div className="card-shadow p-4">
          <div className="text-xs text-[#9ca3af] uppercase tracking-wider font-medium mb-3">Indicateur</div>
          <div className="flex gap-2 flex-wrap">
            {(availableIndicators.length > 0 ? availableIndicators : INDICATORS).map((ind) => (
              <button
                key={ind.key}
                onClick={() => setActiveIndicator(ind.key)}
                className={`px-4 py-1.5 rounded-md text-xs cursor-pointer border transition-all ${
                  activeIndicator === ind.key
                    ? "bg-[#1D9E75] text-white border-[#1D9E75] font-medium"
                    : "bg-transparent text-[#888] border-[#ddd] hover:border-[#1D9E75] hover:text-[#555]"
                }`}
              >
                {ind.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {selectedActionIds.length >= 2 && allAvailableYears.length > 0 && (
        <div className="card-shadow p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="text-xs text-[#9ca3af] uppercase tracking-wider font-medium">
              Années à afficher
              <span className="text-[#bbb] font-normal ml-2">— uniquement les horizons remplis par les utilisateurs</span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setSelectedYears(allAvailableYears)}
                className="text-xs text-[#1D9E75] hover:underline cursor-pointer"
              >
                Toutes
              </button>
              <button
                onClick={() => setSelectedYears([])}
                className="text-xs text-[#888] hover:underline cursor-pointer"
              >
                Aucune
              </button>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            {allAvailableYears.map((year) => {
              const selected = selectedYears.includes(year)
              const situationTypes = new Set()
              for (const action of selectedActions) {
                const p = actionData?.emissions?.[action._id]?.[activeIndicator]?.[year]
                if (p && !p.interpolated && p.situationType) situationTypes.add(p.situationType)
              }
              const hint = [...situationTypes].map((t) => SITUATION_LABELS[t] || t).join(", ")
              return (
                <button
                  key={year}
                  onClick={() => {
                    if (selected) {
                      setSelectedYears((prev) => prev.filter((y) => y !== year))
                    } else {
                      setSelectedYears((prev) => [...prev, year].sort((a, b) => a - b))
                    }
                  }}
                  className={`px-3 py-1.5 rounded-md text-xs cursor-pointer border transition-all ${
                    selected
                      ? "bg-[#111] text-white border-[#111] font-medium"
                      : "bg-transparent text-[#888] border-[#ddd] hover:border-[#555]"
                  }`}
                  title={hint}
                >
                  {year}
                  {hint && <span className={`ml-1 text-[10px] ${selected ? "text-white/60" : "text-[#bbb]"}`}>({hint})</span>}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {selectedActionIds.length >= 2 && (
        <div className="flex bg-gray-100 rounded-lg p-0.5 w-fit">
          {[
            { k: "emissions", l: "Niveaux d'émissions" },
            { k: "gains", l: "Gains réalisés" },
          ].map((t) => (
            <button
              key={t.k}
              onClick={() => setViewTab(t.k)}
              className={`px-4 py-2 text-sm rounded-md font-medium transition-all whitespace-nowrap cursor-pointer ${
                t.k === viewTab ? "bg-white shadow-sm text-[#111]" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {t.l}
            </button>
          ))}
        </div>
      )}

      {loadingData && (
        <div className="card-shadow p-6 text-center">
          <Loader />
          <p className="text-sm text-gray-500 mt-2">Chargement des données d'émissions...</p>
        </div>
      )}

      {viewTab === "emissions" && selectedActionIds.length >= 2 && !loadingData && chartData.length > 0 && (
        <div className="card-shadow p-6">
          <div className="flex items-start justify-between mb-6 gap-4">
            <div>
              <h3 className="text-base font-semibold text-[#111]">
                Émissions {activeInd?.label || activeIndicator} — Comparaison par année
              </h3>
              <p className="text-sm text-gray-500 mt-0.5">
                Valeurs absolues d'émissions pour chaque action, par année. Les barres semi-transparentes indiquent des valeurs interpolées.
              </p>
            </div>
            <div className="text-xs text-gray-400 shrink-0">{activeInd?.unit || ""}</div>
          </div>

          <ChartLegend actions={selectedActions} />

          <div className="h-[380px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }} barGap={0} barCategoryGap="15%">
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.04)" />
                <XAxis dataKey="year" tick={{ fontSize: 11, fill: "#999" }} />
                <YAxis tick={{ fontSize: 11, fill: "#999" }} tickFormatter={fmtAxis} width={52} />
                <Tooltip content={<CompareTooltip actions={selectedActions} unit={activeInd?.unit || ""} prefix="val_" interpPrefix="interp_" />} />
                {selectedActions.map((action, idx) => {
                  const color = ACTION_COLORS[idx % ACTION_COLORS.length]
                  return (
                    <Bar key={action._id} dataKey={`val_${action._id}`} name={action.name + (action.instance_number > 1 ? ` #${action.instance_number}` : "")} fill={color} radius={[3, 3, 0, 0]}>
                      {chartData.map((entry, i) => (
                        <Cell key={i} fill={color} fillOpacity={entry[`interp_${action._id}`] ? INTERPOLATED_OPACITY : 1} />
                      ))}
                      <LabelList dataKey={`sit_${action._id}`} content={(p) => {
                        if (!p.value) return null
                        const h = typeof p.height === "number" ? p.height : 0
                        const w = typeof p.width === "number" ? p.width : 0
                        if (h < 14 || w < 20) return null
                        return <text x={p.x + w / 2} y={p.y + h - 4} textAnchor="middle" fontSize={9} fontWeight={600} fill="#ffffff" style={{ pointerEvents: "none" }}>{p.value}</text>
                      }} />
                    </Bar>
                  )
                })}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {viewTab === "gains" && selectedActionIds.length >= 2 && !loadingData && (
        <div className="card-shadow p-4">
          <div className="text-xs text-[#9ca3af] uppercase tracking-wider font-medium mb-3">Type de gain (écart)</div>
          <div className="flex gap-2 flex-wrap">
            {(availableGainTypes.length > 0 ? availableGainTypes : GAIN_TYPES).map((gt) => (
              <button
                key={gt.key}
                onClick={() => setActiveGainType(gt.key)}
                className={`px-4 py-1.5 rounded-md text-xs cursor-pointer border-2 transition-all flex items-center gap-1.5 ${
                  activeGainType === gt.key
                    ? "text-white font-medium"
                    : "bg-transparent text-[#888] border-[#ddd] hover:border-[#aaa] hover:text-[#555]"
                }`}
                style={activeGainType === gt.key ? { backgroundColor: gt.color, borderColor: gt.color } : undefined}
              >
                {gt.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {viewTab === "gains" && selectedActionIds.length >= 2 && !loadingData && gainsChartData.length > 0 && (
        <div className="card-shadow p-6">
          <div className="flex items-start justify-between mb-6 gap-4">
            <div>
              <h3 className="text-base font-semibold text-[#111]">
                {GAIN_TYPES.find((g) => g.key === activeGainType)?.label || "Gains"} — {activeInd?.label || activeIndicator}
              </h3>
              <p className="text-sm text-gray-500 mt-0.5">
                Écarts entre situations pour chaque action, par année. Uniquement les horizons remplis. Les barres semi-transparentes indiquent des valeurs interpolées.
              </p>
            </div>
            <div className="text-xs text-gray-400 shrink-0">{activeInd?.unit || ""}</div>
          </div>

          <ChartLegend actions={selectedActions} />

          <div className="h-[380px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={gainsChartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }} barGap={0} barCategoryGap="15%">
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.04)" />
                <XAxis dataKey="year" tick={{ fontSize: 11, fill: "#999" }} />
                <YAxis tick={{ fontSize: 11, fill: "#999" }} tickFormatter={fmtAxis} width={52} />
                <Tooltip content={<CompareTooltip actions={selectedActions} unit={activeInd?.unit || ""} prefix="gain_" interpPrefix="gainInterp_" />} />
                {selectedActions.map((action, idx) => {
                  const color = ACTION_COLORS[idx % ACTION_COLORS.length]
                  return (
                    <Bar key={action._id} dataKey={`gain_${action._id}`} name={action.name + (action.instance_number > 1 ? ` #${action.instance_number}` : "")} fill={color} radius={[3, 3, 0, 0]}>
                      {gainsChartData.map((entry, i) => (
                        <Cell key={i} fill={color} fillOpacity={entry[`gainInterp_${action._id}`] ? INTERPOLATED_OPACITY : 1} />
                      ))}
                    </Bar>
                  )
                })}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {selectedActionIds.length >= 2 && !loadingData && (
        (viewTab === "emissions" && chartData.length === 0) ||
        (viewTab === "gains" && gainsChartData.length === 0)
      ) && actionData && (
        <div className="card-shadow p-8 text-center text-gray-400">
          <p>Aucune donnée disponible pour cet indicateur.</p>
        </div>
      )}
    </div>
  )
}

function ChartLegend(props) {
  return (
    <div className="flex flex-wrap gap-4 mb-4">
      {props.actions.map((action, idx) => {
        const color = ACTION_COLORS[idx % ACTION_COLORS.length]
        return (
          <div key={action._id} className="flex items-center gap-1.5 text-xs text-gray-600">
            <span className="w-3 h-3 rounded-sm" style={{ background: color }} />
            {action.name}{action.instance_number > 1 ? ` #${action.instance_number}` : ""}
          </div>
        )
      })}
      <div className="flex items-center gap-1.5 text-xs text-gray-400 ml-2">
        <span className="w-3 h-3 rounded-sm bg-gray-300 opacity-40" />
        Valeur interpolée
      </div>
    </div>
  )
}

function CompareTooltip(props) {
  if (!props.active || !props.payload?.length) return null
  const prefix = props.prefix || "val_"
  const interpPrefix = props.interpPrefix || "interp_"
  const fmtNum = (v) => {
    if (v == null) return "—"
    const abs = Math.abs(v)
    if (abs >= 1_000_000) return `${(v / 1_000_000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} M`
    if (abs >= 1_000) return `${(v / 1_000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} k`
    return Math.round(v).toLocaleString("fr-FR")
  }
  return (
    <div className="bg-white border border-gray-100 rounded-xl shadow-lg p-4 text-xs space-y-2 max-w-xs">
      <div className="font-bold text-[#111] text-sm">Année {props.label}</div>
      {props.payload.map((p, i) => {
        const actionId = p.dataKey?.replace(prefix, "")
        const action = props.actions?.find((a) => a._id === actionId)
        const isInterpolated = p.payload?.[`${interpPrefix}${actionId}`]
        return (
          <div key={i} className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm" style={{ background: p.fill, opacity: isInterpolated ? INTERPOLATED_OPACITY : 1 }} />
              <span className="text-gray-600 truncate max-w-[140px]">{action?.name || p.name}</span>
              {isInterpolated && <span className="text-[10px] text-orange-400 font-medium">(interpolée)</span>}
            </div>
            <span className="font-semibold text-[#333] tabular-nums whitespace-nowrap">
              {p.value != null ? `${fmtNum(p.value)} ${props.unit}` : "—"}
            </span>
          </div>
        )
      })}
    </div>
  )
}
