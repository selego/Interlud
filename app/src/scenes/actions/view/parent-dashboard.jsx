import React, { useState, useEffect, useMemo } from "react"
import { useNavigate } from "react-router-dom"
import { FiArrowLeft } from "react-icons/fi"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts"
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
  "#06B6D4", "#84CC16", "#F97316", "#6366F1", "#14B8A6", "#E11D48",
]

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

const getChartLabel = (action) => action.name || action.excel_worksheetname

export default function ParentDashboard({ action }) {
  const navigate = useNavigate()
  const { collectivity } = useStore()

  const [actions, setActions] = useState([])
  const [actionData, setActionData] = useState({})
  const [loading, setLoading] = useState(true)
  const [loadingData, setLoadingData] = useState(false)
  const [activeIndicator, setActiveIndicator] = useState("GES")
  const [yearFrom, setYearFrom] = useState(null)
  const [yearTo, setYearTo] = useState(null)

  useEffect(() => {
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
    fetchActions()
  }, [collectivity])

  useEffect(() => {
    const fetchData = async () => {
      if (!actions.length || !collectivity) return
      setLoadingData(true)
      const newData = {}
      await Promise.all(
        actions.map(async (a) => {
          try {
            const { ok, data } = await api.post("/excel/action_aggregation", { collectivity, action: a })
            if (ok) newData[a._id] = data
          } catch (e) {
            // skip silently
          }
        })
      )
      setActionData(newData)
      setLoadingData(false)
    }
    fetchData()
  }, [actions, collectivity])

  const availableIndicators = useMemo(() => {
    const keys = new Set()
    for (const d of Object.values(actionData)) {
      for (const key of Object.keys(d?.indicators ?? {})) {
        if (d.indicators[key]?.yearlyData?.length > 0) keys.add(key)
      }
    }
    return INDICATORS.filter((i) => keys.has(i.key))
  }, [actionData])

  const allYears = useMemo(() => {
    const years = new Set()
    for (const d of Object.values(actionData)) {
      const yd = d?.indicators?.[activeIndicator]?.yearlyData ?? []
      for (const row of yd) {
        if (row.ecartExpostRef !== 0 || row.ecartPrevRef !== 0) {
          years.add(row.year)
        }
      }
    }
    return [...years].sort((a, b) => a - b)
  }, [actionData, activeIndicator])

  useEffect(() => {
    if (allYears.length && yearFrom == null) setYearFrom(allYears[0])
    if (allYears.length && yearTo == null) setYearTo(allYears.at(-1))
  }, [allYears])

  const periodRange = useMemo(() => {
    const start = yearFrom ?? allYears[0]
    const end = yearTo ?? allYears.at(-1)
    if (!start || !end) return []
    return Array.from({ length: end - start + 1 }, (_, i) => start + i)
  }, [yearFrom, yearTo, allYears])

  const currentYear = new Date().getFullYear()

  const chartData = useMemo(() => {
    return periodRange.map((year) => {
      const row = { year }
      for (const a of actions) {
        const yd = actionData[a._id]?.indicators?.[activeIndicator]?.yearlyData ?? []
        const yearRow = yd.find((d) => d.year === year)
        let val = null
        let usedType = null
        if (yearRow) {
          if (year <= currentYear && yearRow.ecartExpostRef !== 0) {
            val = Math.abs(yearRow.ecartExpostRef)
            usedType = "ecartExpostRef"
          } else if (yearRow.ecartPrevRef !== 0) {
            val = Math.abs(yearRow.ecartPrevRef)
            usedType = "ecartPrevRef"
          } else if (yearRow.ecartExpostRef !== 0) {
            val = Math.abs(yearRow.ecartExpostRef)
            usedType = "ecartExpostRef"
          }
        }
        row[`val_${a._id}`] = val
        row[`type_${a._id}`] = usedType
      }
      return row
    })
  }, [periodRange, actions, actionData, activeIndicator, currentYear])

  const actionsWithData = useMemo(() => {
    return actions.filter((a) => chartData.some((row) => row[`val_${a._id}`] != null && row[`val_${a._id}`] > 0))
  }, [actions, chartData])

  const unit = INDICATORS.find((i) => i.key === activeIndicator)?.unit || ""
  const indLabel = INDICATORS.find((i) => i.key === activeIndicator)?.label || activeIndicator

  if (loading) return <Loader />

  return (
    <div className="max-w-8xl mx-auto px-6 sm:px-8 lg:px-10 py-10 space-y-8">
      <header>
        <div className="flex items-center gap-2 mb-4">
          <button onClick={() => navigate(-1)} className="p-1.5 rounded-full hover:bg-gray-100 text-gray-400 transition-colors">
            <FiArrowLeft size={17} />
          </button>
          <span className="text-xs px-2.5 py-1 rounded-full bg-primary-green/10 text-primary-green font-semibold">Plan d'action</span>
        </div>
        <h1 className="text-3xl font-bold text-[#111] tracking-tight">{action.name}</h1>
        <p className="text-sm text-gray-500 mt-2">
          Gains en émissions cumulés par année, segmentés par action de la charte — {collectivity?.name || "—"}
        </p>
      </header>

      <section className="space-y-5">
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-gray-100 bg-white shadow-sm flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500 whitespace-nowrap">Polluant</span>
            <select
              value={activeIndicator}
              onChange={(e) => setActiveIndicator(e.target.value)}
              className="input-primary !py-2 !pl-3 text-sm cursor-pointer font-medium"
            >
              {(availableIndicators.length > 0 ? availableIndicators : INDICATORS).map((i) => (
                <option key={i.key} value={i.key}>{i.label}</option>
              ))}
            </select>
          </div>

          {allYears.length > 0 && (
            <>
              <div className="h-5 w-px bg-gray-200 mx-1" />
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500 whitespace-nowrap">Période</span>
                <select
                  value={yearFrom ?? ""}
                  onChange={(e) => setYearFrom(parseInt(e.target.value))}
                  className="input-primary !py-2 !pl-3 text-sm cursor-pointer"
                >
                  {allYears.filter((y) => !yearTo || y <= yearTo).map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
                <span className="text-gray-300">→</span>
                <select
                  value={yearTo ?? ""}
                  onChange={(e) => setYearTo(parseInt(e.target.value))}
                  className="input-primary !py-2 !pl-3 text-sm cursor-pointer"
                >
                  {allYears.filter((y) => !yearFrom || y >= yearFrom).map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
            </>
          )}
        </div>

        <div className="card-shadow p-6">
          <div className="flex items-start justify-between mb-6 gap-4">
            <div>
              <h3 className="text-base font-semibold text-[#111]">Gains annuels par action de la charte — {indLabel}</h3>
              <p className="text-sm text-gray-500 mt-0.5">
                Ex-post − réf expost pour les années passées (si disponible), sinon prévisionnelle − réf prév.
              </p>
            </div>
            <div className="text-xs text-gray-400 shrink-0">{unit}</div>
          </div>

          {actionsWithData.length > 0 && (
            <div className="flex flex-wrap gap-4 mb-4">
              {actionsWithData.map((a, idx) => {
                const color = ACTION_COLORS[idx % ACTION_COLORS.length]
                return (
                  <div key={a._id} className="flex items-center gap-1.5 text-xs text-gray-600">
                    <span className="w-3 h-3 rounded-sm" style={{ background: color }} />
                    {getChartLabel(a)}
                  </div>
                )
              })}
            </div>
          )}

          <div className="h-[420px]">
            {loadingData ? (
              <div className="flex items-center justify-center h-full text-sm text-gray-400">Chargement des données…</div>
            ) : actionsWithData.length === 0 ? (
              <div className="flex items-center justify-center h-full text-sm text-gray-300">Aucune donnée disponible</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.04)" />
                  <XAxis dataKey="year" tick={{ fontSize: 11, fill: "#999" }} />
                  <YAxis tick={{ fontSize: 11, fill: "#999" }} tickFormatter={fmtAxis} width={60} />
                  <Tooltip content={<StackedTooltip actions={actionsWithData} unit={unit} />} cursor={{ fill: "rgba(0,0,0,0.02)" }} />
                  <ReferenceLine x={currentYear} stroke="#2DAC6A" strokeWidth={1.5} strokeDasharray="5 3" />
                  {actionsWithData.map((a, idx) => {
                    const color = ACTION_COLORS[idx % ACTION_COLORS.length]
                    return (
                      <Bar
                        key={a._id}
                        dataKey={`val_${a._id}`}
                        stackId="gains"
                        name={getChartLabel(a)}
                        fill={color}
                        maxBarSize={60}
                      />
                    )
                  })}
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </section>
    </div>
  )
}

function StackedTooltip({ active, payload, label, actions, unit }) {
  if (!active || !payload?.length) return null
  const entries = payload.filter((p) => p.value != null && p.value > 0)
  if (!entries.length) return null
  const total = entries.reduce((s, p) => s + (p.value || 0), 0)
  return (
    <div className="bg-white border border-gray-100 rounded-xl shadow-lg p-4 text-xs space-y-2 max-w-xs">
      <div className="font-bold text-[#111] text-sm">Année {label}</div>
      {entries.map((p, i) => {
        const actionId = p.dataKey?.replace("val_", "")
        const a = actions?.find((x) => x._id === actionId)
        return (
          <div key={i} className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: p.fill }} />
              <span className="text-gray-600 truncate">{a ? getChartLabel(a) : p.name}</span>
            </div>
            <span className="font-semibold text-[#333] tabular-nums whitespace-nowrap">
              {fmtNum(p.value)} {unit}
            </span>
          </div>
        )
      })}
      <div className="flex items-center justify-between gap-4 pt-2 border-t border-gray-100">
        <span className="text-gray-400">Total</span>
        <span className="font-bold text-[#111] tabular-nums whitespace-nowrap">{fmtNum(total)} {unit}</span>
      </div>
    </div>
  )
}
