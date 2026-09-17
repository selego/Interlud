import React, { useEffect, useMemo, useState } from "react"
import toast from "react-hot-toast"
import api from "@/services/api"
import Loader from "@/components/loader"

const COLORS = {
  green: "#2DAC6A",
  orange: "#F59600",
  red: "#E5484D",
  slate: "#0A3641",
  secondary: "#768776",
  border: "#EEF3F0",
}

const SITUATIONS = ["init", "ref", "prev", "expost"]

const STATUS_LABELS = {
  completed: "Complétée",
  upcoming: "À venir",
  in_progress: "En cours",
  blocked: "À l'arrêt",
  no_status: "Nouvelle",
}

const completionColor = (pct, threshold) => (pct >= 80 ? COLORS.green : pct >= threshold ? COLORS.orange : COLORS.red)

const average = (values) => (values.length ? Math.round(values.reduce((s, v) => s + v, 0) / values.length) : 0)

const relativeDate = (date) => {
  if (!date) return "—"
  const diffMs = Date.now() - new Date(date).getTime()
  const days = Math.floor(diffMs / 86400000)
  if (days <= 0) return "aujourd'hui"
  if (days === 1) return "hier"
  if (days < 7) return `il y a ${days} jours`
  if (days < 30) return `il y a ${Math.floor(days / 7)} semaine(s)`
  if (days < 365) return `il y a ${Math.floor(days / 30)} mois`
  return `il y a ${Math.floor(days / 365)} an(s)`
}

