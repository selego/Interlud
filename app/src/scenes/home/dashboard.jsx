import React, { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { PieChart, Pie, Cell, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts"
import api from "@/services/api"
import toast from "react-hot-toast"
import Select from "@/components/Select"
import ProgressCircle from "@/components/ProgressCircle"
import Loader from "@/components/loader"

const getStatusInfo = (status) => {
  const statusMap = {
    completed: {
      label: "Terminée",
      labelPlural: "Terminées",
      badgeClass: "bg-primary-green/10 text-primary-green",
      color: "#2DAC6A",
    },
    in_progress: {
      label: "À compléter",
      labelPlural: "À compléter",
      badgeClass: "bg-primary-orange/10 text-primary-orange",
      color: "#F59600",
    },
    upcoming: {
      label: "À venir",
      labelPlural: "À venir",
      badgeClass: "bg-primary-teal/10 text-primary-teal",
      color: "#56BDB8",
    },
    blocked: {
      label: "Bloquée",
      labelPlural: "Bloquées",
      badgeClass: "bg-primary-red/10 text-primary-red",
      color: "#F43C36",
    },
    no_status: {
      label: "En attente",
      labelPlural: "En attente",
      badgeClass: "bg-gray-100 text-gray-700",
      color: "#6B7280",
    },
  };

  return statusMap[status] || {
    label: "Aucun statut",
    labelPlural: "Aucun statut",
    badgeClass: "bg-gray-100 text-gray-700",
    color: "#6B7280",
  };
}

const getStatutBadgeClass = (status) => getStatusInfo(status).badgeClass;
const getStatusLabel = (status) => getStatusInfo(status).label;

export default function Dashboard({ collectivity }) {
  const [loadingSummary, setLoadingSummary] = useState(true)
  const [loadingEvolution, setLoadingEvolution] = useState(true)
  const [loadingActions, setLoadingActions] = useState(true)
  const [summary, setSummary] = useState(null)
  const [evolution, setEvolution] = useState(null)
  const [actions, setActions] = useState([])
  const navigate = useNavigate()
  const [actionsToDisplay, setActionsToDisplay] = useState([])
  const [searchQuery, setSearchQuery] = useState("")
  const [timeframe, setTimeframe] = useState("all")
  const [selectedStatus, setSelectedStatus] = useState("all")
  const [visibleLines, setVisibleLines] = useState({
    completed: true,
    in_progress: true,
    upcoming: true,
  })

  const loadSummary = async () => {
    if (!collectivity?._id) return
    try {
      setLoadingSummary(true)
      const { ok, data, code } = await api.post(`/dashboard/summary`, {
        collectivity_id: collectivity._id,
        timeframe: timeframe,
      })
      if (!ok) return toast.error(code || "Une erreur est survenue lors du chargement de la synthèse")
      setSummary(data)
    } catch (error) {
      console.error("Erreur lors du chargement de la synthèse:", error)
      toast.error("Une erreur est survenue lors du chargement de la synthèse")
    } finally {
      setLoadingSummary(false)
    }
  }

  const loadEvolution = async () => {
    if (!collectivity?._id) return
    try {
      setLoadingEvolution(true)
      const { ok, data, code } = await api.post(`/dashboard/evolution`, {
        collectivity_id: collectivity._id,
        timeframe: timeframe,
      })
      if (!ok) return toast.error(code || "Une erreur est survenue lors du chargement de l'évolution")
      setEvolution(data)
    } catch (error) {
      console.error("Erreur lors du chargement de l'évolution:", error)
      toast.error("Une erreur est survenue lors du chargement de l'évolution")
    } finally {
      setLoadingEvolution(false)
    }
  }

  const loadActions = async () => {
    if (!collectivity?._id) return
    try {
      setLoadingActions(true)
      const { ok, data, code } = await api.post(`/action/search`, {
        collectivity_id: collectivity._id,
      })
      if (!ok) return toast.error(code || "Une erreur est survenue lors du chargement des actions")
      setActions(data)
    } catch (error) {
      console.error("Erreur lors du chargement des actions:", error)
      toast.error("Une erreur est survenue lors du chargement des actions")
    } finally {
      setLoadingActions(false)
    }
  }

  useEffect(() => {
    loadActions()
  }, [collectivity])

  useEffect(() => {
    loadSummary()
    loadEvolution()
  }, [collectivity, timeframe])

  const handleSearchActions = (search, statusFilter = selectedStatus) => {
    setSearchQuery(search)
    const normalizeString = str =>
      str
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()

    if (!actions || actions.length === 0) return

    let filteredActions = actions
    
    if (statusFilter && statusFilter !== "all") {
      filteredActions = filteredActions.filter(action => action.status === statusFilter)
    }

    if (search !== "") {
      filteredActions = filteredActions.filter(action => 
        normalizeString(action.name).includes(normalizeString(search))
      )
    }

    setActionsToDisplay(filteredActions.slice(0, 3))
  }

  useEffect(() => {
    if (actions && actions.length > 0) {
      handleSearchActions(searchQuery, selectedStatus)
    }
  }, [selectedStatus, actions])

  const distribution = {
    completed: actions.filter((a) => a.status === "completed").length,
    toComplete: actions.filter((a) => a.status === "in_progress").length,
    pending: actions.filter((a) => a.status === "upcoming" || a.status === "no_status").length,
    blocked: actions.filter((a) => a.status === "blocked").length,
  }

  if (loadingActions || !collectivity) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-500">Chargement...</div>
      </div>
    )
  }

  const pieData = [
    { name: getStatusInfo("completed").labelPlural, value: distribution.completed || 0, status: "completed" },
    { name: getStatusInfo("in_progress").labelPlural, value: distribution.toComplete || 0, status: "in_progress" },
    { name: getStatusInfo("upcoming").labelPlural + " / " + getStatusInfo("no_status").labelPlural, value: distribution.pending || 0, status: "pending" },
    { name: getStatusInfo("blocked").labelPlural, value: distribution.blocked || 0, status: "blocked" }
  ]
  
  const calculateYDomain = () => {
    if (!evolution || evolution.length === 0) {
      return [0, 10];
    }
    
    let maxValue = 0;
    evolution.forEach((point) => {
      const values = [
        point.completed || 0,
        point.in_progress || 0,
        point.upcoming || 0,
      ];
      const pointMax = Math.max(...values);
      if (pointMax > maxValue) {
        maxValue = pointMax;
      }
    });
    
    const roundedMax = Math.ceil(maxValue * 1.1);
    return [0, roundedMax < 1 ? 1 : roundedMax];
  };
  
  const yDomain = calculateYDomain();
  
  return (
    <div className="">
      <div className="relative z-10 max-w-8xl mx-auto px-6 sm:px-8 lg:px-10 py-8">
        <div className="flex items-center justify-between mb-8">
          <div className="flex-1">
            <h1 className="text-font-primary text-4xl">
              Dashboard de <span className="font-bold text-primary-green">{collectivity.name}</span>
            </h1>
            <p className="text-base mt-1">Ce tableau de bord est personnel</p>
          </div>
          <Select
            value={timeframe}
            className="!w-48"
            onChange={value => setTimeframe(value)}
            options={[
              { value: "all", label: "Tous" },
              { value: "year", label: "Cette année" },
              { value: "month", label: "Ce mois" },
              { value: "week", label: "Cette semaine" }
            ]}
          />
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-15 gap-6 mb-12">
          <div className="xl:col-span-3 p-6 card-shadow">
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-bold text-font-primary text-2xl">Synthèse</h3>
            </div>

            <div className="space-y-4">
              {loadingSummary && <Loader size="small" />}
              <div className=" gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-4xl font-bold text-gray-900">{summary?.actionsCreated || 0}</span>
                </div>
                <span className="text-lg text-font-secondary">Actions crées</span>
              </div>

              <div className="gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-4xl font-bold text-gray-900">{summary?.actionsUpdated || 0}</span>
                </div>
                <span className="text-lg text-font-secondary">Actions mise à jour</span>
              </div>

              <div className="gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-4xl font-bold text-gray-900">{summary?.actionsCompleted || 0}</span>
                </div>
                <span className="text-lg text-font-secondary">Actions terminées</span>
              </div>
              <div className="gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-4xl font-bold text-gray-900">{summary?.actionsBlocked || 0}</span>
                </div>
                <span className="text-lg text-font-secondary">Actions bloquées</span>
              </div>
            </div>
          </div>

          {/* Card Répartition des actions */}
          <div className="xl:col-span-4 p-6 h-full card-shadow">
            <h3 className="font-bold text-font-primary text-2xl mb-4">Répartition des actions</h3>

            <div className="flex gap-2 mb-6 flex-wrap">
              {["completed", "in_progress", "upcoming", "blocked"].map(status => {
                const statusInfo = getStatusInfo(status)
                return (
                  <div
                    key={status}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all text-white"
                    style={{ backgroundColor: statusInfo.color }}
                  >
                    {statusInfo.labelPlural}
                  </div>
                )
              })}
            </div>

            {/* Donut Chart */}
            <div className="h-[260px] flex flex-col items-center justify-center relative">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={95} paddingAngle={4} dataKey="value">
                    {pieData.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={
                          entry.status === "completed"
                            ? getStatusInfo("completed").color
                            : entry.status === "in_progress"
                            ? getStatusInfo("in_progress").color
                            : entry.status === "pending"
                            ? getStatusInfo("upcoming").color
                            : getStatusInfo("blocked").color
                        }
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        return (
                          <div className="bg-white border-2 border-gray-800 rounded-lg p-3 shadow-lg">
                            <p className="font-bold text-sm mb-1">{payload[0].name}</p>
                            <p className="text-sm text-gray-600">
                              Nombre <span className="text-primary-teal font-bold text-lg ml-1">{payload[0].value}</span>
                            </p>
                          </div>
                        )
                      }
                      return null
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>

              <div className="mt-6 flex flex-wrap gap-x-4 gap-y-2 justify-center text-xs text-gray-600">
                {["completed", "in_progress", "upcoming", "blocked"].map(status => {
                  const statusInfo = getStatusInfo(status)
                  return (
                    <div key={status} className="flex items-center gap-1.5">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: statusInfo.color }}></div>
                      <span>Actions {statusInfo.labelPlural.toLowerCase()}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          <div className="xl:col-span-8 p-6 h-full card-shadow">
            {loadingEvolution && <Loader size="small" />}
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-font-primary text-2xl">Évolutions du statut des actions</h3>
            </div>

            <div className="flex gap-2 mb-6 flex-wrap">
              {["completed", "in_progress", "upcoming"].map(status => {
                const statusInfo = getStatusInfo(status)
                const statusKey = status === "in_progress" ? "in_progress" : status
                const isVisible = visibleLines[statusKey]

                return (
                  <div
                    key={status}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all text-white cursor-pointer hover:opacity-90"
                    style={{ backgroundColor: statusInfo.color }}
                    onClick={() => {
                      setVisibleLines(prev => ({
                        ...prev,
                        [statusKey]: !prev[statusKey]
                      }))
                    }}
                  >
                    {statusInfo.labelPlural}
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      {isVisible ? (
                        <>
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                          />
                        </>
                      ) : (
                        <>
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
                          />
                        </>
                      )}
                    </svg>
                  </div>
                )
              })}
            </div>

            <div className="h-[260px] rounded-lg overflow-hidden mt-2">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={evolution || []} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis
                    dataKey="period"
                    tick={{ fontSize: 11, fill: "#6b7280" }}
                    axisLine={{ stroke: "#e5e7eb" }}
                    tickLine={{ stroke: "#e5e7eb" }}
                    angle={timeframe === "week" ? -45 : timeframe === "all" ? -45 : 0}
                    textAnchor={timeframe === "week" || timeframe === "all" ? "end" : "middle"}
                    height={timeframe === "week" || timeframe === "all" ? 60 : 30}
                    interval={timeframe === "week" ? 0 : timeframe === "all" ? "equidistantPreserveStartEnd" : "preserveStartEnd"}
                    tickFormatter={value => {
                      return value
                    }}
                  />
                  <YAxis domain={yDomain} tick={{ fontSize: 11, fill: "#6b7280" }} axisLine={{ stroke: "#e5e7eb" }} tickLine={{ stroke: "#e5e7eb" }} allowDecimals={false} />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (active && payload && payload.length) {
                        return (
                          <div className="bg-white border-2 border-primary-orange rounded-lg p-3 shadow-lg">
                            <p className="font-bold text-sm mb-1">{label}</p>
                            {payload.map((entry, index) => (
                              <p key={index} className="text-sm text-gray-600">
                                Nombre d'actions {entry.name?.toLowerCase()}
                                <span className="text-primary-orange font-bold text-lg ml-1">{entry.value}</span>
                              </p>
                            ))}
                          </div>
                        )
                      }
                      return null
                    }}
                  />
                  {visibleLines.completed && (
                    <Line
                      type="monotone"
                      dataKey="completed"
                      stroke={getStatusInfo("completed").color}
                      strokeWidth={3}
                      name={getStatusInfo("completed").labelPlural}
                      dot={{ fill: getStatusInfo("completed").color, r: 4 }}
                      activeDot={{ r: 6 }}
                    />
                  )}
                  {visibleLines.in_progress && (
                    <Line
                      type="monotone"
                      dataKey="in_progress"
                      stroke={getStatusInfo("in_progress").color}
                      strokeWidth={3}
                      name={getStatusInfo("in_progress").labelPlural}
                      dot={{ fill: getStatusInfo("in_progress").color, r: 4 }}
                      activeDot={{ r: 6 }}
                    />
                  )}
                  {visibleLines.upcoming && (
                    <Line
                      type="monotone"
                      dataKey="upcoming"
                      stroke={getStatusInfo("upcoming").color}
                      strokeWidth={3}
                      name={getStatusInfo("upcoming").labelPlural}
                      dot={{ fill: getStatusInfo("upcoming").color, r: 4 }}
                      activeDot={{ r: 6 }}
                    />
                  )}
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="mt-6 flex flex-wrap gap-x-4 gap-y-2 justify-start text-xs text-gray-600">
              {["completed", "in_progress", "upcoming"].map(status => {
                const statusInfo = getStatusInfo(status)
                return (
                  <div key={status} className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: statusInfo.color }}></div>
                    <span>Actions {statusInfo.labelPlural.toLowerCase()}</span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-4">
              <h2 className="font-bold text-font-primary text-3xl">Toutes les actions</h2>
              <div className="relative">
                <input
                  type="text"
                  placeholder="Rechercher une action..."
                  value={searchQuery}
                  onChange={e => handleSearchActions(e.target.value)}
                  className="pl-10 pr-4 py-2 input-primary text-sm w-96"
                />
                <svg className="w-5 h-5 text-gray-400 absolute left-3 top-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <Select
                value={selectedStatus || "all"}
                onChange={value => {
                  setSelectedStatus(value)
                }}
                options={[
                  { value: "all", label: "Tous" },
                  { value: "completed", label: "Terminée" },
                  { value: "blocked", label: "Bloquée" },
                  { value: "in_progress", label: "En attente" },
                  { value: "upcoming", label: "À venir" }
                ]}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {actionsToDisplay.map(action => (
              <div key={action._id} className="card-shadow p-6 h-full flex flex-col" onClick={() => navigate(`/actions/${action._id}/dashboard`)}>
                <div className="mb-3">
                  <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${getStatutBadgeClass(action.status)}`}>{getStatusLabel(action.status)}</span>
                </div>

                <h3 className="font-bold text-font-primary text-lg mb-2 truncate">{action.name}</h3>
                <p className="text-sm text-gray-500 mb-3 line-clamp-2">{action.description}</p>

                <div className="mt-auto pt-3 flex items-center justify-between">
                  <button className="text-sm text-primary-orange font-semibold border-b border-primary-orange">Voir l'action</button>
                  <div className="flex items-center gap-1">
                    <ProgressCircle percentage={action.completeness} size={20} />
                    <p className="text-sm text-gray-900">
                      Complétée à <strong>{action.completeness}%</strong>
                    </p>
                  </div>
                </div>
              </div>
            ))}

            <div
              className="h-full card-shadow rounded-2xl border-2 border-dashed border-primary-green/60 hover:border-primary-green bg-white p-6 text-center cursor-pointer transition-colors flex flex-col items-center justify-center"
              onClick={() => navigate(`/actions`)}
            >
              <div className="flex flex-col items-center gap-3 mb-2">
                <div className="grid grid-cols-2 gap-2">
                  <div className="w-7 h-7 rounded-md ring-2 ring-primary-green"></div>
                  <div className="w-7 h-7 rounded-md bg-primary-green"></div>
                  <div className="w-7 h-7 rounded-md ring-2 ring-primary-green"></div>
                  <div className="w-7 h-7 rounded-md bg-primary-green"></div>
                </div>
                <div className="text-primary-green text-xl leading-none tracking-widest">...</div>
              </div>
              <p className="text-base font-semibold text-primary-green">Voir toutes les actions</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}