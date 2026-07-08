import React, { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import api from "@/services/api"
import toast from "react-hot-toast"
import useStore from "@/services/store"

// ============================================================================
// Métadonnées d'affichage par clé d'indicateur renvoyée par /excel/home_aggregation
// ============================================================================

const META = {
  GES: { short: "GES", label: "Gaz à effet de serre" },
  PM: { short: "PM", label: "Particules fines" },
  NOx: { short: "NOₓ", label: "Oxydes d'azote" },
  HC: { short: "HC", label: "Hydrocarbures" },
  CO: { short: "CO", label: "Monoxyde de carbone" },
  Nrj: { short: "Énergie", label: "Énergie consommée" },
}

const PALETTE = ["#0A3641", "#1A6E5A", "#2DAC6A", "#56BDB8", "#7FCEC0", "#A4DDB7", "#C8E8B6", "#E5BD7A", "#D88E5A", "#B86F4F", "#8B5E3C"]

const fmtNum = (v) => {
  if (v == null) return "—"
  const abs = Math.abs(v)
  if (abs >= 1_000_000) return `${(v / 1_000_000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} M`
  if (abs >= 10_000) return `${(v / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} k`
  return v.toLocaleString("fr-FR", { maximumFractionDigits: abs >= 100 ? 0 : abs >= 1 ? 2 : 3 })
}

const fmtSigned = (v, decimals = 1) => {
  if (v == null) return "—"
  return `${v > 0 ? "+" : ""}${v.toLocaleString("fr-FR", { maximumFractionDigits: decimals })}`
}



const ecart = (situation, reference) => (situation ? situation - reference : 0)

const buildIndicators = (emissions) =>
  Object.entries(emissions || {}).map(([key, em]) => {
    const byYear = new Map()
    for (const a of em.actions) for (const d of a.yearly) {
      const acc = byYear.get(d.year) || { prev: 0, reel: 0 }
      acc.prev += d.previsionnelle || 0
      acc.reel += d.expost || 0
      byYear.set(d.year, acc)
    }
    let cumPrev = 0
    let cumReel = 0
    const yearly = [...byYear.keys()].sort((a, b) => a - b).map((year) => {
      cumPrev += byYear.get(year).prev
      cumReel += byYear.get(year).reel
      return { year, prev: Math.abs(cumPrev), reel: Math.abs(cumReel) }
    })
    const firstIdx = yearly.findIndex((d) => d.prev !== 0 || d.reel !== 0)
    return {
      key,
      unit: em.unit,
      ...(META[key] || { short: key, label: key }),
      targetCumul: Math.abs(cumPrev),
      realCumul: Math.abs(cumReel),
      advancement: Math.abs(cumPrev) > 0 ? (Math.abs(cumReel) / Math.abs(cumPrev)) * 100 : 0,
      ecartRelatif: Math.abs(cumPrev) > 0 ? ((Math.abs(cumReel) - Math.abs(cumPrev)) / Math.abs(cumPrev)) * 100 : 0,
      yearly: firstIdx >= 0 ? yearly.slice(firstIdx) : [],
    }
  })

const buildContributions = (em) =>
  (em?.actions || []).map((a) => ({
    action: a.code,
    name: a.name,
    ges: a.yearly.reduce((s, d) => s + ecart(d.expost, d.reference), 0),
    ges_prev: a.yearly.reduce((s, d) => s + ecart(d.previsionnelle, d.reference), 0),
  }))

// Graphe : barres = émissions ex-post réelles par action/année, ligne = total prévisionnel par année.
const buildEmissionChart = (em) => {
  const actions = em?.actions || []
  const yearSet = new Set()
  for (const a of actions) for (const d of a.yearly) if (d.expost || d.previsionnelle) yearSet.add(d.year)
  const years = [...yearSet].sort((a, b) => a - b)
  return {
    years,
    actions: actions
      .map((a) => ({ code: a.code, name: a.name, yearly: years.map((y) => ({ year: y, value: a.yearly.find((d) => d.year === y)?.expost || 0 })) }))
      .filter((a) => a.yearly.some((d) => d.value > 0)),
    prevByYear: years.map((y) => ({ year: y, value: actions.reduce((s, a) => s + (a.yearly.find((d) => d.year === y)?.previsionnelle || 0), 0) })),
    refByYear: years.map((y) => ({ year: y, value: actions.reduce((s, a) => s + (a.yearly.find((d) => d.year === y)?.reference || 0), 0) })),
  }
}


export default function Home() {
  const { collectivity } = useStore()
  const navigate = useNavigate()
  const [activeIndicator, setActiveIndicator] = useState("GES")
  const [data, setData] = useState(null)
  const [allActions, setAllActions] = useState([])
  const [ready, setReady] = useState(false)
  const [loadingData, setLoadingData] = useState(false)

  const fetchHomeAggregation = async () => {
    try {
      setLoadingData(true)
      const { ok, data } = await api.post("/excel/home_aggregation", { collectivity })
      console.log(data)
      if (!ok) return
      setData(data)
    } catch (error) {
      console.error(error)
    } finally {
      setLoadingData(false)
    }
  }

  const fetchActions = async () => {
    try {
      const { ok, data, code } = await api.post("/action/search", { collectivity_id: collectivity._id, limit: 1000 })
      if (!ok) return toast.error(code || "Impossible de charger les actions")
      setAllActions(data)
    } catch (error) {
      toast.error(error.code || "Impossible de charger les actions")
    } finally {
      setReady(true)
    }
  }

  useEffect(() => {
    if (!collectivity) return
    setReady(false)
    setData(null)
    setAllActions([])
    setLoadingData(true)
    const load = async () => {
      await fetchActions()
      await fetchHomeAggregation()
    }
    load()
  }, [collectivity])

  if (!collectivity || !ready) return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-lg text-gray-600">Chargement…</div>
    </div>
  )

  const onboardingSteps = [
    { label: "Créer votre première action", done: allActions.length > 0, link: "/actions" },
    { label: "Remplir votre première action B2 à 100% (situation ex-post comprise)", done: allActions.some((a) => a.status === "completed" && a.completion_expost === 100), link: allActions[0] ? `/actions/${allActions[0]._id}/completion` : "/actions" },
  ]

  const indicators = data ? buildIndicators(data.emissions) : []
  if (data) console.table((data.emissions?.GES?.actions?.[0]?.yearly || []).filter((d) => d.year >= 2020 && d.year <= 2028))
  const indicator = indicators.find((i) => i.key === activeIndicator) || indicators[0]
  const ges = indicators.find((i) => i.key === "GES") || indicator
  const advancement = ges?.advancement || 0
  const traj = indicator?.yearly || []
  const yearExpost = [...traj].reverse().find((d) => d.reel > 0)?.year

  const contributions = data ? buildContributions(data.emissions.GES) : []
  const topActions = [...contributions].filter((a) => a.ges < 0).sort((a, b) => a.ges - b.ges).slice(0, 5)
  const maxAction = Math.max(...contributions.map((a) => Math.abs(a.ges_prev)), 1)
  const nbRetard = indicators.filter((i) => i.ecartRelatif < 0).length

  return (
    <div className="bg-white">
      <div className="relative z-10 max-w-[1280px] mx-auto px-8 py-8" style={{ fontFamily: "'Source Sans Pro', sans-serif" }}>
        {/* Header */}
        <div className="mb-5">
          <h1 className="text-font-primary text-4xl">
            Tableau de bord <span className="font-bold text-primary-green">{collectivity.name}</span>
          </h1>
        </div>

        {/* Onboarding */}
        {!onboardingSteps.every((s) => s.done) && (
          <div className="card-shadow rounded-2xl p-5 mb-6 bg-white border border-[#D9EFE3]">
            <SectionLabel sub="Quelques étapes pour bien démarrer">Pour bien démarrer</SectionLabel>
            <div className="flex flex-col gap-2">
              {onboardingSteps.map((step, i) => (
                <button
                  key={i}
                  onClick={() => navigate(step.link)}
                  className="flex items-center gap-3 text-left px-2 py-2 rounded-lg hover:bg-[#F9FFFC] transition-colors cursor-pointer"
                >
                  <span className={`shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold ${step.done ? "bg-primary-green text-white" : "border-2 border-[#D9EFE3] text-[#9CA3AF]"}`}>
                    {step.done ? "✓" : i + 1}
                  </span>
                  <span className={`text-[14px] ${step.done ? "line-through text-[#9CA3AF]" : "text-font-primary font-medium"}`}>{step.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {onboardingSteps.every((s) => s.done) && (
        <>
        {loadingData && !data && <DashboardSkeleton />}

        {data && indicator && (
        <>
        {/* Hero narratif */}
        <div className="rounded-[20px] p-8 mb-6 border" style={{ background: "linear-gradient(135deg, #F9FFFC 0%, #fff 60%)", borderColor: "#D9EFE3" }}>
          <div className="grid grid-cols-[1fr_280px] gap-8 items-center">
            <div>
              <h2 className="text-[26px] font-semibold leading-[1.25] tracking-tight max-w-[640px] text-font-primary m-0">
                Vous avez réalisé <span className="text-primary-green font-bold">{Math.round(advancement)} %</span> du gain GES prévu,
                soit <span className="font-bold">{fmtNum(ges.realCumul)} {ges.unit}</span> évitées sur {fmtNum(ges.targetCumul)} attendues.
              </h2>
              <p className="text-[15px] text-[#768776] leading-[1.55] mt-3.5 mb-0 max-w-[640px]">
                <strong className="text-font-primary">{nbRetard} indicateur{nbRetard > 1 ? "s" : ""} sur {indicators.length}</strong> sont en retard sur leur cible cumulée.
              </p>
            </div>
            <div className="flex justify-center">
              <ProgressDonut value={advancement} size={200} stroke={20} label="de la cible" sub="atteinte" color={advancement >= 90 ? "#2DAC6A" : advancement >= 70 ? "#F59600" : "#FB6B69"} />
            </div>
          </div>
        </div>

        {/* Indicateurs */}
        <div className="mb-6">
          <SectionLabel sub="Cliquez pour explorer la trajectoire d'un indicateur">
            Que disent les indicateurs ?
          </SectionLabel>
          <div className="grid grid-cols-3 gap-3.5">
            {indicators.map((ind) => (
              <button
                key={ind.key}
                onClick={() => setActiveIndicator(ind.key)}
                className={`bg-white rounded-[14px] p-4 text-left cursor-pointer transition-all ${activeIndicator === ind.key ? "border-2 border-primary-green" : "border border-[#e1e5e8] hover:border-primary-green/40"}`}
              >
                <div className="flex justify-between mb-2">
                  <span className="text-[13px] font-semibold text-font-primary">{ind.label}</span>
                  <DeltaPill value={ind.ecartRelatif} suffix="%" size="sm" />
                </div>
                <div className="text-[13px] text-[#768776] leading-[1.4]">
                  Réalisé <strong className="text-font-primary font-bold">{fmtNum(ind.realCumul)} {ind.unit}</strong>
                  {" "}vs cible <strong className="text-font-primary">{fmtNum(ind.targetCumul)}</strong>
                  {ind.ecartRelatif > 0 ? " · objectif dépassé" : ` · ${Math.round(ind.advancement)}% de la cible`}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Trajectoire */}
        <div className="card-shadow rounded-2xl p-6 mb-6 bg-white">
          <div className="flex justify-between mb-3">
            <div>
              <h3 className="text-[16px] font-semibold m-0 text-font-primary">Émissions {indicator.label}</h3>
              <p className="text-[12px] text-[#768776] mt-1 mb-0">
                Les barres sont des projections établies à partir des valeurs ex-post mesurées, décomposées par action. Les pointillés indiquent les trajectoires de référence et prévisionnelle.
              </p>
            </div>
            <IndicatorPicker active={activeIndicator} onChange={setActiveIndicator} indicators={indicators} />
          </div>
          <StackedActionsChart emissions={buildEmissionChart(data.emissions[indicator.key])} unit={indicator.unit} yearExpost={yearExpost} />
        </div>
        </>
        )}

        {/* Bas — 2 colonnes */}
        <div className="grid grid-cols-[2fr_1fr] gap-5 mb-8">
          <div className="card-shadow rounded-2xl p-6 bg-white">
            <SectionLabel sub="Classement par gain GES réel — cumulé sur la période">
              Top 5 actions contributrices
            </SectionLabel>
            {topActions.length ? (
              <div>
                {topActions.map((a) => (
                  <ActionBar key={a.action} action={a} max={maxAction} />
                ))}
              </div>
            ) : (
              <div className="text-[13px] text-[#768776] py-6">Aucune action contributrice pour l'instant.</div>
            )}
          </div>

          <div className="flex flex-col gap-4">
            <div className="card-shadow rounded-2xl p-6 bg-white">
              <SectionLabel>Portefeuille d'actions</SectionLabel>
              <div className="grid grid-cols-2 gap-3">
                <StatBlock value={allActions.length} label="Actions totales" />
                <StatBlock value={allActions.filter((a) => a.status === "in_progress").length} label="En cours" color="#F59600" />
                <StatBlock value={allActions.filter((a) => a.status === "completed").length} label="Terminées" color="#2DAC6A" />
                <StatBlock value={allActions.filter((a) => a.status === "blocked").length} label="Bloquées" color="#FB6B69" />
              </div>
            </div>
          </div>
        </div>
        </>
        )}
      </div>
    </div>
  )
}

function DashboardSkeleton() {
  return (
    <div className="animate-pulse">
      {/* Hero */}
      <div className="rounded-[20px] p-8 mb-6 border border-[#D9EFE3] bg-[#F9FFFC]">
        <div className="grid grid-cols-[1fr_280px] gap-8 items-center">
          <div className="space-y-3">
            <div className="h-3 w-48 bg-[#D9EFE3] rounded" />
            <div className="h-6 w-full max-w-[560px] bg-[#E5EDE9] rounded" />
            <div className="h-6 w-3/4 bg-[#E5EDE9] rounded" />
            <div className="h-4 w-1/2 bg-[#EAF0ED] rounded" />
          </div>
          <div className="flex justify-center">
            <div className="w-[200px] h-[200px] rounded-full bg-[#E5EDE9]" />
          </div>
        </div>
      </div>

      {/* Cartes indicateurs */}
      <div className="grid grid-cols-3 gap-3.5 mb-6">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="bg-white rounded-[14px] p-4 border border-[#e1e5e8] space-y-3">
            <div className="h-4 w-2/3 bg-[#E5EDE9] rounded" />
            <div className="h-3 w-full bg-[#EAF0ED] rounded" />
            <div className="h-3 w-4/5 bg-[#EAF0ED] rounded" />
          </div>
        ))}
      </div>

      {/* Graphique */}
      <div className="card-shadow rounded-2xl p-6 mb-6 bg-white">
        <div className="h-4 w-56 bg-[#E5EDE9] rounded mb-2" />
        <div className="h-3 w-80 bg-[#EAF0ED] rounded mb-6" />
        <div className="h-64 w-full bg-[#F1F4F2] rounded-xl" />
      </div>
    </div>
  )
}

function SectionLabel({ children, sub, right }) {
  return (
    <div className="flex items-baseline justify-between mb-3.5">
      <div>
        <div className="text-[11px] font-semibold text-[#768776] uppercase tracking-[0.06em]">{children}</div>
        {sub && <div className="text-[12px] text-[#9CA3AF] mt-1">{sub}</div>}
      </div>
      {right}
    </div>
  )
}

function ProgressDonut({ value, size = 140, stroke = 14, label, sub, color = "#2DAC6A" }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const dash = (Math.max(0, Math.min(100, value)) / 100) * c
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#D9EFE3" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${dash} ${c - dash}`} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="text-[28px] font-bold text-font-primary leading-none">
          {Math.round(value)}<span className="text-[16px] text-[#768776]">%</span>
        </div>
        {label && <div className="text-[10px] text-[#768776] mt-1.5 uppercase tracking-[0.06em] font-semibold">{label}</div>}
        {sub && <div className="text-[10px] text-[#9CA3AF] mt-0.5">{sub}</div>}
      </div>
    </div>
  )
}

function DeltaPill({ value, suffix = "%", size = "md" }) {
  const isNeutral = Math.abs(value) < 1
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md font-semibold ${isNeutral ? "bg-gray-100 text-gray-500" : value > 0 ? "bg-primary-green/10 text-primary-green" : "bg-red-50 text-red-600"} ${size === "sm" ? "text-[10px]" : "text-[11px]"} ${size === "sm" ? "px-1.5 py-0.5" : "px-2 py-[3px]"}`}
      style={{ fontFamily: "ui-monospace, SF Mono, monospace" }}
    >
      <span style={{ fontSize: size === "sm" ? 8 : 9 }}>{isNeutral ? "→" : value > 0 ? "▲" : "▼"}</span>
      {fmtSigned(value)}{suffix}
    </span>
  )
}

function IndicatorPicker({ active, onChange, indicators }) {
  return (
    <div className="inline-flex gap-1 p-1 bg-[#F1F4F2] rounded-[10px] border border-[#e1e5e8]">
      {indicators.map((ind) => (
        <button
          key={ind.key}
          onClick={() => onChange(ind.key)}
          className={`px-3 py-1.5 rounded-[7px] text-[12px] font-semibold cursor-pointer transition-all ${active === ind.key ? "bg-white text-font-primary shadow-sm" : "bg-transparent text-[#768776] hover:text-font-primary"}`}
        >
          {ind.short}
        </button>
      ))}
    </div>
  )
}

function ActionBar({ action, max }) {
  const performance = action.ges_prev !== 0 ? (action.ges / action.ges_prev) * 100 : 0
  const isDegradation = action.ges > 0
  return (
    <div className="w-full py-2.5 border-b border-[#e1e5e8] last:border-b-0">
      <div className="flex justify-between items-baseline mb-1.5">
        <div className="flex gap-2 items-baseline min-w-0">
          <span className="text-[11px] font-semibold text-[#768776]" style={{ fontFamily: "ui-monospace, SF Mono, monospace" }}>{action.action}</span>
          <span className="text-[13px] font-medium text-font-primary truncate">{action.name}</span>
        </div>
        <div className="shrink-0 text-[12px] font-semibold text-font-primary" style={{ fontFamily: "ui-monospace, SF Mono, monospace" }}>
          {fmtNum(Math.abs(action.ges))} <span className="text-[#768776] font-normal">tCO₂e</span>
        </div>
      </div>
      <div className="relative h-2 bg-[#F1F4F2] rounded-full overflow-hidden">
        <div className="absolute top-0 left-0 h-full rounded-full bg-[#D2EDEC]" style={{ width: `${Math.min((Math.abs(action.ges_prev) / max) * 100, 100)}%` }} />
        <div className="absolute top-0 left-0 h-full rounded-full" style={{ width: `${Math.min((Math.abs(action.ges) / max) * 100, 100)}%`, background: isDegradation ? "#FB6B69" : "#2DAC6A", opacity: isDegradation ? 0.85 : 1 }} />
      </div>
      <div className="flex justify-between mt-1 text-[10px] text-[#9CA3AF]">
        <span>Cible : {fmtNum(Math.abs(action.ges_prev))} tCO₂e</span>
        <span className={`font-semibold ${isDegradation ? "text-red-600" : performance > 100 ? "text-primary-green" : "text-primary-orange"}`}>
          {isDegradation ? "Dégradation" : `${Math.round(performance)}% de la cible`}
        </span>
      </div>
    </div>
  )
}

function StatBlock({ value, label, color }) {
  return (
    <div className="py-2.5">
      <div className="text-[26px] font-bold leading-none" style={{ color: color || "#123314", fontFamily: "ui-monospace, SF Mono, monospace" }}>
        {value}
      </div>
      <div className="text-[11px] text-[#768776] mt-1 font-medium">{label}</div>
    </div>
  )
}

function StackedActionsChart({ emissions, unit, yearExpost }) {
  const [hover, setHover] = useState(null)

  const years = emissions?.years || []
  const actions = [...(emissions?.actions || [])].sort((a, b) => b.yearly.reduce((s, d) => s + d.value, 0) - a.yearly.reduce((s, d) => s + d.value, 0))
  const prevByYear = Object.fromEntries((emissions?.prevByYear || []).map((d) => [d.year, d.value]))
  const refByYear = Object.fromEntries((emissions?.refByYear || []).map((d) => [d.year, d.value]))

  const stackByYear = years.map((year) => {
    const segments = actions.map((a) => ({ action: a.code, name: a.name, value: a.yearly.find((d) => d.year === year)?.value || 0 }))
    return { year, segments, total: segments.reduce((s, x) => s + x.value, 0), objectif: prevByYear[year], reference: refByYear[year] }
  })

  const W = 1080
  const H = 320
  const PAD = { t: 16, r: 28, b: 28, l: 60 }
  const innerW = W - PAD.l - PAD.r
  const innerH = H - PAD.t - PAD.b

  const xMin = years[0]
  const xMax = years[years.length - 1]
  const xOf = (y) => PAD.l + ((y - xMin) / (xMax - xMin || 1)) * innerW

  const yMax = Math.max(...years.map((y) => Math.max(prevByYear[y] || 0, refByYear[y] || 0)), ...stackByYear.map((d) => d.total)) * 1.05 || 1
  const yOf = (v) => PAD.t + innerH - (v / yMax) * innerH

  const barW = Math.min(40, (innerW / (years.length || 1)) * 0.7)

  const prevYears = years.filter((y) => prevByYear[y] != null && prevByYear[y] > 0)
  const prevPath = prevYears.map((y, i) => `${i === 0 ? "M" : "L"} ${xOf(y)} ${yOf(prevByYear[y])}`).join(" ")

  const refYears = years.filter((y) => refByYear[y] != null && refByYear[y] > 0)
  const refPath = refYears.map((y, i) => `${i === 0 ? "M" : "L"} ${xOf(y)} ${yOf(refByYear[y])}`).join(" ")

  const tickVals = Array.from({ length: 5 }, (_, i) => (yMax / 4) * i)

  if (!years.length) return <div className="text-[13px] text-[#768776] py-6">Aucune donnée d'émission disponible.</div>

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto block">
        {tickVals.map((v, i) => (
          <g key={i}>
            <line x1={PAD.l} x2={W - PAD.r} y1={yOf(v)} y2={yOf(v)} stroke="rgba(0,0,0,0.05)" strokeDasharray={i === 0 ? "" : "2 3"} />
            <text x={PAD.l - 6} y={yOf(v) + 3} fontSize={10} fill="#768776" textAnchor="end">{fmtNum(v)}</text>
          </g>
        ))}

        {stackByYear.map((d) => {
          let yCursor = yOf(0)
          return (
            <g key={d.year} onMouseEnter={() => setHover(d)} onMouseLeave={() => setHover(null)} style={{ cursor: "pointer" }}>
              {d.segments.map((seg, i) => {
                const h = (seg.value / yMax) * innerH
                if (h < 0.5) return null
                const yTop = yCursor - h
                const rect = (
                  <rect key={seg.action} x={xOf(d.year) - barW / 2} y={yTop} width={barW} height={h}
                    fill={PALETTE[i % PALETTE.length]} stroke="#fff" strokeWidth={0.6}
                    opacity={hover && hover.year !== d.year ? 0.35 : 1} />
                )
                yCursor = yTop
                return rect
              })}
            </g>
          )
        })}

        <path d={refPath} stroke="#9CA3AF" strokeWidth={2} fill="none" strokeDasharray="6 4" />
        {refYears.map((y) => (
          <circle key={y} cx={xOf(y)} cy={yOf(refByYear[y])} r={2.5} fill="#fff" stroke="#9CA3AF" strokeWidth={1.5} />
        ))}

        <path d={prevPath} stroke="#56BDB8" strokeWidth={2} fill="none" strokeDasharray="6 4" />
        {prevYears.map((y) => (
          <circle key={y} cx={xOf(y)} cy={yOf(prevByYear[y])} r={2.5} fill="#fff" stroke="#56BDB8" strokeWidth={1.5} />
        ))}

        {yearExpost && years.includes(yearExpost) && (
          <>
            <line x1={xOf(yearExpost) + barW / 2 + 4} x2={xOf(yearExpost) + barW / 2 + 4} y1={PAD.t} y2={H - PAD.b} stroke="#F59600" strokeDasharray="3 3" strokeOpacity="0.5" />
            <rect x={xOf(yearExpost) + barW / 2 - 22} y={PAD.t - 6} width={56} height={16} rx={8} fill="#F59600" />
            <text x={xOf(yearExpost) + barW / 2 + 6} y={PAD.t + 5} fontSize={10} fontWeight={600} textAnchor="middle" fill="#fff">{yearExpost}</text>
          </>
        )}

        {years.filter((_, i) => i % 2 === 0).map((y) => (
          <text key={y} x={xOf(y)} y={H - 8} fontSize={11} fill="#768776" textAnchor="middle">{y}</text>
        ))}
      </svg>

      {hover && (
        <div className="absolute top-2 right-2 bg-white border border-[#e1e5e8] rounded-lg p-2.5 text-[11px] shadow-lg max-w-[260px]">
          <div className="font-bold mb-1.5 text-font-primary">{hover.year} · {fmtNum(hover.total)} {unit}</div>
          {hover.segments.map((s, i) => ({ s, i })).filter(({ s }) => s.value > 0).slice(0, 6).map(({ s, i }) => (
            <div key={s.action} className="flex items-center gap-1.5 mb-0.5">
              <span className="w-2 h-2 rounded-sm" style={{ background: PALETTE[i % PALETTE.length] }} />
              <span className="flex-1 text-[#768776] overflow-hidden text-ellipsis whitespace-nowrap">{s.action} · {s.name}</span>
              <span className="font-semibold text-font-primary" style={{ fontFamily: "ui-monospace, monospace" }}>{fmtNum(s.value)}</span>
            </div>
          ))}
          {hover.reference != null && (
            <div className="flex items-center gap-1.5 mt-1.5 pt-1.5 border-t border-[#e1e5e8]">
              <span className="w-3.5" style={{ borderTop: "2px dashed #9CA3AF" }} />
              <span className="flex-1 text-[#768776]">Référence</span>
              <span className="font-semibold text-font-primary" style={{ fontFamily: "ui-monospace, monospace" }}>{fmtNum(hover.reference)} {unit}</span>
            </div>
          )}
          {hover.objectif != null && (
            <div className="flex items-center gap-1.5 mt-1 pt-1">
              <span className="w-3.5" style={{ borderTop: "2px dashed #56BDB8" }} />
              <span className="flex-1 text-[#768776]">Prévisionnel</span>
              <span className="font-semibold text-font-primary" style={{ fontFamily: "ui-monospace, monospace" }}>{fmtNum(hover.objectif)} {unit}</span>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-x-3.5 gap-y-1.5 mt-2.5 text-[10px] text-[#768776]">
        {actions.map((a, i) => (
          <div key={a.code} className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ background: PALETTE[i % PALETTE.length] }} />
            <span className="font-semibold text-font-primary">{a.code}</span>
            <span>{a.name?.length > 28 ? a.name.slice(0, 26) + "…" : a.name}</span>
          </div>
        ))}
        <div className="flex items-center gap-1.5 ml-auto">
          <span className="w-3.5" style={{ borderTop: "2px dashed #9CA3AF" }} />
          <span>Référence</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3.5" style={{ borderTop: "2px dashed #56BDB8" }} />
          <span>Trajectoire prévisionnelle</span>
        </div>
      </div>
    </div>
  )
}