export default function Suivi() {
  const [collectivities, setCollectivities] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [situationFilter, setSituationFilter] = useState("all")
  const [levelFilter, setLevelFilter] = useState("all")
  const [sortDesc, setSortDesc] = useState(true)
  const [expanded, setExpanded] = useState({})
  const [threshold, setThreshold] = useState(40)
  const [showEco, setShowEco] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const { ok, data, code } = await api.get("/dashboard/collectivities")
        if (!ok) return toast.error(code || "Erreur lors de la récupération des collectivités")
        setCollectivities(data)
      } catch (error) {
        toast.error(error.code || "Erreur lors de la récupération des collectivités")
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  const computed = useMemo(() => {
    return collectivities.map((c) => {
      const actions = showEco ? c.actions : c.actions.filter((a) => a.owner !== "economic_actor")
      const completion = {}
      SITUATIONS.forEach((s) => (completion[s] = average(actions.map((a) => a[`completion_${s}`] || 0))))
      const globalPct = situationFilter === "all" ? average(SITUATIONS.map((s) => completion[s])) : completion[situationFilter]
      const nEco = actions.filter((a) => a.owner === "economic_actor").length
      return { ...c, actions, completion, globalPct, nEco }
    })
  }, [collectivities, showEco, situationFilter])

  const rows = useMemo(() => {
    let list = computed
    const q = search.trim().toLowerCase()
    if (q) list = list.filter((c) => `${c.name} ${c.department || ""}`.toLowerCase().includes(q))
    if (levelFilter === "low") list = list.filter((c) => c.globalPct < threshold)
    if (levelFilter === "mid") list = list.filter((c) => c.globalPct >= threshold && c.globalPct < 80)
    if (levelFilter === "high") list = list.filter((c) => c.globalPct >= 80)
    return [...list].sort((a, b) => (sortDesc ? b.globalPct - a.globalPct : a.globalPct - b.globalPct))
  }, [computed, search, levelFilter, threshold, sortDesc])

  const kpis = useMemo(() => {
    const allActions = computed.flatMap((c) => c.actions)
    const totalEco = allActions.filter((a) => a.owner === "economic_actor").length
    const withActions = computed.filter((c) => c.actions.length > 0)
    const avgAll = average(withActions.map((c) => average(SITUATIONS.map((s) => c.completion[s]))))
    const expostStarted = allActions.filter((a) => (a.completion_expost || 0) > 0).length
    return [
      { label: "Collectivités engagées", value: String(computed.length), sub: "programme InTerLUD+", subColor: COLORS.secondary },
      { label: "Actions renseignées", value: String(allActions.length), sub: `${totalEco} portées par des acteurs éco`, subColor: COLORS.secondary },
      { label: "Complétion moyenne", value: `${avgAll} %`, sub: "toutes situations", subColor: avgAll >= 80 ? COLORS.green : COLORS.orange },
      { label: "Évaluations ex-post démarrées", value: String(expostStarted), sub: `sur ${allActions.length} actions`, subColor: COLORS.secondary },
    ]
  }, [computed])

  const toggle = (id) => setExpanded((prev) => ({ ...prev, [id]: !prev[id] }))

  if (loading) return <Loader />

  return (
    <div className="min-h-screen p-8" style={{ background: "#F7FAF8" }}>
      <div className="max-w-[1240px] mx-auto">
        <div className="mb-7">
          <div className="font-quicksand text-[13px] font-bold uppercase text-primary-green mb-1.5" style={{ letterSpacing: "0.08em" }}>
            EVALUD · Administration
          </div>
          <h1 className="font-quicksand text-[30px] font-bold text-primary-slate m-0">Suivi des collectivités</h1>
          <p className="mt-2 text-[15px] text-font-secondary">Vue globale des actions renseignées et de leur niveau de complétion par situation.</p>
        </div>

        <div className="grid gap-4 mb-6" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
          {kpis.map((kpi) => (
            <div key={kpi.label} className="card-shadow" style={{ padding: "18px 20px" }}>
              <div className="text-[13px] font-semibold text-font-secondary mb-2">{kpi.label}</div>
              <div className="flex items-baseline gap-2">
                <span className="font-quicksand text-[28px] font-bold text-primary-slate">{kpi.value}</span>
                <span className="text-[13px]" style={{ color: kpi.subColor }}>
                  {kpi.sub}
                </span>
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3 mb-4">
          <input
            type="text"
            placeholder="Rechercher une collectivité…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input-primary flex-1 min-w-[220px] max-w-[340px]"
          />
          <select value={situationFilter} onChange={(e) => setSituationFilter(e.target.value)} className="input-primary">
            <option value="all">Complétion globale</option>
            <option value="init">Situation initiale</option>
            <option value="ref">Année de référence</option>
            <option value="prev">Prévisionnel</option>
            <option value="expost">Ex-post</option>
          </select>
          <select value={levelFilter} onChange={(e) => setLevelFilter(e.target.value)} className="input-primary">
            <option value="all">Tous les niveaux</option>
            <option value="low">Faible (&lt; seuil d'alerte)</option>
            <option value="mid">Intermédiaire</option>
            <option value="high">Élevé (≥ 80 %)</option>
          </select>
          <button
            type="button"
            onClick={() => setSortDesc((v) => !v)}
            className="px-3.5 py-2 rounded-lg border border-secondary-green bg-white text-sm text-primary-slate hover:bg-deco-background-green"
          >
            Tri : complétion {sortDesc ? "↓" : "↑"}
          </button>
          <label className="flex items-center gap-2 text-[13px] text-font-secondary">
            Seuil d'alerte
            <input type="number" min={0} max={100} step={5} value={threshold} onChange={(e) => setThreshold(Number(e.target.value) || 0)} className="input-primary w-[72px]" />
            %
          </label>
          <label className="flex items-center gap-2 text-[13px] text-font-secondary cursor-pointer">
            <input type="checkbox" checked={showEco} onChange={(e) => setShowEco(e.target.checked)} />
            Afficher les acteurs éco
          </label>
          <span className="text-[13px] text-font-secondary ml-auto">
            {rows.length} collectivité(s) · seuil d'alerte {threshold} %
          </span>
        </div>

        <div className="bg-white rounded-2xl overflow-x-auto" style={{ boxShadow: "0 0 17px 0 rgba(10,54,65,0.10)" }}>
          <div className="min-w-[960px]">
            <div
              className="grid items-center gap-2 text-[12px] font-bold uppercase"
              style={{ gridTemplateColumns: "minmax(200px, 2.2fr) 70px repeat(4, 64px) minmax(130px, 1.2fr) 36px", padding: "12px 20px", background: "#F5F7F6", color: "#607D6B", letterSpacing: "0.04em" }}
            >
              <span>Collectivité</span>
              <span className="text-center">Actions</span>
              <span className="text-center">Init</span>
              <span className="text-center">Réf</span>
              <span className="text-center">Prév</span>
              <span className="text-center">Ex-post</span>
              <span>Complétion globale</span>
              <span></span>
            </div>

            {rows.map((row) => {
              const isOpen = !!expanded[row._id]
              const alert = row.globalPct < threshold
              const globalColor = completionColor(row.globalPct, threshold)
              return (
                <div key={row._id} style={{ borderTop: `1px solid ${COLORS.border}` }}>
                  <div
                    onClick={() => toggle(row._id)}
                    className="grid items-center gap-2 cursor-pointer hover:bg-deco-background-green"
                    style={{ gridTemplateColumns: "minmax(200px, 2.2fr) 70px repeat(4, 64px) minmax(130px, 1.2fr) 36px", padding: "14px 20px", background: alert ? "#FFFBF5" : undefined }}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[15px] font-semibold text-primary-slate truncate">{row.name}</span>
                        {alert && (
                          <span className="shrink-0 text-[11px] font-bold rounded-full px-2 py-0.5" style={{ color: "#B45309", background: "#FFF3E0" }}>
                            sous seuil
                          </span>
                        )}
                      </div>
                      <div className="text-[12.5px] text-font-secondary mt-[3px]">
                        {row.department || "Département inconnu"}
                        {showEco && row.nEco > 0 ? ` · ${row.nEco} acteur(s) éco` : ""}
                      </div>
                    </div>
                    <span className="text-center text-[13.5px]" style={{ color: "#4A5D53" }}>
                      {row.actions.length}
                    </span>
                    {SITUATIONS.map((s) => (
                      <span key={s} className="text-center text-[13.5px] font-bold" style={{ color: completionColor(row.completion[s], threshold) }}>
                        {row.completion[s]} %
                      </span>
                    ))}
                    <div className="flex items-center gap-2.5">
                      <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: COLORS.border }}>
                        <div className="h-full rounded-full" style={{ width: `${row.globalPct}%`, background: globalColor }} />
                      </div>
                      <span className="text-[13.5px] font-bold w-10 text-right" style={{ color: globalColor }}>
                        {row.globalPct} %
                      </span>
                    </div>
                    <span className="text-center text-[13px] text-font-secondary transition-transform duration-150" style={{ transform: isOpen ? "rotate(180deg)" : "none" }}>
                      ▾
                    </span>
                  </div>

                  {isOpen && (
                    <div style={{ padding: "4px 20px 18px 20px", background: "#FBFDFC" }}>
                      <div
                        className="grid gap-2 text-[11.5px] font-bold uppercase"
                        style={{ gridTemplateColumns: "minmax(180px, 2fr) 110px 90px repeat(4, 62px) minmax(110px, 1fr)", padding: "8px 14px", color: "#99A89F", letterSpacing: "0.04em" }}
                      >
                        <span>Action</span>
                        <span>Porteur</span>
                        <span>Statut</span>
                        <span className="text-center">Init</span>
                        <span className="text-center">Réf</span>
                        <span className="text-center">Prév</span>
                        <span className="text-center">Ex-post</span>
                        <span>Dernière modification</span>
                      </div>
                      {row.actions.length === 0 && <div className="text-[13px] text-font-secondary px-3.5 py-2">Aucune action renseignée.</div>}
                      {row.actions.map((act) => {
                        const isEco = act.owner === "economic_actor"
                        return (
                          <div
                            key={act._id}
                            className="grid items-center gap-2 bg-white rounded-[10px] mb-1.5"
                            style={{ gridTemplateColumns: "minmax(180px, 2fr) 110px 90px repeat(4, 62px) minmax(110px, 1fr)", padding: "10px 14px", border: `1px solid ${COLORS.border}` }}
                          >
                            <div className="min-w-0">
                              <div className="text-[13.5px] font-semibold text-font-primary truncate">{act.name}</div>
                              <div className="text-[12px] mt-0.5" style={{ color: "#99A89F" }}>
                                {act.action_parent_name || ""}
                              </div>
                            </div>
                            <span
                              className="justify-self-start text-[11.5px] font-bold rounded-full px-2.5 py-[3px] whitespace-nowrap overflow-hidden text-ellipsis max-w-[118px]"
                              style={{ color: isEco ? "#8A5A00" : "#1B7A4A", background: isEco ? "#FFF3E0" : "#D9EFE3" }}
                              title={isEco ? act.economic_actor_name : "Collectivité"}
                            >
                              {isEco ? act.economic_actor_name || "Acteur éco" : "Collectivité"}
                            </span>
                            <span className="text-[13px]" style={{ color: "#4A5D53" }}>
                              {STATUS_LABELS[act.status] || STATUS_LABELS.no_status}
                            </span>
                            {SITUATIONS.map((s) => (
                              <span key={s} className="text-center text-[13px] font-bold" style={{ color: completionColor(act[`completion_${s}`] || 0, threshold) }}>
                                {act[`completion_${s}`] || 0} %
                              </span>
                            ))}
                            <span className="text-[12.5px] text-font-secondary">{relativeDate(act.last_modif_date)}</span>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}

            {rows.length === 0 && (
              <div className="text-center text-[14px] text-font-secondary" style={{ padding: "48px 20px", borderTop: `1px solid ${COLORS.border}` }}>
                Aucune collectivité ne correspond aux filtres.
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-5 mt-3.5 text-[12.5px] text-font-secondary">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-2.5 rounded-[3px]" style={{ background: COLORS.green }} />≥ 80 % complété
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-2.5 rounded-[3px]" style={{ background: COLORS.orange }} />
            Intermédiaire
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-2.5 rounded-[3px]" style={{ background: COLORS.red }} />
            Sous le seuil d'alerte
          </span>
          <span className="ml-auto">Complétion = indicateurs remplis / indicateurs affichés, par situation (init · réf · prév · ex-post)</span>
        </div>
      </div>
    </div>
  )
}
