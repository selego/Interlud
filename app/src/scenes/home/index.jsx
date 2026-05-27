import React, { useState } from "react"

// ============================================================================
// Fake data — shape miroir de /excel/global-gains et /excel/action-contribution
// ============================================================================

const COLLECTIVITY = {
  name: "CC Vallée de l'Hérault",
  department: "Hérault (34)",
  population: 38420,
  year_init: 2019,
  year_ref: 2022,
  year_prev: 2030,
  year_expost: 2024,
}

const INDICATORS = [
  { key: "GES", label: "Gaz à effet de serre", short: "GES", unit: "tCO₂e", evolutionRelativePrev: 28.4, evolutionRelativeReel: 11.2, evolutionCumuleePrev: 14820, evolutionCumuleeReel: 5920, ecartAbsolu: -8900, ecartRelatif: -60.1 },
  { key: "PM", label: "Particules fines", short: "PM", unit: "tPart", evolutionRelativePrev: 35.1, evolutionRelativeReel: 18.7, evolutionCumuleePrev: 142, evolutionCumuleeReel: 78, ecartAbsolu: -64, ecartRelatif: -45.1 },
  { key: "NOx", label: "Oxydes d'azote", short: "NOₓ", unit: "tNOx", evolutionRelativePrev: 41.2, evolutionRelativeReel: 24.5, evolutionCumuleePrev: 380, evolutionCumuleeReel: 195, ecartAbsolu: -185, ecartRelatif: -48.7 },
  { key: "HC", label: "Hydrocarbures", short: "HC", unit: "tHC", evolutionRelativePrev: 22.0, evolutionRelativeReel: 19.8, evolutionCumuleePrev: 88, evolutionCumuleeReel: 71, ecartAbsolu: -17, ecartRelatif: -19.3 },
  { key: "CO", label: "Monoxyde de carbone", short: "CO", unit: "tCO", evolutionRelativePrev: 26.5, evolutionRelativeReel: 28.1, evolutionCumuleePrev: 612, evolutionCumuleeReel: 648, ecartAbsolu: 36, ecartRelatif: 5.9 },
  { key: "Nrj", label: "Énergie consommée", short: "Énergie", unit: "GWh", evolutionRelativePrev: 30.0, evolutionRelativeReel: 9.2, evolutionCumuleePrev: 218, evolutionCumuleeReel: 67, ecartAbsolu: -151, ecartRelatif: -69.3 },
]

