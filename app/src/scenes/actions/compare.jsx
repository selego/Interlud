import React, { useState, useEffect, useMemo } from "react"
import { useNavigate } from "react-router-dom"
import { FiArrowLeft } from "react-icons/fi"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LabelList } from "recharts"
import api from "@/services/api"
import toast from "react-hot-toast"
import useStore from "@/services/store"
import Loader from "@/components/loader"

// ── Constants ──────────────────────────────────────────────────────────────

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

// ── Helpers ────────────────────────────────────────────────────────────────

const fmtNum = (v) => {
  if (v == null) return "—"
  const abs = Math.abs(v)
  if (abs >= 1_000_000) return `${(v / 1_000_000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} M`
  if (abs >= 1_000) return `${(v / 1_000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} k`
  return Math.round(v).toLocaleString("fr-FR")
}

const fmtAxis = (v) => {
  const abs = Math.abs(v)
  if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `${(v / 1_000).toFixed(0)}k`
  return String(v)
}

/**
 * Build the list of situation bars from the action's year configuration.
 * Replicates the exact same logic as dashboard.jsx — only includes
 * horizons actually filled by the user (init, ref, expost, prev).
 * Returns bars sorted chronologically, each with { year, type, dataKey, label }.
 */
function buildSituationBars(action) {
  const bars = []

  // 1. Situation initiale
  if (action.year_init) {
    bars.push({ year: action.year_init, type: "init", dataKey: "initiale", label: `Init. ${action.year_init}` })
  }

  // 2. Collect all ref/expost pairs
  const expostEntries = action.excel_files_expost?.length
    ? action.excel_files_expost.filter((e) => e.year_expost)
    : action.year_expost ? [{ year_expost: action.year_expost, year_ref: action.year_ref }] : []

  // 3. Collect all ref/prev pairs
  const prevEntries = action.exel_files_prev?.length
    ? action.exel_files_prev.filter((e) => e.year_prev)
    : action.year_prev ? [{ year_prev: action.year_prev, year_ref: action.year_ref }] : []

  const addedRefYears = new Map()

  for (const entry of expostEntries) {
    if (entry.year_ref && !addedRefYears.has(entry.year_ref)) {
      bars.push({ year: entry.year_ref, type: "ref", dataKey: "reference", label: `Réf. ${entry.year_ref}` })
      addedRefYears.set(entry.year_ref, "expost")
    }
    bars.push({ year: entry.year_expost, type: "expost", dataKey: "expost", label: `Ex-post ${entry.year_expost}` })
  }

  for (const entry of prevEntries) {
    if (entry.year_ref && !addedRefYears.has(entry.year_ref)) {
      bars.push({ year: entry.year_ref, type: "ref", dataKey: "reference", label: `Réf. ${entry.year_ref}` })
      addedRefYears.set(entry.year_ref, "prev")
    }
    bars.push({ year: entry.year_prev, type: "prev", dataKey: "previsionnelle", label: `Prév. ${entry.year_prev}` })
  }

  if (!addedRefYears.size && action.year_ref) {
    bars.push({ year: action.year_ref, type: "ref", dataKey: "reference", label: `Réf. ${action.year_ref}` })
  }

  const typeOrder = { init: 0, ref: 1, expost: 2, prev: 3 }
  bars.sort((a, b) => a.year - b.year || typeOrder[a.type] - typeOrder[b.type])

  return bars
}

/**
 * For a given action's emission yearlyData, extract the known values
 * at the years/situations actually filled (using buildSituationBars).
 * Returns Map<year, value> with only real (user-filled) data points.
 */
function getKnownEmissionPoints(action, yearlyData) {
  const bars = buildSituationBars(action)
  const byYear = new Map(yearlyData.map((d) => [d.year, d]))
  const known = new Map()

  for (const bar of bars) {
    const row = byYear.get(bar.year)
    const val = row ? row[bar.dataKey] : null
    if (val != null && val > 0) {
      // If multiple situations at the same year, keep the latest (expost > prev > ref > init)
      known.set(bar.year, { value: val, type: bar.type })
    }
  }

  return known
}

