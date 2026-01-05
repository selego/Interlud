import React, { useState, useEffect } from "react"
import { Navigate, useNavigate } from "react-router-dom"
import { PieChart, Pie, Cell, LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts"
import api from "@/services/api"
import toast from "react-hot-toast"
import useStore from "@/services/store"
import Select from "@/components/Select"
import ProgressCircle from "@/components/ProgressCircle"
import DebouncedInput from "@/components/debounceInput"
import Loader from "@/components/loader"
import Modal from "@/components/modal"

const getStatutBadgeClass = (statut) => {
  if (statut === "completed") return { class: "bg-primary-green/10 text-primary-green", text: "Terminée" }
  if (statut === "upcoming") return { class: "bg-primary-teal/10 text-primary-teal", text: "À venir" }
  if (statut === "in_progress") return { class: "bg-primary-orange/10 text-primary-orange", text: "En cours" }
  if (statut === "blocked") return { class: "bg-red-100 text-red-700", text: "Bloquée" }
  return { class: "bg-gray-100 text-gray-700", text: "Nouvelle" }
}

export default function Home() {
  const [actions, setActions] = useState([])
  const navigate = useNavigate()
  const { collectivity, user } = useStore()
  const [filters, setFilters] = useState({ search: "", status: "" })
  const [synthese, setSynthese] = useState({ actionsCreated: 0, actionsInProgress: 0, actionsCompleted: 0, actionsBlocked: 0, actionsUpcoming: 0, actionsWithoutStatus: 0 })
  const [evolutionStatuts, setEvolutionStatuts] = useState([])
  const [period, setPeriod] = useState("month")
  const [visibleLines, setVisibleLines] = useState({ actionsCompleted: true, actionsInProgress: true, actionsBlocked: true, actionsUpcoming: true })
  const [isModalOpen, setIsModalOpen] = useState(false)
  
  const fetchEvolutionStatuts = async () => {
    try {
      const { ok, data, code } = await api.post("/dashboard/evolution-statuts", { collectivity_id: collectivity._id, period: period })
      if (!ok) return toast.error(code || "Une erreur est survenue")
      setEvolutionStatuts(data)
      console.log("evolutionStatuts", data)
    } catch (error) {
      toast.error(error.code || "Une erreur est survenue")
    }
  }

  const fetchSynthese = async () => {
    try {
      const { ok, data, code } = await api.post("/dashboard/synthese", { collectivity_id: collectivity._id, period: period })
      if (!ok) return toast.error(code || "Une erreur est survenue")
      setSynthese(data)
      console.log("synthese", data)
    } catch (error) {
      toast.error(error.code || "Une erreur est survenue")
    }
  }

  const fetchActions = async () => {
    try {
      const { ok, data, code } = await api.post("/action/search", { collectivity_id: collectivity._id, ...filters })
      if (!ok) return toast.error(code || "Une erreur est survenue")
      setActions(data)
    } catch (error) {
      toast.error(error.code || "Une erreur est survenue")
    }
  }

  const exportExcelFile = async () => {
    try {
      const { ok, data, code } = await api.post("/excel/export", { fileId: collectivity.excelFileId })
      if (!ok) return toast.error(code || "Erreur lors de l'export")
      const link = document.createElement("a");
      link.href = data.downloadUrl
      link.download = data.fileName || "export.xlsx";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      toast.error(error.code || "Une erreur est survenue");
    }
  }

  useEffect(() => {
    if ((user.collectivities.length === 0 || !user.collectivities.some((c) => c.status === "approved")) && user.role !== "admin")
      return navigate("/collectivity/join", { replace: true })
    if (!collectivity) return
    fetchActions()
    fetchSynthese()
    fetchEvolutionStatuts()
  }, [collectivity, filters, period])

  if (!collectivity) return <Loader />

  const pieData = [
    { name: "Terminées", value: synthese.actionsCompleted || 0 },
    { name: "À venir", value: synthese.actionsUpcoming || 0 },
    { name: "En progression", value: synthese.actionsInProgress || 0 },
    { name: "Sans statut", value: synthese.actionsWithoutStatus || 0 },
    { name: "Bloquées", value: synthese.actionsBlocked || 0 }
  ]

  return (
    <div className="">
      <div className="relative z-10 max-w-8xl mx-auto px-6 sm:px-8 lg:px-10 py-8">
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-font-primary text-4xl">
                Dashboard de <span className="font-bold text-primary-green">{collectivity.name}</span>
              </h1>
              <p className="text-base mt-1">Ce tableau de bord est personnel</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={ exportExcelFile }
                className="button-primary"
              >
                Export Excel
              </button>
              <Select
                value={period}
                onChange={(value) => setPeriod(value)}
                options={[
                  { value: "today", label: "Aujourd'hui" },
                  { value: "week", label: "Cette semaine" },
                  { value: "month", label: "Ce mois-ci" },
                  { value: "year", label: "Cette année" }
                ]}
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-15 gap-6 mb-12">
          <div className="xl:col-span-3 p-6 h-[430px] card-shadow">
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-bold text-font-primary text-2xl">Synthèse</h3>
            </div>

            <div className="space-y-4">
              <div className=" gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-4xl font-bold text-gray-900">{synthese.actionsCreated}</span>
                </div>
                <span className="text-lg text-font-secondary">Total actions</span>
              </div>

              <div className="gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-4xl font-bold text-gray-900">{synthese.actionsInProgress}</span>
                </div>

                <span className="text-lg text-font-secondary">Actions en progression</span>
              </div>

              <div className="gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-4xl font-bold text-gray-900">{synthese.actionsCompleted}</span>
                </div>

                <span className="text-lg text-font-secondary">Actions complétées</span>
              </div>
              <div className="gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-4xl font-bold text-gray-900">{synthese.actionsBlocked}</span>
                </div>

                <span className="text-lg text-font-secondary">Actions bloquées</span>
              </div>
            </div>
          </div>

          {/* Card Répartition des actions */}
          <div className="xl:col-span-4 p-6 h-full card-shadow">
            <h3 className="font-bold text-font-primary text-2xl mb-4">Répartition des actions</h3>

            {/* Donut Chart */}
            <div className="h-[340px] flex flex-col items-center justify-center relative">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={95} paddingAngle={4} dataKey="value">
                    {pieData.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={
                          entry.name === "Complétées"
                            ? "#2DAC6A"
                            : entry.name === "En progression"
                            ? "#F59600"
                            : entry.name === "À venir"
                            ? "#56BDB8"
                            : entry.name === "Sans statut"
                            ? "#9CA3AF"
                            : entry.name === "Bloquées"
                            ? "#EE4B2B"
                            : "#56BDB8"
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
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-primary-green"></div>
                  <span>Actions complétées</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-primary-orange"></div>
                  <span>Actions en progression</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-primary-teal"></div>
                  <span>Actions à venir</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-red-500"></div>
                  <span>Actions bloquées</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-gray-400"></div>
                  <span>Nouvelles actions</span>
                </div>
              </div>
            </div>
          </div>

          <div className="xl:col-span-8 p-6 h-full card-shadow">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-font-primary text-2xl">Évolutions du statut des actions</h3>
            </div>

            <div className="flex gap-2 mb-6 flex-wrap">
              <button
                onClick={() => setVisibleLines({ ...visibleLines, actionsCompleted: !visibleLines.actionsCompleted })}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                  visibleLines.actionsCompleted ? "bg-primary-green text-white" : "border border-gray-300 text-gray-700 bg-white"
                }`}
              >
                Complétées
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  {visibleLines.actionsCompleted ? (
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
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
                    />
                  )}
                </svg>
              </button>
              <button
                onClick={() => setVisibleLines({ ...visibleLines, actionsInProgress: !visibleLines.actionsInProgress })}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                  visibleLines.actionsInProgress ? "bg-primary-orange text-white" : "border border-gray-300 text-gray-700 bg-white"
                }`}
              >
                En progression
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  {visibleLines.actionsInProgress ? (
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
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
                    />
                  )}
                </svg>
              </button>
              <button
                onClick={() => setVisibleLines({ ...visibleLines, actionsUpcoming: !visibleLines.actionsUpcoming })}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                  visibleLines.actionsUpcoming ? "bg-primary-teal text-white" : "border border-gray-300 text-gray-700 bg-white"
                }`}
              >
                À venir
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  {visibleLines.actionsUpcoming ? (
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
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
                    />
                  )}
                </svg>
              </button>
            </div>

            <div className="h-[260px] rounded-lg overflow-hidden mt-2">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={evolutionStatuts} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="mois" tick={{ fontSize: 11, fill: "#6b7280" }} axisLine={{ stroke: "#e5e7eb" }} tickLine={{ stroke: "#e5e7eb" }} />
                  <YAxis tick={{ fontSize: 11, fill: "#6b7280" }} axisLine={{ stroke: "#e5e7eb" }} tickLine={{ stroke: "#e5e7eb" }} />
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
                  {visibleLines.actionsCompleted && (
                    <Line type="monotone" dataKey="actionsCompleted" stroke="#2DAC6A" strokeWidth={3} name="Complétées" dot={{ fill: "#2DAC6A", r: 4 }} activeDot={{ r: 6 }} />
                  )}
                  {visibleLines.actionsUpcoming && (
                    <Line type="monotone" dataKey="actionsUpcoming" stroke="#56BDB8" strokeWidth={3} name="À venir" dot={{ fill: "#56BDB8", r: 4 }} activeDot={{ r: 6 }} />
                  )}
                  {visibleLines.actionsInProgress && (
                    <Line type="monotone" dataKey="actionsInProgress" stroke="#F59600" strokeWidth={3} name="En progression" dot={{ fill: "#F59600", r: 4 }} activeDot={{ r: 6 }} />
                  )}
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Légende */}
            <div className="mt-6 flex flex-wrap gap-x-4 gap-y-2 justify-start text-xs text-gray-600">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-full bg-primary-green"></div>
                <span>Actions complétées</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-full bg-primary-teal"></div>
                <span>Actions à venir</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-full bg-primary-orange"></div>
                <span>Actions en progression</span>
              </div>
            </div>
          </div>
        </div>

        <GlobalGainsSection collectivity={collectivity} />

        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-4">
              <h2 className="font-bold text-font-primary text-3xl">Toutes les actions</h2>
              <div className="relative">
                <DebouncedInput
                  type="text"
                  placeholder="Rechercher une action..."
                  debounce={500}
                  value={filters.search}
                  onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                  className="pl-10 pr-4 py-2 input-primary text-sm w-96"
                />
                <svg className="w-5 h-5 text-gray-400 absolute left-3 top-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <Select
                value={filters.status}
                onChange={(value) => setFilters({ ...filters, status: value })}
                options={[
                  { value: "", label: "Tous" },
                  { value: "completed", label: "Terminée" },
                  { value: "in_progress", label: "À compléter" },
                  { value: "upcoming", label: "En attente" }
                ]}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {actions.length === 0 ? (
              <div className="col-span-full">
                <div className="flex flex-col items-center justify-center gap-4 text-center">
                  <div className="text-lg font-semibold text-gray-700">Aucune action dans cette collectivité</div>
                  <p className="text-sm text-gray-500">Créez votre première action pour démarrer.</p>
                  <button
                    onClick={() => setIsModalOpen(true)}
                    className="button-primary px-5 py-3 flex items-center gap-2"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    <span>Créer votre première action</span>
                  </button>
                </div>
              </div>
            ) : (
              <>
                {actions.map((action) => (
                  <CardAction key={action._id} action={action} />
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
              </>
            )}
          </div>
        </div>
      </div>
      <AddActionModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} collectivity={collectivity} />
    </div>
  )
}

function CardAction({ action }) {
  const [indicatorValues, setIndicatorValues] = useState([])
  const navigate = useNavigate()

  const fetchIndicatorValues = async () => {
    const { ok, data, code } = await api.post("/indicator_value/search", { action_id: action._id, limit: 10000 })
    if (!ok) return toast.error(code || "Une erreur est survenue")
    setIndicatorValues(data)
  }

  const isIndicatorValueFilled = (indicatorValue) => {
    const val = indicatorValue.value?.[indicatorValue.indicator_type]
    if (indicatorValue.indicator_type === "checkbox") return Array.isArray(val) && val.length > 0
    return val !== null && val !== undefined && val !== ""
  }

  useEffect(() => {
    fetchIndicatorValues()
  }, [action._id])

  const statutBadge = getStatutBadgeClass(action.status)

  return (
    <div key={action._id} className="card-shadow p-6 h-full flex flex-col" onClick={() => navigate(`/actions/${action._id}/dashboard`)}>
      <div className="mb-3">
        <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${statutBadge.class}`}>{statutBadge.text}</span>
      </div>

      <h3 className="font-bold text-font-primary text-lg mb-2 truncate">{action.name}</h3>
      <p className="text-sm text-gray-500 mb-3 line-clamp-2">{action.description}</p>

      <div className="mt-auto pt-3 flex items-center justify-between">
        <button className="text-sm text-primary-orange font-semibold border-b border-primary-orange">Voir l'action</button>
        <div className="flex items-center gap-1">
          <ProgressCircle percentage={Math.round((indicatorValues.filter(isIndicatorValueFilled).length / indicatorValues.length) * 100)} size={20} />
          <span className="text-xs text-gray-600">
            Complétée à <strong>{Math.round((indicatorValues.filter(isIndicatorValueFilled).length / indicatorValues.length) * 100)}%</strong>
          </span>
        </div>
      </div>
    </div>
  )
}