const TRAJECTORY = {
  GES: [
    { year: 2019, prev: 0, reel: 0 }, { year: 2020, prev: 1200, reel: 800 }, { year: 2021, prev: 2650, reel: 1750 },
    { year: 2022, prev: 4200, reel: 2900 }, { year: 2023, prev: 6100, reel: 4350 }, { year: 2024, prev: 8400, reel: 5920 },
    { year: 2025, prev: 10100 }, { year: 2026, prev: 11500 }, { year: 2027, prev: 12700 },
    { year: 2028, prev: 13600 }, { year: 2029, prev: 14300 }, { year: 2030, prev: 14820 },
  ],
  PM: [
    { year: 2019, prev: 0, reel: 0 }, { year: 2020, prev: 12, reel: 8 }, { year: 2021, prev: 26, reel: 18 },
    { year: 2022, prev: 42, reel: 32 }, { year: 2023, prev: 60, reel: 52 }, { year: 2024, prev: 80, reel: 78 },
    { year: 2025, prev: 96 }, { year: 2026, prev: 110 }, { year: 2027, prev: 122 },
    { year: 2028, prev: 131 }, { year: 2029, prev: 138 }, { year: 2030, prev: 142 },
  ],
  NOx: [
    { year: 2019, prev: 0, reel: 0 }, { year: 2020, prev: 32, reel: 21 }, { year: 2021, prev: 70, reel: 48 },
    { year: 2022, prev: 110, reel: 82 }, { year: 2023, prev: 158, reel: 132 }, { year: 2024, prev: 210, reel: 195 },
    { year: 2025, prev: 254 }, { year: 2026, prev: 290 }, { year: 2027, prev: 320 },
    { year: 2028, prev: 345 }, { year: 2029, prev: 365 }, { year: 2030, prev: 380 },
  ],
  HC: [
    { year: 2019, prev: 0, reel: 0 }, { year: 2020, prev: 7, reel: 6 }, { year: 2021, prev: 16, reel: 14 },
    { year: 2022, prev: 25, reel: 23 }, { year: 2023, prev: 36, reel: 47 }, { year: 2024, prev: 48, reel: 71 },
    { year: 2025, prev: 58 }, { year: 2026, prev: 67 }, { year: 2027, prev: 75 },
    { year: 2028, prev: 81 }, { year: 2029, prev: 85 }, { year: 2030, prev: 88 },
  ],
  CO: [
    { year: 2019, prev: 0, reel: 0 }, { year: 2020, prev: 50, reel: 60 }, { year: 2021, prev: 110, reel: 130 },
    { year: 2022, prev: 175, reel: 210 }, { year: 2023, prev: 250, reel: 410 }, { year: 2024, prev: 340, reel: 648 },
    { year: 2025, prev: 410 }, { year: 2026, prev: 470 }, { year: 2027, prev: 520 },
    { year: 2028, prev: 560 }, { year: 2029, prev: 590 }, { year: 2030, prev: 612 },
  ],
  Nrj: [
    { year: 2019, prev: 0, reel: 0 }, { year: 2020, prev: 18, reel: 8 }, { year: 2021, prev: 39, reel: 18 },
    { year: 2022, prev: 62, reel: 30 }, { year: 2023, prev: 88, reel: 48 }, { year: 2024, prev: 120, reel: 67 },
    { year: 2025, prev: 145 }, { year: 2026, prev: 168 }, { year: 2027, prev: 187 },
    { year: 2028, prev: 200 }, { year: 2029, prev: 211 }, { year: 2030, prev: 218 },
  ],
}

const ACTION_CONTRIBUTIONS = [
  { action: "B2", name: "Densification de l'offre logistique urbaine", parent: "Bâti & infrastructures", ges: -1820, ges_prev: -2400, status: "in_progress" },
  { action: "C3", name: "Mise en place de ZFE renforcée", parent: "Circulation & flux", ges: -1450, ges_prev: -3100, status: "in_progress" },
  { action: "C1", name: "Développement aires de livraison mutualisées", parent: "Circulation & flux", ges: -980, ges_prev: -1200, status: "completed" },
  { action: "B3", name: "Espaces logistiques de proximité", parent: "Bâti & infrastructures", ges: -720, ges_prev: -680, status: "completed" },
  { action: "C2", name: "Cyclo-logistique du dernier km", parent: "Circulation & flux", ges: -540, ges_prev: -890, status: "in_progress" },
  { action: "C5", name: "Verdissement flotte municipale", parent: "Circulation & flux", ges: -310, ges_prev: -450, status: "in_progress" },
  { action: "C7", name: "Charte transporteurs vertueux", parent: "Circulation & flux", ges: -180, ges_prev: -320, status: "in_progress" },
  { action: "B4", name: "Bornes de recharge poids lourds", parent: "Bâti & infrastructures", ges: -120, ges_prev: -380, status: "blocked" },
  { action: "C4", name: "Optimisation horaires de livraison", parent: "Circulation & flux", ges: -90, ges_prev: -210, status: "upcoming" },
  { action: "C6", name: "Sensibilisation commerçants", parent: "Circulation & flux", ges: 60, ges_prev: -120, status: "blocked" },
  { action: "C9", name: "Plateformes de mutualisation B2B", parent: "Circulation & flux", ges: -310, ges_prev: -540, status: "in_progress" },
]

const AVANCEMENT_TRAJECTOIRE = (5920 / 8400) * 100

const PALETTE = ["#0A3641", "#1A6E5A", "#2DAC6A", "#56BDB8", "#7FCEC0", "#A4DDB7", "#C8E8B6", "#E5BD7A", "#D88E5A", "#B86F4F", "#8B5E3C"]