/**
 * Linear interpolation: given known data points Map<year, value>,
 * fill missing years with interpolated values.
 * Returns Map<year, { value, interpolated: boolean }>
 */
function interpolateValues(knownPoints, allYears) {
  const result = new Map()
  const sorted = [...knownPoints.entries()].sort(([a], [b]) => a - b)

  for (const year of allYears) {
    const known = knownPoints.get(year)
    if (known != null) {
      result.set(year, { value: known.value, type: known.type, interpolated: false })
      continue
    }

    // Find surrounding known points for interpolation
    let before = null, after = null
    for (const [y, entry] of sorted) {
      if (y < year && entry.value != null) before = { year: y, value: entry.value }
      if (y > year && entry.value != null && !after) after = { year: y, value: entry.value }
    }

    if (before && after) {
      const ratio = (year - before.year) / (after.year - before.year)
      const interpolated = before.value + ratio * (after.value - before.value)
      result.set(year, { value: Math.round(interpolated * 100) / 100, interpolated: true })
    }
  }

  return result
}

// Custom label renderer: displays the situation type (Init./Réf./Ex-post/Prév.)
// at the bottom of each bar, so the user knows which horizon the value comes from.
function renderSituationLabel(props) {
  const { x, y, width, height, value } = props
  if (!value) return null
  const h = typeof height === "number" ? height : 0
  const w = typeof width === "number" ? width : 0
  if (h < 14 || w < 20) return null
  return (
    <text
      x={x + w / 2}
      y={y + h - 4}
      textAnchor="middle"
      fontSize={9}
      fontWeight={600}
      fill="#ffffff"
      style={{ pointerEvents: "none" }}
    >
      {value}
    </text>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────

export default function CompareActions() {
  const navigate = useNavigate()
  const { collectivity } = useStore()

  const [actions, setActions] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadingData, setLoadingData] = useState(false)
  const [selectedType, setSelectedType] = useState(null)
  const [selectedActionIds, setSelectedActionIds] = useState([])
  const [actionData, setActionData] = useState({}) // { actionId: processedData }
  const [activeIndicator, setActiveIndicator] = useState("GES")
  const [selectedYears, setSelectedYears] = useState([])
  const [viewTab, setViewTab] = useState("emissions") // "emissions" | "gains"
  const [activeGainType, setActiveGainType] = useState("ecartExpostRef")
  
  const fetchActions = async () => {
  if (!collectivity?._id) return
  try {
    setLoading(true)
    const { ok, data } = await api.post("/action/search", { collectivity_id: collectivity._id })
    if (!ok) return toast.error("Erreur lors du chargement des actions")
    setActions(data.filter((a) => a.excel_worksheetname))
  } catch (e) {
    toast.error("Erreur lors du chargement des actions")
  } finally {
    setLoading(false)
  }
}


  useEffect(() => {
    fetchActions()
  }, [collectivity])

  // ── Group actions by type (excel_worksheetname) ────────────────────────

  const actionsByType = useMemo(() => {
    const groups = {}
    for (const action of actions) {
      const type = action.excel_worksheetname
      if (!groups[type]) groups[type] = []
      groups[type].push(action)
    }
    // Only keep types with 2+ actions (comparison needs at least 2)
    return Object.fromEntries(Object.entries(groups).filter(([, v]) => v.length >= 2))
  }, [actions])

  const availableTypes = Object.keys(actionsByType).sort()
  useEffect(() => {
    if (!selectedType && availableTypes.length > 0) setSelectedType(availableTypes[0])
  }, [availableTypes])

  useEffect(() => {
    if (selectedType && actionsByType[selectedType]) setSelectedActionIds(actionsByType[selectedType].map((a) => a._id))
  }, [selectedType])



    const fetchData = async () => {
    if (!selectedActionIds.length || !collectivity) return
    setLoadingData(true)
    const newData = {}
    await Promise.all(
      selectedActionIds.map(async (id) => {
        const action = actions.find((a) => a._id === id)
        if (!action) return
        try {
          const { ok, data, code } = await api.post("/excel/action_aggregation", { collectivity, action })
          if (!ok) return  toast.error( code.error || "Erreur lors du chargement des actions")
          newData[id] = data
        } catch (e) {
          toast.error( "Erreur lors du chargement des actions")

        }
      })
    )
    setActionData(newData)
    setLoadingData(false)
  }


  useEffect(() => {
    fetchData()
  }, [selectedActionIds, collectivity])

  // ── Compute all unique years across selected actions ───────────────────

  const selectedActions = useMemo(
    () => selectedActionIds.map((id) => actions.find((a) => a._id === id)).filter(Boolean),
    [selectedActionIds, actions]
  )

  const allAvailableYears = useMemo(() => {
    const years = new Set()
    for (const action of selectedActions) {
      const emData = actionData[action._id]?.emissions?.indicators?.[activeIndicator]?.yearlyData ?? []
      const known = getKnownEmissionPoints(action, emData)
      for (const year of known.keys()) {
        years.add(year)
      }
    }
    return [...years].sort((a, b) => a - b)
  }, [selectedActions, actionData, activeIndicator])

  // Auto-select all years when they change
  useEffect(() => {
    setSelectedYears(allAvailableYears)
  }, [allAvailableYears])

  // ── Build chart data with interpolation ────────────────────────────────

  const chartData = useMemo(() => {
    if (!selectedYears.length || !selectedActions.length) return []
    const actionInterpolated = {} 

    for (const action of selectedActions) {
      const emData = actionData[action._id]?.emissions?.indicators?.[activeIndicator]?.yearlyData ?? []
      const knownPoints = getKnownEmissionPoints(action, emData)
      actionInterpolated[action._id] = interpolateValues(knownPoints, selectedYears)
    }
    return selectedYears.map((year) => {
      const row = { year }
      for (const action of selectedActions) {
        const entry = actionInterpolated[action._id]?.get(year)
        row[`val_${action._id}`] = entry?.value ?? null
        row[`interp_${action._id}`] = entry?.interpolated ?? false
        row[`sit_${action._id}`] = entry && !entry.interpolated ? (SITUATION_LABELS[entry.type] || "") : ""
      }
      return row
    })
  }, [selectedYears, selectedActions, actionData, activeIndicator, allAvailableYears])


  const gainsChartData = useMemo(() => {
    if (!selectedYears.length || !selectedActions.length) return []

    const actionGainsInterpolated = {}

    for (const action of selectedActions) {
      const gainsYearlyData = actionData[action._id]?.indicators?.[activeIndicator]?.yearlyData ?? []
      const gainsMap = new Map(gainsYearlyData.map((d) => [d.year, d]))
      const bars = buildSituationBars(action)
      const knownPoints = new Map()
      for (const bar of bars) {
        const row = gainsMap.get(bar.year)
        if (row && row[activeGainType] !== 0) {
          knownPoints.set(bar.year, { value: row[activeGainType], type: bar.type })
        }
      }

      actionGainsInterpolated[action._id] = interpolateValues(knownPoints, selectedYears)
    }

    return selectedYears.map((year) => {
      const row = { year }
      for (const action of selectedActions) {
        const entry = actionGainsInterpolated[action._id]?.get(year)
        row[`gain_${action._id}`] = entry?.value ?? null
        row[`gainInterp_${action._id}`] = entry?.interpolated ?? false
      }
      return row
    })
  }, [selectedYears, selectedActions, actionData, activeIndicator, activeGainType])

  const availableGainTypes = useMemo(() => {
    const available = new Set()
    for (const action of selectedActions) {
      const gainsYearlyData = actionData[action._id]?.indicators?.[activeIndicator]?.yearlyData ?? []
      for (const row of gainsYearlyData) {
        for (const gt of GAIN_TYPES) {
          if (row[gt.key] !== 0 && row[gt.key] != null) available.add(gt.key)
        }
      }
    }
    return GAIN_TYPES.filter((gt) => available.has(gt.key))
  }, [selectedActions, actionData, activeIndicator])

  const activeInd = INDICATORS.find((i) => i.key === activeIndicator)
  const availableIndicators = useMemo(() => {
    const keys = new Set()
    for (const [, data] of Object.entries(actionData)) {
      for (const key of Object.keys(data?.emissions?.indicators ?? {})) {
        if (data.emissions.indicators[key]?.yearlyData?.length > 0) keys.add(key)
      }
    }
    return INDICATORS.filter((i) => keys.has(i.key))
  }, [actionData])

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

      {/* ── Type selector ──────────────────────────────────────────────────── */}
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

      {/* ── Action selection ───────────────────────────────────────────────── */}
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

      {/* ── Indicator tabs ─────────────────────────────────────────────────── */}
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

      {/* ── Year selection ─────────────────────────────────────────────────── */}
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
              // Determine which situation types exist at this year across all selected actions
              const situationTypes = new Set()
              for (const action of selectedActions) {
                for (const bar of buildSituationBars(action)) {
                  if (bar.year === year) situationTypes.add(bar.type)
                }
              }
              const typeLabels = { init: "Init.", ref: "Réf.", expost: "Ex-post", prev: "Prév." }
              const hint = [...situationTypes].map((t) => typeLabels[t] || t).join(", ")
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

      {/* ── View toggle (Emissions / Gains) ──────────────────────────────── */}
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

      {/* ── Loading indicator ──────────────────────────────────────────────── */}
      {loadingData && (
        <div className="card-shadow p-6 text-center">
          <Loader />
          <p className="text-sm text-gray-500 mt-2">Chargement des données d'émissions...</p>
        </div>
      )}

      {/* ── Emissions chart ───────────────────────────────────────────────── */}
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
                      <LabelList dataKey={`sit_${action._id}`} content={renderSituationLabel} />
                    </Bar>
                  )
                })}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* ── Gains: type selector ──────────────────────────────────────────── */}
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

      {/* ── Gains chart ────────────────────────────────────────────────────── */}
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

      {/* ── Empty state ────────────────────────────────────────────────────── */}
      {selectedActionIds.length >= 2 && !loadingData && (
        (viewTab === "emissions" && chartData.length === 0) ||
        (viewTab === "gains" && gainsChartData.length === 0)
      ) && Object.keys(actionData).length > 0 && (
        <div className="card-shadow p-8 text-center text-gray-400">
          <p>Aucune donnée disponible pour cet indicateur.</p>
        </div>
      )}
    </div>
  )
}