const AddActionModal = ({ isOpen, onClose, collectivity }) => {
    const navigate = useNavigate()
    const [selectedActionId, setSelectedActionId] = useState("")
    const [isCustomVersion, setIsCustomVersion] = useState(false)
    const [customName, setCustomName] = useState("")
    const [actions, setActions] = useState([])

    const fetchActions = async () => {
      try {
        const { ok, data } = await api.post("/action/search", { type: "global" })
        if (!ok) return toast.error(data.code || "Une erreur est survenue")
        setActions(data)
      } catch (error) {
        toast.error(error || "Une erreur est survenue")
      }
    }

    useEffect(() => {
        fetchActions()
    }, [isOpen])

    const createAction = async () => {
      try {
        if (!selectedActionId) return toast.error("Veuillez sélectionner une action")
        if (isCustomVersion && !customName.trim()) return toast.error("Veuillez entrer un nom pour votre action personnalisée")

        const selectedAction = actions.find(a => a._id === selectedActionId)
        const payload = {
          action_parent_id: selectedActionId,
          action_parent_name: selectedAction.name,
          name: isCustomVersion ? customName : selectedAction.name,
          type: isCustomVersion ? "custom" : "reference",
          collectivity_id: collectivity._id,
          collectivity_name: collectivity.name
        }

        const { ok, data } = await api.post("/action/create_action_with_default_indicators", payload)
        if (!ok) return toast.error(data.code || "Une erreur est survenue")
        navigate(`/actions/${data._id}/settings`)
      } catch (error) {
        toast.error(error || "Une erreur est survenue")
      }
    }

  return (
    <Modal isOpen={isOpen} onClose={onClose} className="max-w-lg">
      <div className="p-8">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-gray-800">Ajouter une action</h2>
        </div>

        {/* Action Selection */}
        <div className="mb-6">
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Choisissez parmi les actions disponibles <span className="text-red-500">*</span>
          </label>
          <Select
            options={actions.map(action => ({ value: action._id, label: action.name}))}
            value={selectedActionId}
            onChange={(value) => setSelectedActionId(value)}
            placeholder="Sélectionner une action"
            constrained={true}
          />
        </div>

        {selectedActionId && (
          <div className="mb-6">
            <label className="flex items-center gap-2 cursor-pointer">
              <div className="relative flex items-center">
                <input
                  type="checkbox"
                  checked={isCustomVersion}
                  onChange={(e) => setIsCustomVersion(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-4 h-4 border-2 border-gray-300 peer-checked:bg-[#2DAC6A] peer-checked:border-[#2DAC6A] flex items-center justify-center transition-all">
                  {isCustomVersion && (
                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
              </div>
              <span className="text-sm text-gray-700">
                Créer une version personnalisée de cette action
              </span>
            </label>
          </div>
        )}

        {/* Custom Name Input */}
        {isCustomVersion && (
          <div className="mb-6 animate-fadeIn">
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Nom de votre action personnalisée <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              placeholder="Entrez un nom personnalisé"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-green focus:border-transparent transition-all"
              autoFocus
            />
            <p className="mt-2 text-xs text-gray-500">
              Cette action sera basée sur "{actions.find(a => a._id === selectedActionId)?.name}" avec les mêmes indicateurs
            </p>
          </div>
        )}

        <div className="flex justify-end gap-3">
          <button onClick={createAction} className="button-primary">
            Créer
          </button>
        </div>
      </div>
    </Modal>
  )
}


const INDICATORS_CONFIG = [
  { key: 'GES', label: 'GES', unit: 'tCO2e', color: '#2DAC6A' },
  { key: 'PM', label: 'PM', unit: 'tPart', color: '#56BDB8' },
  { key: 'HC', label: 'HC', unit: 'tHC', color: '#F59600' },
  { key: 'NOx', label: 'NOx', unit: 'tNOx', color: '#8B5CF6' },
  { key: 'CO', label: 'CO', unit: 'tCO', color: '#EC4899' },
  { key: 'Énergie', label: 'Énergie', unit: 'GWh', color: '#3B82F6' },
];

function GlobalGainsSection({ collectivity }) {
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [viewMode, setViewMode] = useState('comparison');
  const [selectedIndicator, setSelectedIndicator] = useState('GES');

  const fetchGlobalGains = async () => {
    if (!collectivity?.excelFileId) return;
    try {
      setIsLoading(true);
      const { ok, data } = await api.post('/excel/global-gains', { excelFileId: collectivity.excelFileId });
      if (!ok) return toast.error(data.error || "Une erreur est survenue");
      setData(data);
    } catch (error) {
      toast.error(error.message || "Une erreur est survenue");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchGlobalGains();
  }, [collectivity?.excelFileId]);

  if (isLoading) return <div className="card-shadow p-6 mb-12"><Loader /></div>;

  const gainsPrevisionnels = data?.find(d => d.name === 'gains_previsionnels')?.values || [];
  const gainsReels = data?.find(d => d.name === 'gains_reels')?.values || [];
  const ecart = data?.find(d => d.name === 'ecart')?.values || [];

  const parseNumber = (val) => {
    if (val === null || val === undefined || val === '') return 0;
    if (typeof val === 'number') return val;
    if (typeof val === 'string') {
      const cleaned = val.replace(/\s/g, '').replace(',', '.');
      const num = parseFloat(cleaned);
      return isNaN(num) ? 0 : num;
    }
    return 0;
  };

  const yearStartIndex = gainsPrevisionnels[0]?.findIndex(h => /^\d{4}$/.test(String(h)));
  const years = yearStartIndex >= 0 && gainsPrevisionnels[0] ? gainsPrevisionnels[0].slice(yearStartIndex) : [];

  const getIndicatorData = (indicatorIndex) => {
    const prevRow = gainsPrevisionnels[indicatorIndex + 1] || [];
    const reelRow = gainsReels[indicatorIndex + 1] || [];
    const ecartRow = ecart[indicatorIndex + 1] || [];

    const evolRelIndex = gainsPrevisionnels[0]?.findIndex(h => 
      String(h).toLowerCase().includes('evolution relative') || 
      String(h).toLowerCase().includes('évolution relative')
    );
    const evolCumIndex = gainsPrevisionnels[0]?.findIndex(h => 
      String(h).toLowerCase().includes('evolution cumulée') || 
      String(h).toLowerCase().includes('évolution cumulée') ||
      String(h).toLowerCase().includes('evolution cumul')
    );

    const relIdx = evolRelIndex >= 0 ? evolRelIndex : 2;
    const cumIdx = evolCumIndex >= 0 ? evolCumIndex : 3;
    const yearIdx = yearStartIndex >= 0 ? yearStartIndex : 4;

    return {
      label: INDICATORS_CONFIG[indicatorIndex]?.label || prevRow[0],
      unit: INDICATORS_CONFIG[indicatorIndex]?.unit,
      evolutionRelativePrev: Math.abs(parseNumber(prevRow[relIdx])),
      evolutionRelativeReel: Math.abs(parseNumber(reelRow[relIdx])),
      evolutionCumuleePrev: Math.abs(parseNumber(prevRow[cumIdx])),
      evolutionCumuleeReel: Math.abs(parseNumber(reelRow[cumIdx])),
      yearlyPrev: years.map((year, i) => ({year: String(year), value: Math.abs(parseNumber(prevRow[yearIdx + i]))})),
      yearlyReel: years.map((year, i) => ({year: String(year), value: Math.abs(parseNumber(reelRow[yearIdx + i]))})),
      ecartAbsolu: parseNumber(ecartRow[1]),
      ecartRelatif: parseNumber(ecartRow[2]),
    };
  };

  const comparisonData = INDICATORS_CONFIG.map((config, index) => {
    const indicatorData = getIndicatorData(index);
    return {name: config.label, previsionnel: indicatorData.evolutionRelativePrev, reel: indicatorData.evolutionRelativeReel, ecartPct: indicatorData.ecartRelatif * 100};
  });

  const selectedIndex = INDICATORS_CONFIG.findIndex(c => c.key === selectedIndicator);
  const selectedData = getIndicatorData(selectedIndex);
  const evolutionData = selectedData.yearlyPrev.map((item, i) => ({ year: item.year, previsionnel: item.value, reel: selectedData.yearlyReel[i]?.value || 0 }));

  const gesData = getIndicatorData(0);
  const energieData = getIndicatorData(5);
  const tauxRealisation = gesData.evolutionRelativePrev > 0  ? (gesData.evolutionRelativeReel / gesData.evolutionRelativePrev) * 100 : 0;

  const avancementTrajectoire = gesData.evolutionCumuleePrev > 0 ? (gesData.evolutionCumuleeReel / gesData.evolutionCumuleePrev) * 100 : 0;
  const formatNumber = (num) => {
    if (num === 0 || isNaN(num)) return '0';
    return num.toLocaleString('fr-FR', { maximumFractionDigits: 0 });
  };

  const formatGES = (value) => {
    if (value === 0 || isNaN(value)) return '0 tCO₂e';
    if (Math.abs(value) >= 1000000) return `${(value / 1000000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} MtCO₂e`;
    if (Math.abs(value) >= 1000) return `${(value / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 0 })} ktCO₂e`;
    return `${value.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} tCO₂e`;
  };

  const formatEnergie = (value) => {
    if (value === 0 || isNaN(value)) return '0 GWh';
    return `${value.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} GWh`;
  };

  return (
    <div className="card-shadow overflow-hidden mb-12">
      <div className="px-6 py-4 border-b bg-gray-50 flex items-center justify-between flex-wrap gap-4">
        <div>
          <h3 className="font-bold text-font-primary text-2xl">Gains environnementaux globaux</h3>
          <p className="text-sm text-gray-500 mt-1">Impact de la charte sur la collectivité</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setViewMode('comparison')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
              viewMode === 'comparison' ? 'bg-primary-green text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            Comparaison
          </button>
          <button
            onClick={() => setViewMode('evolution')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
              viewMode === 'evolution' ? 'bg-primary-green text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
            </svg>
            Évolution
          </button>
          <button
            onClick={() => setViewMode('table')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
              viewMode === 'table' ? 'bg-primary-green text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            Tableau
          </button>
        </div>
      </div>

      <div className="px-6 py-6 bg-white border-b border-gray-200">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white rounded-lg border border-gray-200 p-5 shadow-sm hover:shadow-md transition-shadow">
            <p className="text-sm text-gray-600 mb-2">GES évités (mesuré)</p>
            <p className="text-3xl font-bold text-gray-900 mb-1">{formatGES(gesData.evolutionCumuleeReel)}</p>
            <p className="text-xs text-gray-500">Évolution cumulée</p>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-5 shadow-sm hover:shadow-md transition-shadow">
            <p className="text-sm text-gray-600 mb-2">Énergie économisée</p>
            <p className="text-3xl font-bold text-gray-900 mb-1">{formatEnergie(energieData.evolutionCumuleeReel)}</p>
            <p className="text-xs text-gray-500">Évolution cumulée</p>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-5 shadow-sm hover:shadow-md transition-shadow">
            <p className="text-sm text-gray-600 mb-2">Avancement trajectoire 2030</p>
            <p className="text-3xl font-bold text-gray-900 mb-1">{avancementTrajectoire.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %</p>
            <p className="text-xs text-gray-500">Réel cumulé / Prévisionnel cumulé</p>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-5 shadow-sm hover:shadow-md transition-shadow">
            <p className="text-sm text-gray-600 mb-2">Écart à la trajectoire (GES)</p>
            <p className={`text-3xl font-bold mb-1 ${gesData.ecartAbsolu < 0 ? 'text-red-600' : 'text-green-600'}`}>
              {formatGES(gesData.ecartAbsolu)}
            </p>
            <p className="text-xs text-gray-500">Écart absolu réel vs prévisionnel</p>
          </div>
        </div>
      </div>

      {viewMode === 'comparison' && (
        <div className="p-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <h4 className="font-semibold text-gray-800 mb-4">Comparaison Prévisionnel vs Réel</h4>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={comparisonData} layout="vertical" margin={{ top: 5, right: 30, left: 50, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis 
                      type="number" 
                      tick={{ fontSize: 11 }} 
                      tickFormatter={(v) => {
                        if (v >= 1000000) return `${(v/1000000).toFixed(1)}M`;
                        if (v >= 1000) return `${(v/1000).toFixed(0)}k`;
                        return v.toLocaleString('fr-FR');
                      }} 
                    />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} width={60} />
                    <Tooltip
                      content={({ active, payload, label }) => {
                        if (active && payload && payload.length) {
                          return (
                            <div className="bg-white border border-gray-300 rounded-lg p-3 shadow-lg">
                              <p className="font-bold text-sm mb-2">{label}</p>
                              {payload.map((entry, index) => (
                                <p key={index} className="text-sm" style={{ color: entry.color }}>
                                  {entry.name}: <span className="font-semibold">{formatNumber(entry.value)}</span>
                                </p>
                              ))}
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Legend />
                    <Bar dataKey="previsionnel" name="Prévisionnel" fill="#F59600" radius={[0, 4, 4, 0]} />
                    <Bar dataKey="reel" name="Réel" fill="#2DAC6A" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="space-y-3">
              <h4 className="font-semibold text-gray-800 mb-2">Écarts par indicateur</h4>
              {INDICATORS_CONFIG.map((config, index) => {
                const indicatorData = getIndicatorData(index);
                const ecartPct = indicatorData.ecartRelatif * 100;
                return (
                  <div key={config.key} className="bg-white rounded-lg border border-gray-200 p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${config.color}20` }}>
                        <span className="text-xs font-bold" style={{ color: config.color }}>{config.label.slice(0, 2)}</span>
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{config.label}</p>
                        <p className="text-xs text-gray-500">{config.unit}</p>
                      </div>
                    </div>
                    <div className="text-right flex-1 px-4">
                      <div className="flex items-center justify-end gap-2">
                        <span className="text-xs text-gray-500">Réel:</span>
                        <span className="font-semibold text-primary-green text-sm">{formatNumber(indicatorData.evolutionRelativeReel)}</span>
                      </div>
                      <div className="flex items-center justify-end gap-2">
                        <span className="text-xs text-gray-500">Prévu:</span>
                        <span className="font-semibold text-primary-orange text-sm">{formatNumber(indicatorData.evolutionRelativePrev)}</span>
                      </div>
                    </div>
                    <div className={`px-3 py-1 rounded-full text-sm font-medium whitespace-nowrap ${
                      ecartPct < 0 ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
                    }`}>
                      {ecartPct.toFixed(1)}%
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-6 bg-gradient-to-r from-gray-50 to-gray-100 rounded-xl p-6">
            <h4 className="font-semibold text-gray-800 mb-4 text-center">Taux de réalisation global (GES)</h4>
            <div className="flex items-center justify-center gap-8">
              <div className="relative w-40 h-40">
                <svg className="w-full h-full transform -rotate-90">
                  <circle cx="80" cy="80" r="70" stroke="#e5e7eb" strokeWidth="12" fill="none" />
                  <circle
                    cx="80" cy="80" r="70"
                    stroke="#2DAC6A"
                    strokeWidth="12"
                    fill="none"
                    strokeDasharray={`${Math.min(tauxRealisation, 100) * 4.4} 440`}
                    strokeLinecap="round"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-3xl font-bold text-gray-900">
                    {tauxRealisation.toFixed(1)}%
                  </span>
                  <span className="text-xs text-gray-500">atteint</span>
                </div>
              </div>
              <div className="text-left">
                <p className="text-sm text-gray-600 mb-2">
                  <span className="font-semibold text-primary-orange">{formatNumber(gesData.evolutionRelativePrev)}</span> tCO2e prévisionnels
                </p>
                <p className="text-sm text-gray-600 mb-2">
                  <span className="font-semibold text-primary-green">{formatNumber(gesData.evolutionRelativeReel)}</span> tCO2e réels
                </p>
                <p className="text-sm text-gray-600">
                  <span className="font-semibold text-red-600">{formatNumber(gesData.ecartAbsolu)}</span> tCO2e d'écart
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {viewMode === 'evolution' && (
        <div className="p-6">
          <div className="flex flex-wrap gap-2 mb-6">
            {INDICATORS_CONFIG.map((config) => (
              <button
                key={config.key}
                onClick={() => setSelectedIndicator(config.key)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${selectedIndicator === config.key ? 'text-white': 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                style={selectedIndicator === config.key ? { backgroundColor: config.color } : {}}
              >
                {config.label}
              </button>
            ))}
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h4 className="font-semibold text-gray-800 mb-4">
              Évolution {selectedData.label} ({selectedData.unit})
            </h4>
            <div className="h-[350px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={evolutionData} margin={{ top: 10, right: 30, left: 20, bottom: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="year" tick={{ fontSize: 12 }} />
                  <YAxis 
                    tick={{ fontSize: 11 }} 
                    tickFormatter={(v) => {
                      if (v >= 1000000) return `${(v/1000000).toFixed(1)}M`;
                      if (v >= 1000) return `${(v/1000).toFixed(0)}k`;
                      return v.toLocaleString('fr-FR');
                    }} 
                  />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (active && payload && payload.length) {
                        return (
                          <div className="bg-white border border-gray-300 rounded-lg p-3 shadow-lg">
                            <p className="font-bold text-sm mb-2">{label}</p>
                            {payload.map((entry, index) => (
                              <p key={index} className="text-sm" style={{ color: entry.color }}>
                                {entry.name}: <span className="font-semibold">{formatNumber(entry.value)} {selectedData.unit}</span>
                              </p>
                            ))}
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="previsionnel"
                    name="Trajectoire attendue (prévisionnel cumulée)"
                    stroke="#9CA3AF"
                    strokeWidth={3}
                    strokeDasharray="5 5"
                    dot={{ fill: '#9CA3AF', r: 5 }}
                    activeDot={{ r: 7 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="reel"
                    name="Mesurés (réel cumulé)"
                    stroke="#1E40AF"
                    strokeWidth={3}
                    dot={{ fill: '#1E40AF', r: 5 }}
                    activeDot={{ r: 7 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {viewMode === 'table' && (
        <TableView 
          gainsPrevisionnels={gainsPrevisionnels} 
          gainsReels={gainsReels} 
          ecart={ecart} 
        />
      )}
    </div>
  );
}

function TableView({ gainsPrevisionnels, gainsReels, ecart }) {
  const [activeTab, setActiveTab] = useState('previsionnels');
  const currentGains = activeTab === 'previsionnels' ? gainsPrevisionnels : gainsReels;

  const formatCell = (cell) => {
    if (cell === null || cell === undefined || cell === '') return '-';
    if (typeof cell === 'number') return cell.toLocaleString('fr-FR', { maximumFractionDigits: 2 });
    return cell;
  };

  if (!currentGains || currentGains.length === 0) return null;

  return (
    <div>
      <div className="px-6 py-3 border-b flex gap-2">
        <button
          onClick={() => setActiveTab('previsionnels')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            activeTab === 'previsionnels' ? 'bg-yellow-500 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          Prévisionnels
        </button>
        <button
          onClick={() => setActiveTab('reels')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            activeTab === 'reels' ? 'bg-primary-green text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          Réels
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50 border-b">
              {currentGains[0]?.map((header, idx) => (
                <th key={idx} className={`px-4 py-3 text-sm font-semibold text-gray-700 ${idx === 0 ? 'text-left' : 'text-center'}`}>
                  {header || '-'}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {currentGains.slice(1).map((row, rowIndex) => (
              <tr key={rowIndex} className="hover:bg-gray-50 transition-colors">
                {row.map((cell, cellIndex) => (
                  <td 
                    key={cellIndex} 
                    className={`px-4 py-3 text-sm ${
                      cellIndex === 0 ? 'font-medium text-gray-900 text-left' : 'text-center text-gray-700'
                    } ${activeTab === 'previsionnels' ? 'bg-yellow-50/30' : 'bg-green-50/30'}`}
                  >
                    {formatCell(cell)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {ecart && ecart.length > 1 && (
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50/50">
          <h4 className="font-semibold text-gray-700 text-sm mb-3">Écart entre gains réels et prévisionnels</h4>
          <div className="overflow-x-auto bg-white rounded-lg border border-gray-200">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50">
                  <th className="px-4 py-2 text-left text-xs font-semibold text-gray-700">Indicateur</th>
                  <th className="px-4 py-2 text-center text-xs font-semibold text-gray-700">Écart absolu</th>
                  <th className="px-4 py-2 text-center text-xs font-semibold text-gray-700">Écart relatif</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {ecart.slice(1).map((row, rowIndex) => (
                  <tr key={rowIndex} className="hover:bg-gray-50">
                    <td className="px-4 py-2 text-sm font-medium text-gray-900">
                      {row[0] || INDICATORS_CONFIG[rowIndex]?.label || '-'}
                    </td>
                    <td className="px-4 py-2 text-center text-sm text-gray-700">
                      {formatCell(row[1])}
                    </td>
                    <td className="px-4 py-2 text-center text-sm">
                      <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                        typeof row[2] === 'number' && row[2] < 0 ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'
                      }`}>
                        {typeof row[2] === 'number' ? `${(row[2] * 100).toFixed(1)}%` : row[2]}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}