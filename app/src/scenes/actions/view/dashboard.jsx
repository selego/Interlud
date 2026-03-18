import React, { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import api from "@/services/api"
import toast from "react-hot-toast"
import useStore from "@/services/store"
import { FiArrowLeft, FiPlus, FiEdit } from "react-icons/fi"
import { HiCheckCircle } from "react-icons/hi2"
import Loader from "@/components/loader"
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts"

const SITUATION_LABELS = { init: "Initiale", ref: "Référence", prev: "Prévisionnel", expost: "Ex-post" }

const INDICATOR_TABS = [
  { key: "GES", label: "GES" },
  { key: "Nrj", label: "Énergie" },
  { key: "PM", label: "PM" },
  { key: "NOx", label: "NOx" },
  { key: "HC", label: "HC" },
  { key: "CO", label: "CO" },
]

const TRAJ_SERIES = [
  { key: "initiale", label: "Initiale", color: "#888780", dash: false },
  { key: "reference", label: "Référence", color: "#378ADD", dash: false },
  { key: "previsionnelle", label: "Prévisionnelle", color: "#EF9F27", dash: true },
  { key: "expost", label: "Ex-post", color: "#1D9E75", dash: false },
]

const ECART_SERIES = [
  { key: "ecartPrevRef", label: "Écart Prév − Réf", color: "#378ADD" },
  { key: "ecartExpostRef", label: "Écart Expost − Réf", color: "#1D9E75" },
  { key: "ecartExpostPrev", label: "Écart Expost − Prév", color: "#EF9F27" },
]

const formatBigNumber = (val) => {
  if (!val && val !== 0) return "—"
  return Math.round(val).toLocaleString("fr-FR").replace(/\s/g, " ")
}

const scoreColor = (p) => (p >= 80 ? "#1D9E75" : p >= 50 ? "#EF9F27" : "#E24B4A")
const scoreBg = (p) => (p >= 80 ? { bg: "#E8F8F2", c: "#1D9E75" } : p >= 50 ? { bg: "#FEF5E7", c: "#D48806" } : { bg: "#FEF2F2", c: "#E24B4A" })
const formatTick = (v) => (Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(1)}k` : v)

export default function Dashboard({ action }) {
  const { userActionRights, user, collectivity } = useStore()
  const navigate = useNavigate()

  const [processedData, setProcessedData] = useState({ score: 0, indicators: {}, emissions: { indicators: {} } })
  const [isAggregationLoading, setIsAggregationLoading] = useState(false)
  const [selectedIndicator, setSelectedIndicator] = useState("GES")
  const [chartMode, setChartMode] = useState("traj")
  const [ecartVisible, setEcartVisible] = useState({ ecartPrevRef: true, ecartExpostRef: true, ecartExpostPrev: true })
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())

  const isAdmin = user.role === "admin" || user.collectivities.some((c) => c.id === action.collectivity_id && c.role === "admin")
  const isEconomicActorAsRight = user.role === "economic_actor" && action.owner === "economic_actor" && user.economic_actor_id === action.economic_actor_id
  const right = userActionRights.find((right) => right.action_id === action._id)

  const completionBySituation = {init: action.completion_init, prev: action.completion_prev, expost: action.completion_expost}
  const completeness = Math.round((completionBySituation.init + completionBySituation.prev + completionBySituation.expost) / 3)

  const loadAggregation = async () => {
    if (!collectivity || !action?.excel_worksheetname) return
    try {
      setIsAggregationLoading(true)
      const { ok, data, code } = await api.post(`/excel/action_aggregation`, { collectivity, action: action.excel_worksheetname, date_start: action.date_start, date_end: action.date_end })
      if (!ok) return toast.error(code || "Erreur lors du chargement des données d'agrégation")
      setProcessedData(data)
    } catch (error) {
      toast.error(error.code || "Erreur lors du chargement des données d'agrégation")
    } finally {
      setIsAggregationLoading(false)
    }
  }

  useEffect(() => {
    loadAggregation()
  }, [collectivity, action])

  if (!isAdmin && !isEconomicActorAsRight && !right?.can_read) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg text-gray-600">Vous n'avez pas les droits pour accéder à cette action</div>
      </div>
    )
  }

  if (isAggregationLoading) return <Loader />

  const ind = processedData.indicators
  const gains = ind[selectedIndicator]
  const emis = (processedData.emissions?.indicators || {})[selectedIndicator]

  const getYearData = (indicator, year) => indicator?.yearlyData?.find((d) => d.year === year)
  const getAchievementForYear = (indicator, year) => {
    const d = getYearData(indicator, year)
    return d?.ecartPrevRef && d?.ecartExpostRef ? (Math.abs(d.ecartExpostRef) / Math.abs(d.ecartPrevRef)) * 100 : null
  }

  return (
    <div className="">
      <div className="relative z-10 max-w-8xl mx-auto px-6 sm:px-8 lg:px-10 py-8 space-y-5">
        {/* HEADER */}
        <div className="flex justify-between items-start">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs px-2.5 py-0.5 rounded bg-[#1D9E75] text-white font-medium">{action.sector || "Action"}</span>
              <span className="text-xs px-2.5 py-0.5 rounded bg-[#e8e8e8] text-[#666] font-medium">{action.territory || ""}</span>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={() => navigate(-1)} className="p-1 rounded-full hover:bg-gray-200 text-gray-500 transition-colors">
                <FiArrowLeft size={20} />
              </button>
              <h1 className="text-lg font-semibold text-[#111]">{action.name}</h1>
            </div>
            <p className="text-xs text-[#888] mt-1 pl-9">
              Données {action.date_start && action.date_end ? `${new Date(action.date_start).getFullYear()}–${new Date(action.date_end).getFullYear()}` : "—"} · Analyse sur{" "}
              <span className="text-[#1D9E75]">{selectedYear}</span>
            </p>
          </div>
          <div className="text-right">
            <div className="text-xs text-[#888] mb-0.5">Score global</div>
            <div className="text-3xl font-extrabold" style={{ color: scoreColor(processedData.score) }}>
              {processedData.score}%
            </div>
            <div className="text-xs text-[#888]">objectif atteint</div>
          </div>
          <div className="flex gap-3 ml-6 items-start">
            <button
              className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              onClick={() => navigate(`/actions/${action._id}/completion`)}
            >
              <FiEdit size={16} />
              Compléter
            </button>
            {(isAdmin || right?.can_write || isEconomicActorAsRight) && (
              <button
                className="flex items-center gap-2 px-4 py-2 bg-[#1D9E75] text-white rounded-lg text-sm font-medium hover:opacity-90 transition-colors"
                onClick={() => navigate(`/actions/${action._id}/settings`)}
              >
                <FiPlus size={16} />
                Modifier
              </button>
            )}
          </div>
        </div>

        {/* KPI ROW */}
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: "GES évités", value: formatBigNumber(getYearData(ind.GES, selectedYear)?.ecartExpostRef), unit: "tCO2e / an", badge: getAchievementForYear(ind.GES, selectedYear) },
            { label: "Énergie économisée", value: formatBigNumber(getYearData(ind.Nrj || ind["Énergie"], selectedYear)?.ecartExpostRef), unit: "GWh / an", badge: getAchievementForYear(ind["Énergie"], selectedYear) },
            { label: "Polluants réduits", value: formatBigNumber(["PM", "NOx", "HC", "CO"].reduce((sum, k) => sum + (getYearData(ind[k], selectedYear)?.ecartExpostRef || 0), 0)), unit: "t / an · PM NOx HC CO", badge: (() => { const vals = ["PM", "NOx", "HC", "CO"].map((k) => getAchievementForYear(ind[k], selectedYear)).filter((v) => v !== null); return vals.length > 0 ? Math.round(vals.reduce((s, v) => s + Math.min(v, 100), 0) / vals.length) : null })() },
          ].map((kpi) => {
            const s = kpi.badge !== null && kpi.badge !== undefined ? scoreBg(Math.round(kpi.badge)) : null
            return (
              <div key={kpi.label} className="card-shadow p-4">
                <div className="text-xs text-[#888] mb-1.5">{kpi.label}</div>
                <div className="text-2xl font-bold text-[#111]">{kpi.value}</div>
                <div className="text-xs text-[#999] mt-0.5">{kpi.unit}</div>
                {s && <span className="inline-block text-xs font-medium px-2 py-0.5 rounded-[10px] mt-1.5" style={{ background: s.bg, color: s.c }}>{Math.round(kpi.badge)}% obj.</span>}
              </div>
            )
          })}
          <div className="card-shadow p-4">
            <div className="text-xs text-[#888] mb-1.5">Impact GES cumulé</div>
            <div className="text-2xl font-bold text-[#1D9E75]">{formatBigNumber((ind.GES?.yearlyData ?? []).filter((d) => d.year >= 2015 && d.year <= selectedYear).reduce((sum, d) => sum + d.ecartExpostRef, 0))}</div>
            <div className="text-xs text-[#999] mt-0.5">tCO2e total 2015–{selectedYear}</div>
            <span className="inline-block text-xs px-2.5 py-0.5 rounded-[10px] mt-1.5 border border-[#ccc] text-[#888]">Impact total</span>
          </div>
        </div>

        {/* CHART + SIDEBAR */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* CHART SECTION */}
          <div className="lg:col-span-2 card-shadow p-4">
            {/* Chart header */}
            <div className="flex justify-between items-center mb-3 flex-wrap gap-2">
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold text-[#111]">
                  {chartMode === "traj" ? "Trajectoire temporelle des émissions" : "Écarts et gains par année"}
                </span>
                <div className="flex bg-[#f0f0f0] rounded-md overflow-hidden">
                  <button
                    className={`px-3.5 py-1 text-xs cursor-pointer border-none transition-all whitespace-nowrap ${chartMode === "traj" ? "bg-white text-[#111] font-medium shadow-sm" : "bg-transparent text-[#888]"}`}
                    onClick={() => setChartMode("traj")}
                  >
                    Trajectoires
                  </button>
                  <button
                    className={`px-3.5 py-1 text-xs cursor-pointer border-none transition-all whitespace-nowrap ${chartMode === "ecart" ? "bg-white text-[#111] font-medium shadow-sm" : "bg-transparent text-[#888]"}`}
                    onClick={() => setChartMode("ecart")}
                  >
                    Écarts & gains
                  </button>
                </div>
              </div>
              <div className="flex gap-1">
                {INDICATOR_TABS.map((tab) => {
                  if (!ind[tab.key]) return null
                  return (
                    <button
                      key={tab.key}
                      className={`px-3.5 py-1 rounded-md text-xs cursor-pointer border transition-all ${
                        selectedIndicator === tab.key
                          ? "bg-[#1D9E75] text-white border-[#1D9E75] font-medium"
                          : "bg-transparent text-[#888] border-[#ddd] hover:border-[#1D9E75] hover:text-[#555]"
                      }`}
                      onClick={() => setSelectedIndicator(tab.key)}
                    >
                      {tab.label}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Legend */}
            {chartMode === "traj" ? (
              <div className="flex gap-4 flex-wrap mb-3">
                {TRAJ_SERIES.map((s) => (
                  <div key={s.key} className="flex items-center gap-1.5 text-xs text-[#888]">
                    {s.dash ? (
                      <div className="w-5 h-0 border-t-2 border-dashed" style={{ borderColor: s.color }} />
                    ) : (
                      <div className="w-5 h-0.5 rounded-sm" style={{ background: s.color }} />
                    )}
                    {s.label}
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex gap-4 flex-wrap mb-3">
                {ECART_SERIES.map((s) => (
                  <label key={s.key} className="flex items-center gap-1.5 text-xs text-[#555] cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={ecartVisible[s.key]}
                      onChange={(e) => setEcartVisible((prev) => ({ ...prev, [s.key]: e.target.checked }))}
                      className="accent-[#1D9E75] cursor-pointer"
                    />
                    <span className="w-3 h-3 rounded-sm flex-shrink-0" style={{ background: s.color }} />
                    {s.label}
                  </label>
                ))}
              </div>
            )}

            {/* Chart */}
            <div className="h-[340px]">
              {(chartMode === "traj" ? emis?.yearlyData : gains?.yearlyData)?.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  {chartMode === "traj" ? (
                    <LineChart data={emis.yearlyData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.04)" />
                      <XAxis dataKey="year" tick={{ fontSize: 10, fill: "#999" }} interval={0} />
                      <YAxis tick={{ fontSize: 10, fill: "#999" }} tickFormatter={formatTick} />
                      <Tooltip
                        formatter={(value, name) => [
                          `${formatBigNumber(value)} ${emis?.unit || ""}`,
                          TRAJ_SERIES.find((s) => s.key === name)?.label || name,
                        ]}
                        labelFormatter={(label) => `Année ${label}`}
                      />
                      <ReferenceLine x={selectedYear} stroke="#1D9E75" strokeDasharray="3 3" strokeOpacity={0.5} />
                      <Line type="monotone" dataKey="initiale" stroke="#888780" strokeWidth={1.5} dot={false} />
                      <Line type="monotone" dataKey="reference" stroke="#378ADD" strokeWidth={1.5} dot={false} />
                      <Line type="monotone" dataKey="previsionnelle" stroke="#EF9F27" strokeWidth={2} strokeDasharray="5 3" dot={false} />
                      <Line type="monotone" dataKey="expost" stroke="#1D9E75" strokeWidth={2.5} dot={false} />
                    </LineChart>
                  ) : (
                    <AreaChart data={gains.yearlyData}>
                      <defs>
                        {ECART_SERIES.map((s) => (
                          <linearGradient key={s.key} id={`gradient-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={s.color} stopOpacity={0.4} />
                            <stop offset="100%" stopColor={s.color} stopOpacity={0.08} />
                          </linearGradient>
                        ))}
                        <linearGradient id="gradient-ecartPrevRef-neg" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#E24B4A" stopOpacity={0.3} />
                          <stop offset="100%" stopColor="#E24B4A" stopOpacity={0.06} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.04)" />
                      <XAxis dataKey="year" tick={{ fontSize: 10, fill: "#999" }} interval={0} />
                      <YAxis tick={{ fontSize: 10, fill: "#999" }} tickFormatter={formatTick} />
                      <Tooltip
                        content={({ active, payload, label }) => {
                          if (!active || !payload?.length) return null
                          const unit = gains?.unit || ""
                          return (
                            <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-xs">
                              <div className="font-semibold text-[#111] mb-2">Année {label}</div>
                              {ECART_SERIES.map((s) => {
                                const entry = payload.find((p) => p.dataKey === s.key)
                                if (!entry) return null
                                const val = entry.value
                                return (
                                  <div key={s.key} className="flex items-center gap-2 mb-1">
                                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: s.color }} />
                                    <span className="text-[#555]">{s.label} :</span>
                                    <span className="font-semibold" style={{ color: val < 0 ? "#1D9E75" : val > 0 ? "#E24B4A" : "#888" }}>
                                      {val > 0 ? "+" : ""}{formatBigNumber(val)} {unit}
                                    </span>
                                  </div>
                                )
                              })}
                            </div>
                          )
                        }}
                      />
                      <ReferenceLine y={0} stroke="#999" strokeWidth={0.5} />
                      <ReferenceLine x={selectedYear} stroke="#1D9E75" strokeDasharray="3 3" strokeOpacity={0.5} />
{ECART_SERIES.filter((s) => ecartVisible[s.key]).map((s) => (
                        <Area key={s.key} type="monotone" dataKey={s.key} stroke={s.color} strokeWidth={1.5}
                          fill={`url(#gradient-${s.key})`}
                        />
                      ))}
                    </AreaChart>
                  )}
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-sm text-gray-500">Aucune donnée disponible</div>
              )}
            </div>

            {/* Year slider */}
            <div className="flex items-center gap-3.5 mt-3.5 pt-3.5 border-t border-[#eee]">
              <span className="text-xs text-[#888] whitespace-nowrap">Année analysée</span>
              <input
                type="range"
                min={(emis?.yearlyData ?? gains?.yearlyData)?.[0]?.year ?? 2010}
                max={(emis?.yearlyData ?? gains?.yearlyData)?.at(-1)?.year ?? 2050}
                value={selectedYear}
                onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                className="flex-1 accent-[#1D9E75]"
              />
              <span className="text-base font-bold text-[#1D9E75] min-w-[40px] text-right">{selectedYear}</span>
            </div>
          </div>

          {/* SIDEBAR */}
          <div className="space-y-4">
            {/* Gains */}
            <div className="card-shadow p-4">
              <div className="text-sm font-semibold text-[#111] mb-3">
                Gains {selectedYear} · {selectedIndicator}
              </div>
              {(() => {
                const yearEcart = gains?.yearlyData?.find((d) => d.year === selectedYear)
                return (
                  <div className="space-y-3">
                    {[
                      { label: "Prév → Réf", key: "ecartPrevRef", color: "#378ADD", tooltip: "Gain prévu par rapport à la situation de référence (objectif visé)" },
                      { label: "Ex-post → Réf", key: "ecartExpostRef", color: "#1D9E75", tooltip: "Gain réellement constaté par rapport à la situation de référence" },
                      { label: "Ex-post → Prév", key: "ecartExpostPrev", color: "#EF9F27", tooltip: "Écart entre le gain constaté et le gain prévu (sur ou sous-performance)" },
                    ].map((g) => {
                      const val = yearEcart ? yearEcart[g.key] : null
                      return (
                        <div key={g.key} className="rounded-lg p-3" style={{ background: val < 0 ? "#E8F8F2" : val > 0 ? "#FEF2F2" : "#f5f5f5" }} title={g.tooltip}>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: g.color }} />
                            <span className="text-xs font-medium text-[#555]">{g.label}</span>
                          </div>
                          <div className="text-[10px] text-[#999] pl-[18px] mb-1">{g.tooltip}</div>
                          <div className="text-lg font-bold pl-[18px]" style={{ color: val < 0 ? "#1D9E75" : val > 0 ? "#E24B4A" : "#888" }}>
                            {val !== null ? `${val > 0 ? "+" : ""}${formatBigNumber(val)}` : "—"} <span className="text-xs font-normal text-[#999]">{gains?.unit || emis?.unit || ""}</span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )
              })()}
            </div>

            {/* Saisie des données */}
            <div className="card-shadow p-4">
              <h3 className="text-sm font-semibold text-[#111] mb-4">Saisie des données</h3>
              <div className="flex items-center justify-center mb-6">
                <div className="relative w-20 h-20 flex items-center justify-center">
                  <svg className="w-full h-full" viewBox="0 0 36 36">
                    <path
                      className="text-gray-100"
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                    />
                    <path
                      className="text-[#1D9E75] transition-all duration-1000 ease-out"
                      strokeDasharray={`${completeness}, 100`}
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                    />
                  </svg>
                  <span className="absolute text-lg font-bold text-gray-900">{completeness}%</span>
                </div>
              </div>
              <div className="space-y-3">
                {["init", "ref", "prev", "expost"].map((key) => {
                  const pct = completionBySituation[key]
                  const isComplete = pct === 100
                  return (
                    <div
                      key={key}
                      className="flex items-center justify-between rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
                      onClick={() => navigate(`/actions/${action._id}/completion`)}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-2 h-2 rounded-full ${isComplete ? "bg-[#1D9E75]" : "bg-orange-400"}`} />
                        <span className="text-sm font-medium text-gray-700">{SITUATION_LABELS[key]}</span>
                      </div>
                      {isComplete ? <HiCheckCircle className="text-[#1D9E75]" size={20} /> : <span className="text-xs text-gray-400">{pct}%</span>}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>

        {/* BOTTOM: Atteinte des objectifs */}
        <div className="card-shadow p-4">
          <div className="text-sm font-semibold text-[#111] mb-1">Atteinte des objectifs · {selectedYear}</div>
          <div className="text-[10px] text-[#999] mb-3">Pourcentage du gain constaté (ex-post) par rapport au gain prévu (prévisionnel), relativement à la situation de référence. 100% = objectif atteint.</div>
          <div className="space-y-3">
            {Object.values(ind).map((indicator) => {
              const pct = Math.round(Math.min(getAchievementForYear(indicator, selectedYear), 100))
              const d = getYearData(indicator, selectedYear)
              return (
                <div key={indicator.label} className="flex items-center gap-2.5" title={`${indicator.label} : gain constaté ${formatBigNumber(Math.abs(d?.ecartExpostRef))} / gain prévu ${formatBigNumber(Math.abs(d?.ecartPrevRef))} ${indicator.unit} = ${pct}% de l'objectif`}>
                  <span className="text-[13px] text-[#555] min-w-[60px]">{indicator.label}</span>
                  <div className="flex-1 h-1.5 bg-[#eee] rounded-sm overflow-hidden">
                    <div className="h-full rounded-sm" style={{ width: `${pct}%`, background: scoreColor(pct) }} />
                  </div>
                  <span className="text-xs text-[#999] whitespace-nowrap text-right min-w-[110px]">
                    −{formatBigNumber(Math.abs(d?.ecartExpostRef))} / −{formatBigNumber(Math.abs(d?.ecartPrevRef))} {indicator.unit}
                  </span>
                  <span className="text-[13px] font-semibold min-w-[36px] text-right" style={{ color: scoreColor(pct) }}>
                    {pct}%
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