// ── Shared sub-components ────────────────────────────────────────────────

function ChartLegend({ actions }) {
  return (
    <div className="flex flex-wrap gap-4 mb-4">
      {actions.map((action, idx) => {
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

function CompareTooltip({ active, payload, label, actions, unit, prefix = "val_", interpPrefix = "interp_" }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-gray-100 rounded-xl shadow-lg p-4 text-xs space-y-2 max-w-xs">
      <div className="font-bold text-[#111] text-sm">Année {label}</div>
      {payload.map((p, i) => {
        const actionId = p.dataKey?.replace(prefix, "")
        const action = actions?.find((a) => a._id === actionId)
        const entry = p.payload
        const isInterpolated = entry?.[`${interpPrefix}${actionId}`]
        return (
          <div key={i} className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm" style={{ background: p.fill, opacity: isInterpolated ? INTERPOLATED_OPACITY : 1 }} />
              <span className="text-gray-600 truncate max-w-[140px]">{action?.name || p.name}</span>
              {isInterpolated && <span className="text-[10px] text-orange-400 font-medium">(interpolée)</span>}
            </div>
            <span className="font-semibold text-[#333] tabular-nums whitespace-nowrap">
              {p.value != null ? `${fmtNum(p.value)} ${unit}` : "—"}
            </span>
          </div>
        )
      })}
    </div>
  )
}