const fmtNum = (v) => {
  if (v == null) return "—"
  const abs = Math.abs(v)
  if (abs >= 1_000_000) return `${(v / 1_000_000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} M`
  if (abs >= 10_000) return `${(v / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} k`
  return v.toLocaleString("fr-FR", { maximumFractionDigits: 0 })
}

const fmtSigned = (v, decimals = 1) => {
  if (v == null) return "—"
  const sign = v > 0 ? "+" : ""
  return `${sign}${v.toLocaleString("fr-FR", { maximumFractionDigits: decimals })}`
}

// ============================================================================
// Page
// ============================================================================

export default function Home() {
  const [activeIndicator, setActiveIndicator] = useState("GES")
  const indicator = INDICATORS.find((i) => i.key === activeIndicator)
  const traj = TRAJECTORY[activeIndicator]
  const advancement = AVANCEMENT_TRAJECTOIRE

  const topActions = [...ACTION_CONTRIBUTIONS].filter((a) => a.ges < 0).sort((a, b) => a.ges - b.ges).slice(0, 5)
  const maxAction = Math.max(...ACTION_CONTRIBUTIONS.map((a) => Math.abs(a.ges_prev)))

  const totalActions = ACTION_CONTRIBUTIONS.length
  const inProgress = ACTION_CONTRIBUTIONS.filter((a) => a.status === "in_progress").length
  const completed = ACTION_CONTRIBUTIONS.filter((a) => a.status === "completed").length
  const blocked = ACTION_CONTRIBUTIONS.filter((a) => a.status === "blocked").length

  const status = advancement >= 90 ? "en avance" : advancement >= 70 ? "proche de la cible" : advancement >= 50 ? "en retard modéré" : "en retard significatif"
  const statusColor = advancement >= 90 ? "text-primary-green" : advancement >= 70 ? "text-primary-orange" : "text-red-500"
  const donutColor = advancement >= 90 ? "#2DAC6A" : advancement >= 70 ? "#F59600" : "#FB6B69"

  return (
    <div className="bg-white">
      <div className="relative z-10 max-w-[1280px] mx-auto px-8 py-8" style={{ fontFamily: "'Source Sans Pro', sans-serif" }}>
        {/* Header */}
        <div className="mb-5">
          <div className="text-[12px] font-semibold uppercase tracking-[0.06em] text-[#768776] mb-1.5">
            {COLLECTIVITY.department}
          </div>
          <h1 className="text-[30px] font-bold leading-[1.1] tracking-tight text-font-primary m-0">
            {COLLECTIVITY.name}
          </h1>
        </div>

        {/* Hero narratif */}
        <div className="rounded-[20px] p-8 mb-6 border" style={{ background: "linear-gradient(135deg, #F9FFFC 0%, #fff 60%)", borderColor: "#D9EFE3" }}>
          <div className="grid grid-cols-[1fr_280px] gap-8 items-center">
            <div>
              <div className={`text-[11px] font-bold uppercase tracking-[0.08em] mb-3 ${statusColor}`}>
                ● Bilan {COLLECTIVITY.year_expost} · Trajectoire {status}
              </div>
              <h2 className="text-[26px] font-semibold leading-[1.25] tracking-tight max-w-[640px] text-font-primary m-0">
                Vous avez réalisé <span className="text-primary-green font-bold">{Math.round(advancement)} %</span> du gain GES prévu à mi-parcours,
                soit <span className="font-bold">{fmtNum(5920)} tCO₂e</span> évitées sur {fmtNum(8400)} attendues.
              </h2>
              <p className="text-[15px] text-[#768776] leading-[1.55] mt-3.5 mb-0 max-w-[640px]">
                À ce rythme, l'objectif <strong className="text-font-primary">−{indicator.evolutionRelativePrev.toFixed(0)} %</strong> à horizon {COLLECTIVITY.year_prev} reste atteignable
                mais demande d'accélérer 3 actions clés. <strong className="text-font-primary">5 indicateurs sur 6</strong> sont en retard,
                seul le CO sur-performe légèrement.
              </p>
            </div>
            <div className="flex justify-center">
              <ProgressDonut value={advancement} size={200} stroke={20} label="de la cible 2024" sub="atteinte" color={donutColor} />
            </div>
          </div>
        </div>

        {/* 6 indicateurs */}
        <div className="mb-6">
          <SectionLabel sub="Cliquez pour explorer la trajectoire d'un indicateur">
            Que disent les 6 indicateurs ?
          </SectionLabel>
          <div className="grid grid-cols-3 gap-3.5">
            {INDICATORS.map((ind) => {
              const ratio = ind.evolutionRelativePrev > 0 ? (ind.evolutionRelativeReel / ind.evolutionRelativePrev) * 100 : 0
              const isOver = ind.ecartRelatif > 0
              const isActive = activeIndicator === ind.key
              return (
                <button
                  key={ind.key}
                  onClick={() => setActiveIndicator(ind.key)}
                  className={`bg-white rounded-[14px] p-4 text-left cursor-pointer transition-all ${isActive ? "border-2 border-primary-green" : "border border-[#e1e5e8] hover:border-primary-green/40"}`}
                >
                  <div className="flex justify-between mb-2">
                    <span className="text-[13px] font-semibold text-font-primary">{ind.label}</span>
                    <DeltaPill value={ind.ecartRelatif} suffix="%" size="sm" />
                  </div>
                  <div className="text-[13px] text-[#768776] leading-[1.4]">
                    Réduction de <strong className="text-font-primary font-bold">−{ind.evolutionRelativeReel.toFixed(1)} %</strong>
                    {" "}vs cible <strong className="text-font-primary">−{ind.evolutionRelativePrev.toFixed(1)} %</strong>
                    {isOver ? " · objectif dépassé" : ` · ${Math.round(ratio)}% de la cible`}
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Trajectoire */}
        <div className="card-shadow rounded-2xl p-6 mb-6 bg-white">
          <div className="flex justify-between mb-3">
            <div>
              <h3 className="text-[16px] font-semibold m-0 text-font-primary">Trajectoire {indicator.label}</h3>
              <p className="text-[12px] text-[#768776] mt-1 mb-0">
                Gain cumulé prévu (PCAET, pointillé) vs gain mesuré ex-post décomposé par action.
              </p>
            </div>
            <IndicatorPicker active={activeIndicator} onChange={setActiveIndicator} indicators={INDICATORS} />
          </div>
          <StackedActionsChart traj={traj} unit={indicator.unit} />
        </div>

        {/* Bas — 2 colonnes */}
        <div className="grid grid-cols-[2fr_1fr] gap-5 mb-8">
          <div className="card-shadow rounded-2xl p-6 bg-white">
            <SectionLabel sub="Classement par gain GES réel — cumulé sur la période">
              Top 5 actions contributrices
            </SectionLabel>
            <div>
              {topActions.map((a) => (
                <ActionBar key={a.action} action={a} max={maxAction} />
              ))}
            </div>
            <button className="mt-3.5 px-3.5 py-2 bg-transparent border border-primary-green text-primary-green rounded-lg text-[12px] font-semibold cursor-pointer hover:bg-primary-green/5 transition-colors">
              Voir les {ACTION_CONTRIBUTIONS.length} actions →
            </button>
          </div>

          <div className="flex flex-col gap-4">
            <div className="card-shadow rounded-2xl p-6 bg-white">
              <SectionLabel>Portefeuille d'actions</SectionLabel>
              <div className="grid grid-cols-2 gap-3">
                <StatBlock value={totalActions} label="Actions totales" />
                <StatBlock value={inProgress} label="En cours" color="#F59600" />
                <StatBlock value={completed} label="Terminées" color="#2DAC6A" />
                <StatBlock value={blocked} label="Bloquées" color="#FB6B69" />
              </div>
            </div>

            <div className="card-shadow rounded-2xl p-6" style={{ background: "linear-gradient(180deg, #F9FFFC 0%, #fff 100%)" }}>
              <SectionLabel>À surveiller</SectionLabel>
              <div className="text-[13px] text-font-primary leading-[1.5]">
                <WatchItem color="#FB6B69" title="HC en dégradation" desc="+47% vs prévision 2024 — à investiguer" />
                <WatchItem color="#F59600" title="2 actions bloquées" desc="B4 (bornes recharge), C6 (sensibilisation)" border />
                <WatchItem color="#2DAC6A" title="Énergie à 31% de la cible" desc="Plus gros écart — accélérer le verdissement" last />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// Primitives
// ============================================================================

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
  const pct = Math.max(0, Math.min(100, value))
  const dash = (pct / 100) * c
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
  const isGood = value > 0
  const isNeutral = Math.abs(value) < 1
  const bg = isNeutral ? "bg-gray-100 text-gray-500" : isGood ? "bg-primary-green/10 text-primary-green" : "bg-red-50 text-red-600"
  const arrow = isNeutral ? "→" : value > 0 ? "▲" : "▼"
  const fontSize = size === "sm" ? "text-[10px]" : "text-[11px]"
  const padding = size === "sm" ? "px-1.5 py-0.5" : "px-2 py-[3px]"
  return (
    <span className={`inline-flex items-center gap-1 rounded-md font-semibold ${bg} ${fontSize} ${padding}`} style={{ fontFamily: "ui-monospace, SF Mono, monospace" }}>
      <span style={{ fontSize: size === "sm" ? 8 : 9 }}>{arrow}</span>
      {fmtSigned(value)}{suffix}
    </span>
  )
}

function IndicatorPicker({ active, onChange, indicators }) {
  return (
    <div className="inline-flex gap-1 p-1 bg-[#F1F4F2] rounded-[10px] border border-[#e1e5e8]">
      {indicators.map((ind) => {
        const isActive = active === ind.key
        return (
          <button
            key={ind.key}
            onClick={() => onChange(ind.key)}
            className={`px-3 py-1.5 rounded-[7px] text-[12px] font-semibold cursor-pointer transition-all ${isActive ? "bg-white text-font-primary shadow-sm" : "bg-transparent text-[#768776] hover:text-font-primary"}`}
          >
            {ind.short}
          </button>
        )
      })}
    </div>
  )
}

function ActionBar({ action, max }) {
  const reelW = (Math.abs(action.ges) / max) * 100
  const prevW = (Math.abs(action.ges_prev) / max) * 100
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
        <div className="absolute top-0 left-0 h-full rounded-full bg-[#D2EDEC]" style={{ width: `${Math.min(prevW, 100)}%` }} />
        <div className="absolute top-0 left-0 h-full rounded-full" style={{ width: `${Math.min(reelW, 100)}%`, background: isDegradation ? "#FB6B69" : "#2DAC6A", opacity: isDegradation ? 0.85 : 1 }} />
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

function WatchItem({ color, title, desc, border, last }) {
  return (
    <div className={`flex gap-2.5 py-2 ${last ? "" : "border-b border-[#e1e5e8]"}`}>
      <span className="shrink-0 mt-[3px] w-1.5 h-1.5 rounded-full" style={{ background: color }} />
      <div>
        <div className="font-semibold text-[12px]">{title}</div>
        <div className="text-[11px] text-[#768776] mt-0.5">{desc}</div>
      </div>
    </div>
  )
}

// ============================================================================
// StackedActionsChart — barres empilées par action + ligne PCAET pointillée
// ============================================================================

function StackedActionsChart({ traj, unit }) {
  const [hover, setHover] = useState(null)
  const yearExpost = COLLECTIVITY.year_expost
  const yearInit = COLLECTIVITY.year_init
  const totalSpan = yearExpost - yearInit

  const contribs = [...ACTION_CONTRIBUTIONS].filter((a) => a.ges < 0).sort((a, b) => a.ges - b.ges)

  const sCurve = (t) => {
    if (t <= 0) return 0
    if (t >= 1) return 1
    return 0.5 - 0.5 * Math.cos(Math.PI * t)
  }

  const yearsHistorique = traj.filter((d) => d.year <= yearExpost).map((d) => d.year)
  const stackByYear = yearsHistorique.map((year) => {
    const t = totalSpan > 0 ? (year - yearInit) / totalSpan : 0
    const cumulProgress = sCurve(t)
    const segments = contribs.map((a) => ({ action: a.action, name: a.name, value: Math.abs(a.ges) * cumulProgress }))
    const total = segments.reduce((s, x) => s + x.value, 0)
    return { year, segments, total }
  })

  const W = 1080
  const H = 320
  const PAD = { t: 16, r: 28, b: 28, l: 60 }
  const innerW = W - PAD.l - PAD.r
  const innerH = H - PAD.t - PAD.b

  const allYears = traj.map((d) => d.year)
  const xMin = allYears[0]
  const xMax = allYears[allYears.length - 1]
  const xOf = (y) => PAD.l + ((y - xMin) / (xMax - xMin)) * innerW

  const allPrev = traj.map((d) => d.prev || 0)
  const yMax = Math.max(...allPrev, ...stackByYear.map((d) => d.total)) * 1.05
  const yOf = (v) => PAD.t + innerH - (v / yMax) * innerH

  const barW = Math.min(40, (innerW / allYears.length) * 0.7)

  const prevPath = traj
    .filter((d) => d.prev != null)
    .map((d, i) => `${i === 0 ? "M" : "L"} ${xOf(d.year)} ${yOf(d.prev)}`)
    .join(" ")

  const ticks = 4
  const tickVals = Array.from({ length: ticks + 1 }, (_, i) => (yMax / ticks) * i)

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

        <path d={prevPath} stroke="#56BDB8" strokeWidth={2} fill="none" strokeDasharray="6 4" />
        {traj.filter((d) => d.prev != null).map((d) => (
          <circle key={d.year} cx={xOf(d.year)} cy={yOf(d.prev)} r={2.5} fill="#fff" stroke="#56BDB8" strokeWidth={1.5} />
        ))}

        <line x1={xOf(yearExpost) + barW / 2 + 4} x2={xOf(yearExpost) + barW / 2 + 4} y1={PAD.t} y2={H - PAD.b} stroke="#F59600" strokeDasharray="3 3" strokeOpacity="0.5" />
        <rect x={xOf(yearExpost) + barW / 2 - 22} y={PAD.t - 6} width={56} height={16} rx={8} fill="#F59600" />
        <text x={xOf(yearExpost) + barW / 2 + 6} y={PAD.t + 5} fontSize={10} fontWeight={600} textAnchor="middle" fill="#fff">{yearExpost}</text>

        {allYears.filter((_, i) => i % 2 === 0).map((y) => (
          <text key={y} x={xOf(y)} y={H - 8} fontSize={11} fill="#768776" textAnchor="middle">{y}</text>
        ))}
      </svg>

      {hover && (
        <div className="absolute top-2 right-2 bg-white border border-[#e1e5e8] rounded-lg p-2.5 text-[11px] shadow-lg max-w-[260px]">
          <div className="font-bold mb-1.5 text-font-primary">{hover.year} · {fmtNum(hover.total)} {unit}</div>
          {hover.segments.slice(0, 6).map((s, i) => (
            <div key={s.action} className="flex items-center gap-1.5 mb-0.5">
              <span className="w-2 h-2 rounded-sm" style={{ background: PALETTE[i % PALETTE.length] }} />
              <span className="flex-1 text-[#768776] overflow-hidden text-ellipsis whitespace-nowrap">{s.action} · {s.name}</span>
              <span className="font-semibold text-font-primary" style={{ fontFamily: "ui-monospace, monospace" }}>{fmtNum(s.value)}</span>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-x-3.5 gap-y-1.5 mt-2.5 text-[10px] text-[#768776]">
        {contribs.map((a, i) => (
          <div key={a.action} className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ background: PALETTE[i % PALETTE.length] }} />
            <span className="font-semibold text-font-primary">{a.action}</span>
            <span>{a.name.length > 28 ? a.name.slice(0, 26) + "…" : a.name}</span>
          </div>
        ))}
        <div className="flex items-center gap-1.5 ml-auto">
          <span className="w-3.5" style={{ borderTop: "2px dashed #56BDB8" }} />
          <span>Trajectoire prévisionnelle (PCAET)</span>
        </div>
      </div>
    </div>
  )
}
