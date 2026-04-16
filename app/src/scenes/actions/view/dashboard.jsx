import React, { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import api from "@/services/api"
import toast from "react-hot-toast"
import useStore from "@/services/store"
import { FiArrowLeft, FiEdit, FiPlus, FiTrendingUp, FiTrendingDown, FiMinus } from "react-icons/fi"
import Loader from "@/components/loader"
import { ComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Cell, Rectangle } from "recharts"

// ── Constants ────────────────────────────────────────────────────────────────

const INDICATORS = [
  { key: "GES", label: "Gaz à effet de serre", unit: "tCO₂e" },
  { key: "PM", label: "Particules (PM)", unit: "tPart" },
  { key: "NOx", label: "Oxydes d'azote (NOₓ)", unit: "tNOx" },
  { key: "HC", label: "Hydrocarbures (HC)", unit: "tHC" },
  { key: "CO", label: "Monoxyde de carbone (CO)", unit: "tCO" },
  { key: "Nrj", label: "Énergie", unit: "GWh" }
]

const TRAJ_SERIES = [
  { key: "initiale", label: "Initiale", color: "#C8C8C8" },
  { key: "reference", label: "Référence", color: "#4A86C8" },
  { key: "previsionnelle", label: "Prévisionnelle", color: "#F59600", dash: true },
  { key: "expost", label: "Ex-post", color: "#2DAC6A" }
]

const SITUATION_COLORS = {
  init: "#C8C8C8",
  ref: "#4A86C8",
  prev: "#F59600",
  expost: "#2DAC6A"
}

const SITUATION_LABELS = {
  init: "Initiale",
  ref: "Référence",
  prev: "Prévisionnelle",
  expost: "Ex-post"
}

const SITUATION_LABELS_SHORT = {
  init: "Init.",
  ref: "Réf.",
  prev: "Prév.",
  expost: "Ex-post"
}

/**
 * Build situation groups. Each group = [ref?, main] where `main` is init / ex-post / prév.
 * Ref bars linked to an ex-post or prév. inherit the linked bar's color.
 * Groups are sorted chronologically on their main bar's year.
 */
function buildSituationGroups(action) {
  const groups = []

  if (action.year_init) {
    groups.push([{ year: action.year_init, type: "init", dataKey: "initiale" }])
  }

  const expostEntries = action.excel_files_expost?.length
    ? action.excel_files_expost.filter((e) => e.year_expost)
    : action.year_expost
      ? [{ year_expost: action.year_expost, year_ref: action.year_ref }]
      : []

  const prevEntries = action.exel_files_prev?.length
    ? action.exel_files_prev.filter((e) => e.year_prev)
    : action.year_prev
      ? [{ year_prev: action.year_prev, year_ref: action.year_ref }]
      : []

  expostEntries.forEach((entry) => {
    const group = []
    if (entry.year_ref) group.push({ year: entry.year_ref, type: "ref", dataKey: "reference", linkedType: "expost" })
    group.push({ year: entry.year_expost, type: "expost", dataKey: "expost" })
    groups.push(group)
  })

  prevEntries.forEach((entry) => {
    const group = []
    if (entry.year_ref) group.push({ year: entry.year_ref, type: "ref", dataKey: "reference", linkedType: "prev" })
    group.push({ year: entry.year_prev, type: "prev", dataKey: "previsionnelle" })
    groups.push(group)
  })

  // Fallback: lone year_ref with no expost/prev entries
  const hasRef = groups.some((g) => g.some((b) => b.type === "ref"))
  if (!hasRef && action.year_ref) {
    groups.push([{ year: action.year_ref, type: "ref", dataKey: "reference" }])
  }

  groups.sort((a, b) => a[a.length - 1].year - b[b.length - 1].year)
  return groups
}

const GAIN_COLORS = {
  refInit: "#4A86C8",
  expostRef: "#2DAC6A",
  prevRef: "#F59600",
  expostPrev: "#7C3AED"
}

const GAIN_LABELS = {
  refInit: "Réf. vs Init.",
  expostRef: "Ex-post vs Réf.",
  prevRef: "Prév. vs Réf.",
  expostPrev: "Ex-post vs Prév."
}

/**
 * Build gain (écart) bars between pairs of situations.
 * Each bar = difference between two situation emissions at user-defined horizons.
 * Returns { label, value, pct, compType, year, fill }.
 */
function buildGainBars(action, situationChartData) {
  const gains = []
  const getVal = (type, year) => situationChartData.find((b) => b.type === type && b.year === year)?.value

  const initVal = action.year_init != null ? getVal("init", action.year_init) : null

  const expostEntries = action.excel_files_expost?.length
    ? action.excel_files_expost.filter((e) => e.year_expost)
    : action.year_expost
      ? [{ year_expost: action.year_expost, year_ref: action.year_ref }]
      : []

  const prevEntries = action.exel_files_prev?.length
    ? action.exel_files_prev.filter((e) => e.year_prev)
    : action.year_prev
      ? [{ year_prev: action.year_prev, year_ref: action.year_ref }]
      : []

  // Ref vs Init — convention Excel : ref - init
  const refYears = [...new Set([...expostEntries.map((e) => e.year_ref), ...prevEntries.map((e) => e.year_ref)].filter(Boolean))].sort((a, b) => a - b)
  if (refYears.length && initVal != null) {
    const refVal = getVal("ref", refYears[0])
    if (refVal != null) {
      const gain = refVal - initVal
      const pct = initVal !== 0 ? (gain / initVal) * 100 : null
      gains.push({ label: `Réf. vs Init.\n${refYears[0]}`, value: gain, pct, compType: "refInit", year: refYears[0], fill: GAIN_COLORS.refInit })
    }
  }

  // Expost vs Ref — convention Excel : expost - ref
  for (const entry of expostEntries) {
    const refVal = entry.year_ref ? getVal("ref", entry.year_ref) : null
    const expostVal = getVal("expost", entry.year_expost)
    if (refVal != null && expostVal != null) {
      const gain = expostVal - refVal
      const pct = refVal !== 0 ? (gain / refVal) * 100 : null
      gains.push({ label: `Ex-post vs Réf.\n${entry.year_expost}`, value: gain, pct, compType: "expostRef", year: entry.year_expost, fill: GAIN_COLORS.expostRef })
    }
  }

  // Prev vs Ref — convention Excel : prev - ref
  for (const entry of prevEntries) {
    const refVal = entry.year_ref ? getVal("ref", entry.year_ref) : null
    const prevVal = getVal("prev", entry.year_prev)
    if (refVal != null && prevVal != null) {
      const gain = prevVal - refVal
      const pct = refVal !== 0 ? (gain / refVal) * 100 : null
      gains.push({ label: `Prév. vs Réf.\n${entry.year_prev}`, value: gain, pct, compType: "prevRef", year: entry.year_prev, fill: GAIN_COLORS.prevRef })
    }
  }

  // Expost vs Prev — convention Excel : expost - prev
  for (const exEntry of expostEntries) {
    const expostVal = getVal("expost", exEntry.year_expost)
    const matchingPrev = prevEntries.find((p) => p.year_prev === exEntry.year_expost) || prevEntries[0]
    if (matchingPrev) {
      const prevVal = getVal("prev", matchingPrev.year_prev)
      if (expostVal != null && prevVal != null) {
        const gain = expostVal - prevVal
        const pct = prevVal !== 0 ? (gain / prevVal) * 100 : null
        gains.push({ label: `Ex-post vs Prév.\n${exEntry.year_expost}`, value: gain, pct, compType: "expostPrev", year: exEntry.year_expost, fill: GAIN_COLORS.expostPrev })
      }
    }
  }

  gains.sort((a, b) => a.year - b.year)
  return gains
}

// ── Formatters ───────────────────────────────────────────────────────────────

const fmtNum = (v) => {
  if (v == null) return "—"
  const abs = Math.abs(v)
  if (abs >= 1_000_000) return `${(abs / 1_000_000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} M`
  if (abs >= 1_000) return `${(abs / 1_000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} k`
  return Math.round(abs).toLocaleString("fr-FR")
}

const fmtSigned = (v) => {
  if (v == null) return "—"
  const r = Math.round(v)
  if (r === 0) return "0"
  return (r > 0 ? "+" : "−") + fmtNum(Math.abs(r))
}

const fmtAxis = (v) => {
  const abs = Math.abs(v)
  if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `${(v / 1_000).toFixed(0)}k`
  return String(v)
}

// ── Score & display helpers ───────────────────────────────────────────────────

const scoreStyle = (pct) => {
  if (pct == null) return { color: "#999", bg: "#F7F7F7", badgeCls: "bg-gray-100 text-gray-500", label: "Non évalué" }
  if (pct >= 80) return { color: "#2DAC6A", bg: "#EBF8F3", badgeCls: "bg-[#2DAC6A]/10 text-[#2DAC6A]", label: "Objectif atteint" }
  if (pct >= 50) return { color: "#F59600", bg: "#FDF5E6", badgeCls: "bg-[#F59600]/10 text-[#F59600]", label: "Résultats partiels" }
  return { color: "#E24B4A", bg: "#FEF0EF", badgeCls: "bg-red-50 text-red-600", label: "Objectif manqué" }
}

const barFill = (pct) => {
  if (pct == null) return "#D8D8D8"
  if (pct >= 80) return "#2DAC6A"
  if (pct >= 50) return "#F59600"
  return "#E24B4A"
}

const capPct = (pct) => (pct != null ? Math.min(pct, 100) : null)
const tendanceColor = (v) => (v == null ? "#ccc" : v >= 0 ? "#2DAC6A" : "#E24B4A")

const tendanceLabel = (v, prevYear) => {
  if (v == null) return "Données insuffisantes pour la comparaison annuelle"
  if (v > 0) return "Progression favorable d'une année sur l'autre"
  if (v < 0) return `Régression par rapport à ${prevYear}`
  return "Stagnation — gains stables"
}

const verdictIntro = (pct) => {
  if (pct >= 80) return "l'action a pleinement atteint ses objectifs avec "
  if (pct >= 50) return "l'action a partiellement atteint ses objectifs avec "
  return "l'action n'a pas atteint ses objectifs — seulement "
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ChartEmpty() {
  return <div className="flex items-center justify-center h-full text-sm text-gray-300">Aucune donnée disponible</div>
}

function TrendIcon({ value }) {
  if (value == null) return null
  return (
    <div className="mb-1.5 text-xl" style={{ color: tendanceColor(value) }}>
      {value > 0 ? <FiTrendingUp /> : value < 0 ? <FiTrendingDown /> : <FiMinus />}
    </div>
  )
}

function KpiCard({ label, value, unit, pct = null, ctx1, icon = null, valueColor = "#111" }) {
  const style = scoreStyle(pct)
  return (
    <div className="card-shadow p-6 flex items-start justify-between gap-6 w-full">
      {/* Left: title + description */}
      <div className="flex-1 min-w-0 max-w-1/2">
        <div className="mb-2">
          <span className="text-base font-semibold text-[#111]">{label}</span>
        </div>
        <div className="text-sm text-gray-600 leading-snug">
          {ctx1}
          {pct != null && <span className="font-semibold ml-1" style={{ color: style.color }}> · {capPct(pct)}% de l'objectif</span>}
        </div>
      </div>
      {/* Right: hero number */}
      <div className="text-right shrink-0">
        <div className="flex items-center justify-end gap-1.5">
          <div className="text-4xl font-extrabold leading-none tabular-nums" style={{ color: valueColor }}>
            {value}
          </div>
          {icon}
        </div>
        <div className="text-sm text-gray-500 mt-1.5 whitespace-nowrap">{unit}</div>
      </div>
    </div>
  )
}


function EmissionCard({ item }) {
  const isDown = item.totalChange != null && item.totalChange < 0
  const isUp = item.totalChange != null && item.totalChange > 0
  const changeColor = isDown ? "#2DAC6A" : isUp ? "#E24B4A" : "#999"

  if (!item.initiale && !item.currentLevel)
    return (
      <div className="card-shadow p-5 opacity-40">
        <div className="text-sm font-semibold text-[#111]">{item.name}</div>
        <div className="text-xs text-gray-400 mt-2">Données insuffisantes</div>
      </div>
    )

  return (
    <div className="card-shadow p-5">
      <div className="text-sm font-semibold text-[#111] mb-4">{item.name}</div>

      {/* Before → After */}
      <div className="flex items-center gap-2 mb-3">
        <div className="flex-1">
          <div className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">{item.startYear ?? "Départ"}</div>
          <div className="text-lg font-semibold tabular-nums text-gray-400">{item.initiale != null ? fmtNum(item.initiale) : "—"}</div>
          <div className="text-xs text-gray-400">{item.unit}</div>
        </div>
        <div className="text-gray-200 text-base shrink-0">→</div>
        <div className="flex-1 text-right">
          <div className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">{item.currentYear ?? "Actuel"}</div>
          <div className="text-2xl font-extrabold tabular-nums leading-none text-[#111]">{item.currentLevel != null ? fmtNum(item.currentLevel) : "—"}</div>
          <div className="text-xs text-gray-400">{item.unit}</div>
        </div>
      </div>

      {/* Change pill */}
      {item.totalChange != null && (
        <div className="flex items-center justify-between pt-3 border-t border-gray-50">
          <div className="text-sm font-bold tabular-nums" style={{ color: changeColor }}>
            {isDown ? "−" : isUp ? "+" : ""}{fmtNum(Math.abs(item.totalChange))} {item.unit}
          </div>
          <div className="text-xs text-gray-400">
            {isDown ? "réduit depuis le départ" : isUp ? "augmenté depuis le départ" : "stable"}
          </div>
        </div>
      )}

      {/* Counterfactual */}
      {item.actionImpact != null && item.actionImpact !== 0 && (
        <div className="mt-2 text-xs text-gray-400">
          Sans action : {fmtNum(item.currentRef)} {item.unit} · évité : <span className="font-semibold text-[#2DAC6A]">{fmtNum(Math.abs(item.actionImpact))} {item.unit}</span>
        </div>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function Dashboard({ action }) {
  const { userActionRights, user, collectivity } = useStore()
  const navigate = useNavigate()

  const [processedData, setProcessedData] = useState({ score: 0, indicators: {}, emissions: { indicators: {} } })
  const [loading, setLoading] = useState(false)
  const [tab, setTab] = useState("gains")
  const [activePill, setActivePill] = useState("GES")
  const [yearFrom, setYearFrom] = useState(action.date_start ? new Date(action.date_start).getFullYear() : null)
  const [yearTo, setYearTo] = useState(action.date_end ? new Date(action.date_end).getFullYear() : null)

  const isAdmin = user.role === "admin" || user.collectivities.some((c) => c.id === action.collectivity_id && c.role === "admin")
  const isEco = user.role === "economic_actor" && action.owner === "economic_actor" && user.economic_actor_id === action.economic_actor_id
  const right = userActionRights.find((r) => r.action_id === action._id)
  const canRead = isAdmin || isEco || right?.can_read
  const canWrite = isAdmin || isEco || right?.can_write

  const load = async () => {
    if (!collectivity || !action?.excel_worksheetname) return
    try {
      setLoading(true)
      const { ok, data, code } = await api.post("/excel/action_aggregation", {
        collectivity,
        action
      })
      if (!ok) return toast.error(code || "Erreur de chargement")
      setProcessedData(data)

      const allYrs = [...new Set(Object.values(data.indicators || {}).flatMap((ind) => ind.yearlyData?.map((d) => d.year) ?? []))].sort((a, b) => a - b)

      if (!allYrs.length) return

      const availK = Object.keys(data.indicators || {}).filter((k) => data.indicators[k]?.yearlyData?.length > 0)
      if (availK.length && !availK.includes(activePill)) setActivePill(availK[0])
    } catch (e) {
      toast.error(e.code || "Erreur de chargement")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [collectivity, action])

  // Guard clauses
  if (!canRead)
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-sm text-gray-500">Vous n'avez pas les droits pour accéder à cette action.</p>
      </div>
    )
  if (loading) return <Loader />

  // ── Derived: shared ───────────────────────────────────────────────────────

  const availKeys = Object.keys(processedData.indicators || {}).filter((k) => processedData.indicators[k]?.yearlyData?.length > 0)
  const active = availKeys.includes(activePill) ? activePill : (availKeys[0] ?? "GES")
  const activeLabel = INDICATORS.find((i) => i.key === active)?.label || active
  const activeUnit = processedData.indicators[active]?.unit || INDICATORS.find((i) => i.key === active)?.unit || ""

  const allYears = [...new Set(Object.values(processedData.indicators || {}).flatMap((ind) => ind.yearlyData?.map((d) => d.year) ?? []))].sort((a, b) => a - b)

  const periodMin = allYears[0] ?? new Date().getFullYear()
  const periodMax = allYears.at(-1) ?? new Date().getFullYear()
  const periodYears = Array.from({ length: periodMax - periodMin + 1 }, (_, i) => periodMin + i)

  // ── Derived: section 01 gains ─────────────────────────────────────────────

  const indData = processedData.indicators[active]

  // Full year range spanning the selected period (includes years with no data → null entries in charts)
  const periodStart = yearFrom ?? allYears[0]
  const periodEnd = yearTo ?? allYears.at(-1)
  const periodRange = periodStart && periodEnd ? Array.from({ length: periodEnd - periodStart + 1 }, (_, i) => periodStart + i) : allYears

  // filteredYearlyData: only actual data rows within the period (used for KPI calculations)
  const filteredYearlyData = (indData?.yearlyData ?? []).filter((d) => d.year >= periodStart && d.year <= periodEnd)

  // heroData: covers every year in the period; null for years with no data (keeps x-axis continuous)
  const gainsByYear = new Map((indData?.yearlyData ?? []).map((d) => [d.year, d]))
  const heroData = periodRange.map((year) => {
    const d = gainsByYear.get(year)
    if (!d) return { year, gainPrevu: null, gainRealise: null, pct: null }
    const prev = d.ecartPrevRef !== 0 ? Math.abs(d.ecartPrevRef) : null
    const real = d.ecartExpostRef !== 0 ? Math.abs(d.ecartExpostRef) : null
    return { year, gainPrevu: prev, gainRealise: real, pct: prev && real ? Math.round((real / prev) * 100) : null }
  })

  const latestD = [...filteredYearlyData].reverse().find((d) => d.ecartExpostRef !== 0)
  const latestGain = latestD ? Math.abs(latestD.ecartExpostRef) : null
  const latestPct = latestD && latestD.ecartPrevRef !== 0 ? Math.round((Math.abs(latestD.ecartExpostRef) / Math.abs(latestD.ecartPrevRef)) * 100) : null
  const latestYear = latestD?.year ?? null

  const cumulGain = filteredYearlyData.reduce((s, d) => s + (d.ecartExpostRef !== 0 ? Math.abs(d.ecartExpostRef) : 0), 0)

  const latestIdx = filteredYearlyData.findIndex((d) => d.year === latestYear)
  const prevD = latestIdx > 0 ? filteredYearlyData[latestIdx - 1] : null
  const prevGainAbs = prevD?.ecartExpostRef !== 0 ? Math.abs(prevD?.ecartExpostRef ?? 0) : null
  const gainTendance = latestGain != null && prevGainAbs != null ? latestGain - prevGainAbs : null

  // ── Derived: section 01 trajectories ─────────────────────────────────────

  // trajData: covers every year in the period; null for years with no data
  const trajRaw = processedData.emissions?.indicators?.[active]?.yearlyData ?? []
  const trajByYear = new Map(trajRaw.map((d) => [d.year, d]))
  const trajData = periodRange.map((year) => trajByYear.get(year) ?? { year, initiale: null, reference: null, previsionnelle: null, expost: null })
  const trajUnit = processedData.emissions?.indicators?.[active]?.unit || ""

  // ── Derived: section 01 émissions par situation ──────────────────────────

  const situationGroups = buildSituationGroups(action)
  const hydrateBar = (bar) => {
    const yearRow = trajByYear.get(bar.year)
    const value = yearRow ? yearRow[bar.dataKey] : null
    const fill = bar.type === "ref" && bar.linkedType ? SITUATION_COLORS[bar.linkedType] : SITUATION_COLORS[bar.type]
    return { ...bar, value, fill }
  }
  // Each chart row = one group (a category with up to 2 bars that touch via barGap=0)
  const situationChartData = situationGroups.map((group, gi) => {
    const hydrated = group.map(hydrateBar)
    const [b0, b1] = hydrated
    return {
      groupId: `g${gi}`,
      leftBar: b1 ? b0 : null,
      rightBar: b1 || b0,
      leftValue: b1 ? b0?.value ?? null : null,
      rightValue: (b1 || b0)?.value ?? null
    }
  })
  const situationBarsFlat = situationGroups.flat().map(hydrateBar)
  const hasSituationValues = situationBarsFlat.some((d) => d.value != null && d.value !== 0)

  // ── Derived: section 01 gains par situation ────────────────────────────────

  const gainChartData = buildGainBars(action, situationBarsFlat)

  // ── Derived: section 02 (niveaux d'émissions absolus) ───────────────────

  // selYear: last year with ex-post data — used only for trajectory reference line
  const selYear = allYears.filter((y) => Object.values(processedData.indicators || {}).some((ind) => ind.yearlyData?.find((d) => d.year === y)?.ecartExpostRef !== 0)).at(-1) ?? allYears.at(-1)

  const emissionProfile = availKeys.map((key) => {
    const emData = processedData.emissions?.indicators?.[key]?.yearlyData ?? []
    const unit = processedData.emissions?.indicators?.[key]?.unit || INDICATORS.find((i) => i.key === key)?.unit || ""
    const ind = INDICATORS.find((i) => i.key === key)

    const firstRow = emData.find((d) => d.initiale > 0)
    const latestRow = [...emData].reverse().find((d) => d.expost > 0)

    const initiale = firstRow?.initiale ?? null
    const startYear = firstRow?.year ?? null
    const currentLevel = latestRow?.expost ?? null
    const currentRef = latestRow?.reference ?? null
    const currentYear = latestRow?.year ?? null
    const totalChange = initiale != null && currentLevel != null ? currentLevel - initiale : null
    const actionImpact = currentRef != null && currentLevel != null ? currentRef - currentLevel : null

    return { key, name: ind?.label || key, unit, initiale, startYear, currentLevel, currentRef, currentYear, totalChange, actionImpact }
  })

  const gesProfile = emissionProfile.find((p) => p.key === "GES") ?? emissionProfile[0]

  // ── Tooltip renderers (closures) ──────────────────────────────────────────

  const gainsTooltip = ({ active: a, payload, label }) => {
    if (!a || !payload?.length) return null
    const entry = heroData.find((d) => d.year === label)
    return (
      <div className="bg-white border border-gray-100 rounded-xl shadow-lg p-4 text-xs space-y-2">
        <div className="font-bold text-[#111] text-sm">Année {label}</div>
        {payload.map((p) => (
          <div key={p.dataKey} className="flex items-center justify-between gap-6">
            <span className="text-gray-500">{p.name}</span>
            <span className="font-semibold text-[#333] tabular-nums">{p.value != null ? `${fmtNum(p.value)} ${activeUnit}` : "—"}</span>
          </div>
        ))}
        {entry?.pct != null && (
          <div className="pt-2 border-t border-gray-100 flex items-center justify-between gap-6">
            <span className="text-gray-400">Atteinte objectif</span>
            <span className="font-bold tabular-nums" style={{ color: barFill(entry.pct) }}>
              {capPct(entry.pct)}%
            </span>
          </div>
        )}
      </div>
    )
  }

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-8xl mx-auto px-6 sm:px-8 lg:px-10 py-10 space-y-8">
      {/* ── HEADER ─────────────────────────────────────────────────────────── */}
      <header>
        <div className="flex items-center gap-2 mb-4">
          <button onClick={() => navigate(-1)} className="p-1.5 rounded-full hover:bg-gray-100 text-gray-400 transition-colors">
            <FiArrowLeft size={17} />
          </button>
          <span className="text-xs px-2.5 py-1 rounded-full bg-primary-green/10 text-primary-green font-semibold">{action.sector || "Action"}</span>
          {action.territory && <span className="text-xs text-gray-400">{action.territory}</span>}
        </div>
        <div className="flex items-start justify-between gap-6">
          <div>
            <h1 className="text-3xl font-bold text-[#111] tracking-tight">
              {action.name}{action.instance_number > 1 && <span className="text-lg font-medium text-gray-400 ml-2">#{action.instance_number}</span>}
            </h1>
            <p className="text-sm text-gray-500 mt-2">
              Période d'observation :{" "}
              <span className="font-medium text-gray-700">
                {action.date_start ? new Date(action.date_start).getFullYear() : "—"} – {action.date_end ? new Date(action.date_end).getFullYear() : "—"}
              </span>
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0 mt-1">
            <button
              onClick={() => navigate(`/actions/${action._id}/completion`)}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors font-medium"
            >
              <FiEdit size={14} /> Compléter
            </button>
            {canWrite && (
              <button onClick={() => navigate(`/actions/${action._id}/settings`)} className="button-primary flex items-center gap-2">
                <FiPlus size={14} /> Modifier
              </button>
            )}
          </div>
        </div>

        {/* Completion des 4 situations */}
        <div className="flex items-center gap-2 mt-3">
          {[
            { key: "init", label: "Init." },
            { key: "ref", label: "Réf." },
            { key: "prev", label: "Prév." },
            { key: "expost", label: "Ex-post" }
          ].map((s) => {
            const pct = action[`completion_${s.key}`] || 0
            const color = pct >= 80 ? "#2DAC6A" : pct >= 50 ? "#F59600" : pct > 0 ? "#E24B4A" : "#D8D8D8"
            return (
              <div key={s.key} className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-gray-50 border border-gray-100">
                <span className="text-[11px] text-gray-400">{s.label}</span>
                <div className="w-10 h-1 bg-gray-200 rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
                </div>
                <span className="text-[11px] font-semibold tabular-nums" style={{ color }}>{pct}%</span>
              </div>
            )
          })}
        </div>
      </header>

      {/* ── SECTION 01 — VUE GLOBALE ─────────────────────────────────────── */}
      <section>
        {/* Filter bar */}
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-gray-100 bg-white shadow-sm mb-7 flex-wrap">
          <div className="flex bg-gray-100 rounded-lg p-0.5">
            {[
              { k: "gains", l: "Gains réalisés" },
              { k: "traj", l: "Trajectoires" },
              { k: "situations", l: "Émissions par situation" }
            ].map((t) => (
              <button
                key={t.k}
                onClick={() => setTab(t.k)}
                className={`px-4 py-2 text-sm rounded-md font-medium transition-all whitespace-nowrap ${t.k === tab ? "bg-white shadow-sm text-[#111]" : "text-gray-500 hover:text-gray-700"}`}
              >
                {t.l}
              </button>
            ))}
          </div>

          <div className="h-5 w-px bg-gray-200 mx-1" />

          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500 whitespace-nowrap">Polluant</span>
            <select value={active} onChange={(e) => setActivePill(e.target.value)} className="input-primary !py-2 !pl-3 text-sm cursor-pointer font-medium">
              {availKeys.map((k) => (
                <option key={k} value={k}>
                  {INDICATORS.find((i) => i.key === k)?.label || k}
                </option>
              ))}
            </select>
          </div>

          <div className="h-5 w-px bg-gray-200 mx-1" />
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500 whitespace-nowrap">Période</span>
            <select value={yearFrom ?? ""} onChange={(e) => setYearFrom(parseInt(e.target.value))} className="input-primary !py-2 !pl-3 text-sm cursor-pointer">
              {periodYears
                .filter((y) => !yearTo || y <= yearTo - 1)
                .map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
            </select>
            <span className="text-gray-300">→</span>
            <select value={yearTo ?? ""} onChange={(e) => setYearTo(parseInt(e.target.value))} className="input-primary !py-2 !pl-3 text-sm cursor-pointer">
              {periodYears
                .filter((y) => !yearFrom || y >= yearFrom + 1)
                .map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
            </select>
          </div>
        </div>

        {/* Tab: Gains */}
        {tab === "gains" && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <KpiCard
                label={`Gain réalisé en ${latestYear ?? "—"}`}
                value={fmtNum(latestGain)}
                unit={`${activeUnit} / an`}
                pct={latestPct}
                ctx1={latestD ? `Réduction ex-post vs. référence — objectif : ${fmtNum(Math.abs(latestD.ecartPrevRef))} ${activeUnit}` : "Aucune donnée ex-post disponible"}
              />
              <KpiCard
                label="Gain cumulé"
                value={fmtNum(cumulGain)}
                unit={`${activeUnit} total`}
                ctx1={`Cumul des réductions sur ${filteredYearlyData.length} an${filteredYearlyData.length > 1 ? "s" : ""}, de ${yearFrom ?? allYears[0] ?? "—"} à ${yearTo ?? allYears.at(-1) ?? "—"}.`}
              />
            </div>

            <div className="card-shadow p-6">
              <div className="flex items-start justify-between mb-6 gap-4">
                <div>
                  <h3 className="text-base font-semibold text-[#111]">Gains annuels réalisés vs. objectif</h3>
                  <p className="text-sm text-gray-500 mt-0.5">Chaque barre représente la réduction effective. La ligne pointillée indique l'objectif prévisionnel.</p>
                </div>
                <div className="flex gap-5 flex-wrap justify-end shrink-0">
                  {[
                    { color: "#2DAC6A", label: "≥ 80% objectif" },
                    { color: "#F59600", label: "50–80%" },
                    { color: "#E24B4A", label: "< 50%" },
                    { color: "#C8C8C8", label: "Objectif prévu", dash: true }
                  ].map((l) => (
                    <div key={l.label} className="flex items-center gap-1.5 text-xs text-gray-500">
                      {l.dash ? (
                        <div className="w-5 flex-shrink-0 border-t-2 border-dashed" style={{ borderColor: l.color }} />
                      ) : (
                        <span className="w-3 h-3 rounded-sm flex-shrink-0" style={{ background: l.color }} />
                      )}
                      {l.label}
                    </div>
                  ))}
                </div>
              </div>
              <div className="h-[280px]">
                {heroData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={heroData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.04)" />
                      <XAxis dataKey="year" tick={{ fontSize: 11, fill: "#C0C0C0" }} />
                      <YAxis tick={{ fontSize: 11, fill: "#C0C0C0" }} tickFormatter={fmtAxis} width={52} />
                      <Tooltip content={gainsTooltip} />
                      <Bar dataKey="gainRealise" name="Gain réalisé" radius={[3, 3, 0, 0]} maxBarSize={40}>
                        {heroData.map((entry, i) => (
                          <Cell key={i} fill={barFill(entry.pct)} />
                        ))}
                      </Bar>
                      <Line type="monotone" dataKey="gainPrevu" name="Objectif prévu" stroke="#C8C8C8" strokeWidth={2} strokeDasharray="5 3" dot={false} connectNulls />
                    </ComposedChart>
                  </ResponsiveContainer>
                ) : (
                  <ChartEmpty />
                )}
              </div>
            </div>
          </div>
        )}

        {/* Tab: Trajectoires */}
        {tab === "traj" && (
          <div className="card-shadow p-6">
            <div className="flex items-center gap-5 mb-6 flex-wrap">
              <h3 className="text-base font-semibold text-[#111]">Trajectoires d'émissions</h3>
              <div className="flex gap-5 ml-auto">
                {TRAJ_SERIES.map((s) => (
                  <div key={s.key} className="flex items-center gap-2 text-xs text-gray-500">
                    <div className="w-5 flex-shrink-0" style={{ borderTop: `2px ${s.dash ? "dashed" : "solid"} ${s.color}` }} />
                    {s.label}
                  </div>
                ))}
              </div>
            </div>
            <div className="h-[320px]">
              {trajData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={trajData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.04)" />
                    <XAxis dataKey="year" tick={{ fontSize: 11, fill: "#C0C0C0" }} interval="preserveStartEnd" />
                    <YAxis tick={{ fontSize: 11, fill: "#C0C0C0" }} tickFormatter={fmtAxis} width={52} />
                    <Tooltip
                      formatter={(v, name) => [`${fmtNum(v)} ${trajUnit}`, TRAJ_SERIES.find((s) => s.key === name)?.label || name]}
                      labelFormatter={(l) => `Année ${l}`}
                      contentStyle={{ fontSize: 12, border: "1px solid #f0f0f0", borderRadius: 10, boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }}
                    />
                    <ReferenceLine
                      x={selYear}
                      stroke="#2DAC6A"
                      strokeWidth={1.5}
                      strokeDasharray="5 3"
                      label={{ value: String(selYear), position: "insideTopRight", fontSize: 10, fill: "#2DAC6A" }}
                    />
                    <Line type="monotone" dataKey="initiale" stroke="#C8C8C8" strokeWidth={1.5} dot={false} />
                    <Line type="monotone" dataKey="reference" stroke="#4A86C8" strokeWidth={1.5} dot={false} />
                    <Line type="monotone" dataKey="previsionnelle" stroke="#F59600" strokeWidth={2} strokeDasharray="5 3" dot={false} />
                    <Line type="monotone" dataKey="expost" stroke="#2DAC6A" strokeWidth={2.5} dot={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              ) : (
                <ChartEmpty />
              )}
            </div>
          </div>
        )}

        {/* Tab: Émissions par situation */}
        {tab === "situations" && (
          <div className="space-y-6">
          <div className="card-shadow p-6">
            <div className="flex items-center gap-5 mb-6 flex-wrap">
              <h3 className="text-base font-semibold text-[#111]">Émissions par situation</h3>
              <div className="flex gap-5 ml-auto">
                {Object.entries(SITUATION_COLORS).map(([type, color]) => (
                  <div key={type} className="flex items-center gap-1.5 text-xs text-gray-500">
                    <span className="w-3 h-3 rounded-sm flex-shrink-0" style={{ background: color }} />
                    {SITUATION_LABELS[type]}
                  </div>
                ))}
              </div>
            </div>
            <div className="h-[360px]">
              {hasSituationValues ? (
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={situationChartData} margin={{ top: 4, right: 8, bottom: 48, left: 0 }} barCategoryGap="30%" barGap={1.5}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.04)" />
                    <XAxis
                      dataKey="groupId"
                      tick={({ x, y, payload }) => {
                        const item = situationChartData.find((d) => d.groupId === payload.value)
                        if (!item) return <g />
                        const hasPair = !!item.leftBar
                        if (hasPair) {
                          const leftLabel = SITUATION_LABELS_SHORT[item.leftBar.type] || ""
                          const rightLabel = SITUATION_LABELS_SHORT[item.rightBar.type] || ""
                          const year = item.rightBar.year || item.leftBar.year || ""
                          return (
                            <g transform={`translate(${x},${y})`}>
                              <text x={0} y={0} dy={14} textAnchor="middle" fontSize={13} fontWeight={500}>
                                <tspan fill={item.leftBar.fill || SITUATION_COLORS[item.leftBar.type]}>{leftLabel}</tspan>
                                <tspan fill="#999"> / </tspan>
                                <tspan fill={item.rightBar.fill || SITUATION_COLORS[item.rightBar.type]}>{rightLabel}</tspan>
                              </text>
                              <text x={0} y={0} dy={32} textAnchor="middle" fill="#333" fontSize={14} fontWeight={600}>
                                {year}
                              </text>
                            </g>
                          )
                        }
                        const bar = item.rightBar
                        const labelColor = bar.fill || SITUATION_COLORS[bar.type] || "#C0C0C0"
                        return (
                          <g transform={`translate(${x},${y})`}>
                            <text x={0} y={0} dy={14} textAnchor="middle" fill={labelColor} fontSize={13} fontWeight={500}>
                              {SITUATION_LABELS[bar.type] || ""}
                            </text>
                            <text x={0} y={0} dy={32} textAnchor="middle" fill="#333" fontSize={14} fontWeight={600}>
                              {bar.year || ""}
                            </text>
                          </g>
                        )
                      }}
                      interval={0}
                    />
                    <YAxis tick={{ fontSize: 11, fill: "#C0C0C0" }} tickFormatter={fmtAxis} width={52} />
                    <Tooltip
                      cursor={{ fill: "rgba(0,0,0,0.02)" }}
                      content={({ active: a, payload }) => {
                        if (!a || !payload?.length) return null
                        const row = payload[0]?.payload
                        if (!row) return null
                        const bars = [row.leftBar, row.rightBar].filter(Boolean)
                        if (!bars.length) return null
                        return (
                          <div className="bg-white border border-gray-100 rounded-xl shadow-lg p-4 text-xs space-y-3">
                            {bars.map((b, i) => (
                              <div key={i} className="space-y-1">
                                <div className="font-bold text-sm" style={{ color: b.fill || SITUATION_COLORS[b.type] }}>
                                  {SITUATION_LABELS[b.type]} — {b.year}
                                </div>
                                <div className="flex items-center justify-between gap-6">
                                  <span className="text-gray-500">{activeLabel}</span>
                                  <span className="font-semibold text-[#333] tabular-nums">{b.value != null ? `${fmtNum(b.value)} ${trajUnit}` : "—"}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )
                      }}
                    />
                    <Bar dataKey="leftValue" name={activeLabel} radius={[4, 4, 0, 0]} maxBarSize={36}>
                      {situationChartData.map((entry, i) => (
                        <Cell key={i} fill={entry.leftBar?.fill || "transparent"} />
                      ))}
                    </Bar>
                    <Bar dataKey="rightValue" name={activeLabel} radius={[4, 4, 0, 0]} maxBarSize={36}>
                      {situationChartData.map((entry, i) => (
                        <Cell key={i} fill={entry.rightBar?.fill || "transparent"} />
                      ))}
                    </Bar>
                  </ComposedChart>
                </ResponsiveContainer>
              ) : (
                <ChartEmpty />
              )}
            </div>
          </div>

          {/* Gains entre situations */}
          <div className="card-shadow p-6 mt-6">
            <div className="flex items-center gap-5 mb-6 flex-wrap">
              <h3 className="text-base font-semibold text-[#111]">Gains entre situations</h3>
              <p className="text-sm text-gray-500">Écart d'émissions entre chaque situation et sa référence — valeurs positives = réduction</p>
              <div className="flex gap-5 ml-auto">
                {Object.entries(GAIN_COLORS).map(([type, color]) => (
                  <div key={type} className="flex items-center gap-1.5 text-xs text-gray-500">
                    <span className="w-3 h-3 rounded-sm flex-shrink-0" style={{ background: color }} />
                    {GAIN_LABELS[type]}
                  </div>
                ))}
              </div>
            </div>
            <div className="h-[360px]">
              {gainChartData.length > 0 && gainChartData.some((d) => d.value != null) ? (
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={gainChartData} margin={{ top: 24, right: 8, bottom: 40, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.04)" />
                    <XAxis
                      dataKey="label"
                      tick={({ x, y, payload }) => {
                        const item = gainChartData.find((d) => d.label === payload.value)
                        const lines = (payload.value || "").split("\n")
                        return (
                          <g transform={`translate(${x},${y})`}>
                            <text x={0} y={0} dy={14} textAnchor="middle" fill={item ? item.fill : "#C0C0C0"} fontSize={13} fontWeight={500}>
                              {lines[0] || ""}
                            </text>
                            <text x={0} y={0} dy={32} textAnchor="middle" fill="#333" fontSize={14} fontWeight={600}>
                              {lines[1] || ""}
                            </text>
                          </g>
                        )
                      }}
                      interval={0}
                    />
                    <YAxis tick={{ fontSize: 11, fill: "#C0C0C0" }} tickFormatter={fmtAxis} width={52} />
                    <ReferenceLine y={0} stroke="#E0E0E0" strokeWidth={1} />
                    <Tooltip
                      content={({ active: a, payload }) => {
                        if (!a || !payload?.length) return null
                        const d = payload[0]?.payload
                        if (!d) return null
                        return (
                          <div className="bg-white border border-gray-100 rounded-xl shadow-lg p-4 text-xs space-y-2">
                            <div className="font-bold text-sm" style={{ color: d.fill }}>
                              {GAIN_LABELS[d.compType]} — {d.year}
                            </div>
                            <div className="flex items-center justify-between gap-6">
                              <span className="text-gray-500">Gain ({activeLabel})</span>
                              <span className="font-semibold text-[#333] tabular-nums">{fmtSigned(d.value)} {trajUnit}</span>
                            </div>
                            {d.pct != null && (
                              <div className="flex items-center justify-between gap-6 pt-1 border-t border-gray-100">
                                <span className="text-gray-400">Variation</span>
                                <span className="font-bold tabular-nums" style={{ color: d.fill }}>{d.pct >= 0 ? "+" : ""}{d.pct.toFixed(1)}%</span>
                              </div>
                            )}
                          </div>
                        )
                      }}
                    />
                    <Bar
                      dataKey="value"
                      name="Gain"
                      radius={[4, 4, 0, 0]}
                      maxBarSize={60}
                      label={({ x, y, width, value, index }) => {
                        const d = gainChartData[index]
                        if (d?.pct == null) return null
                        const pctText = `${d.pct >= 0 ? "+" : ""}${d.pct.toFixed(1)}%`
                        return (
                          <text x={x + width / 2} y={value >= 0 ? y - 6 : y + 18} textAnchor="middle" fill={d.fill} fontSize={11} fontWeight={700}>
                            {pctText}
                          </text>
                        )
                      }}
                    >
                      {gainChartData.map((entry, i) => (
                        <Cell key={i} fill={entry.fill} />
                      ))}
                    </Bar>
                  </ComposedChart>
                </ResponsiveContainer>
              ) : (
                <ChartEmpty />
              )}
            </div>
          </div>
          </div>
        )}
      </section>

      {/* ── SECTION 02 — NIVEAUX D'ÉMISSIONS ───────────────────────────── */}
      <section>
        <div className="mb-6">
          <h2 className="text-xl font-bold text-[#111] tracking-tight">Niveaux d'émissions</h2>
          <p className="text-sm text-gray-500 mt-1">Évolution réelle des émissions depuis le lancement — niveaux absolus mesurés</p>
        </div>

        {/* GES headline */}
        {gesProfile?.currentLevel != null && (
          <div className="card-shadow p-6 mb-6">
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-4">{gesProfile.name}</div>
            <div className="flex items-center gap-8">
              <div>
                <div className="text-xs text-gray-400 mb-1">Niveau de départ ({gesProfile.startYear})</div>
                <div className="text-3xl font-bold tabular-nums text-gray-400">{fmtNum(gesProfile.initiale)}</div>
                <div className="text-sm text-gray-400">{gesProfile.unit}</div>
              </div>
              <div className="text-2xl text-gray-200">→</div>
              <div>
                <div className="text-xs text-gray-400 mb-1">Niveau mesuré ({gesProfile.currentYear})</div>
                <div className="text-5xl font-extrabold tabular-nums leading-none text-[#111]">{fmtNum(gesProfile.currentLevel)}</div>
                <div className="text-sm text-gray-500 mt-1">{gesProfile.unit}</div>
              </div>
              {gesProfile.totalChange != null && (
                <div className="ml-auto text-right">
                  <div className="text-xs text-gray-400 mb-1">Variation totale</div>
                  <div className="text-3xl font-extrabold tabular-nums" style={{ color: gesProfile.totalChange < 0 ? "#2DAC6A" : "#E24B4A" }}>
                    {gesProfile.totalChange < 0 ? "−" : "+"}{fmtNum(Math.abs(gesProfile.totalChange))}
                  </div>
                  <div className="text-sm text-gray-400">{gesProfile.unit}</div>
                  {gesProfile.actionImpact != null && gesProfile.actionImpact !== 0 && (
                    <div className="mt-2 text-xs text-gray-400">
                      Sans action : {fmtNum(gesProfile.currentRef)} {gesProfile.unit}
                      <br />
                      <span className="font-semibold text-[#2DAC6A]">{fmtNum(Math.abs(gesProfile.actionImpact))} {gesProfile.unit} évités</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Other pollutants */}
        <div className="grid grid-cols-3 gap-4">
          {emissionProfile.filter((p) => p.key !== "GES").map((item) => (
            <EmissionCard key={item.key} item={item} />
          ))}
        </div>
      </section>
    </div>
  )
}
