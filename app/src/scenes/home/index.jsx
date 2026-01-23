import React, { useState, useEffect, useMemo } from "react"
import { FiList, FiCheckCircle, FiTrendingUp, FiAlertTriangle, FiPlusCircle } from "react-icons/fi"
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
import Onboarding from "./Onboarding"

const getStatutBadgeClass = (statut) => {
  if (statut === "completed") return { class: "bg-primary-green/10 text-primary-green", text: "Terminée" }
  if (statut === "upcoming") return { class: "bg-primary-teal/10 text-primary-teal", text: "À venir" }
  if (statut === "in_progress") return { class: "bg-primary-orange/10 text-primary-orange", text: "En cours" }
  if (statut === "blocked") return { class: "bg-red-100 text-red-700", text: "Bloquée" }
  return { class: "bg-gray-100 text-gray-700", text: "Nouvelle" }
}

const INDICATORS_CONFIG = [
  { key: 'GES', label: 'GES', unit: 'tCO2e', color: '#2DAC6A' },
  { key: 'PM', label: 'PM', unit: 'tPart', color: '#56BDB8' },
  { key: 'HC', label: 'HC', unit: 'tHC', color: '#F59600' },
  { key: 'NOx', label: 'NOx', unit: 'tNOx', color: '#8B5CF6' },
  { key: 'CO', label: 'CO', unit: 'tCO', color: '#EC4899' },
  { key: 'Énergie', label: 'Énergie', unit: 'GWh', color: '#3B82F6' },
];

const formatGES = (value) => {
  if (value === 0 || isNaN(value)) return '0 tCO₂e';
  const absVal = Math.abs(value);
  if (absVal >= 1000) return `${(value / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} ktCO₂e`;
  return `${value.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} tCO₂e`;
};

const formatEnergie = (value) => {
  if (value === 0 || isNaN(value)) return '0 GWh';
  return `${value.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} GWh`;
};

export default function Home() {
  const [actions, setActions] = useState([])
  const navigate = useNavigate()
  const { collectivity, user } = useStore()
  const [filters, setFilters] = useState({ search: "", status: "" })
  const [synthese, setSynthese] = useState({ actionsCreated: 0, actionsInProgress: 0, actionsCompleted: 0, actionsBlocked: 0, actionsUpcoming: 0, actionsWithoutStatus: 0 })
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [globalGains, setGlobalGains] = useState(null)
  
  const fetchSynthese = async () => {
    try {
      const { ok, data, code } = await api.post("/dashboard/synthese", { collectivity_id: collectivity._id })
      if (!ok) return toast.error(code || "Une erreur est survenue")
      setSynthese(data)
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

  const fetchGlobalGains = async () => {
    if (!collectivity) return;
    try {
      const { ok, data } = await api.post('/excel/global-gains', { collectivity: collectivity });
      if (!ok) return console.error(data.error || "Une erreur est survenue");
      setGlobalGains(data);
    } catch (error) {
      console.error(error.message || "Une erreur est survenue");
    }
  };

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
    fetchGlobalGains()
  }, [collectivity, filters])

  if (!collectivity) return <Loader />

  if (!collectivity.is_onboarded) {
    return (
      <div className="min-h-screen bg-gray-50/50 p-8">
         <Onboarding collectivity={collectivity} />
      </div>
    )
  }

  return (
    <div className="">
      <div className="relative z-10 max-w-8xl mx-auto px-6 sm:px-8 lg:px-10 py-8">
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-font-primary text-4xl">
                Dashboard de <span className="font-bold text-primary-green">{collectivity.name}</span>
              </h1>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={ exportExcelFile }
                className="button-primary"
              >
                Export Excel
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 mb-6">
          <div className="xl:col-span-9">
            <KeyIndicatorsCard globalGains={globalGains} />
          </div>
          <div className="xl:col-span-3">
            <ActionsDistribution synthese={synthese} />
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 mb-12">
           <div className="xl:col-span-6">
            <EvolutionChart globalGains={globalGains} />
           </div>
           <div className="xl:col-span-6">
            <ActionContributionSection collectivity={collectivity} />
           </div>
        </div>

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
                  { value: "", label: "Tous les statuts" },
                  { value: "completed", label: "Terminée" },
                  { value: "in_progress", label: "À compléter" },
                  { value: "upcoming", label: "En attente" },
                  { value: "blocked", label: "Bloquée" },
                  { value: "no_status", label: "Sans statut" }
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

function KeyIndicatorsCard({ globalGains }) {
  if (!globalGains) return <div className="h-full card-shadow p-6 flex items-center justify-center min-h-[300px]"><Loader /></div>;

  return (
    <div className="h-full rounded-2xl p-8 text-white relative overflow-hidden flex flex-col justify-between shadow-lg" style={{ background: 'linear-gradient(135deg, #2DAC6A 0%, #1D7E4F 100%)' }}>
      <div className="absolute top-0 right-0 w-96 h-96 bg-white opacity-5 rounded-full transform translate-x-1/3 -translate-y-1/3 pointer-events-none"></div>
      <div className="absolute bottom-0 left-0 w-64 h-64 bg-black opacity-5 rounded-full transform -translate-x-1/3 translate-y-1/3 pointer-events-none"></div>

      <div className="relative z-10">
        <h3 className="text-green-50 text-base font-medium mb-1 opacity-90">GES évités (mesuré) • Évolution cumulée</h3>
        
        <div className="mt-4 mb-6">
          <div className="text-6xl font-bold tracking-tight mb-4">
            {formatGES(globalGains.gesData.evolutionCumuleeReel).replace(' tCO₂e', '').replace(' ktCO₂e', '').replace(' MtCO₂e', '')}
            <span className="text-3xl font-medium ml-2 opacity-80">
               {globalGains.gesData.evolutionCumuleeReel >= 1000 ? 'ktCO₂e' : 'tCO₂e'}
            </span>
          </div>
          
          <div className="inline-flex items-center bg-white/20 backdrop-blur-sm rounded-lg px-4 py-2 border border-white/10">
            <span className="text-2xl mr-2">✈️</span>
            <span className="text-sm font-medium">
              Équivalent à <strong className="text-white">{Math.round((globalGains.gesData.evolutionCumuleeReel / 250)*2).toLocaleString('fr-FR')} vols transatlantiques évités</strong>
            </span>
          </div>
        </div>
      </div>

      <div className="relative z-10 grid grid-cols-3 gap-8 border-t border-white/20 pt-6">
        <div>
          <p className="text-green-100 text-sm mb-1 opacity-80">Taux d'avancement de la trajectoire GES</p>
          <p className="text-2xl font-bold">{globalGains.avancementTrajectoire.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} <span className="text-base font-medium opacity-80">%</span></p>
        </div>
        <div>
          <p className="text-green-100 text-sm mb-1 opacity-80">Écart entre gains prévisionnels et réels</p>
          <p className={`text-2xl font-bold ${globalGains.gesData.ecartAbsolu < 0 ? 'text-red-300' : 'text-green-300'}`}>
            {globalGains.gesData.ecartAbsolu > 0 ? '+' : ''}{formatGES(globalGains.gesData.ecartAbsolu).replace(' tCO₂e', '').replace(' ktCO₂e', '').replace(' MtCO₂e', '')}
             <span className="text-base font-medium opacity-80 ml-1">
               {Math.abs(globalGains.gesData.ecartAbsolu) >= 1000 ? 'ktCO₂e' : 'tCO₂e'}
            </span>
          </p>
        </div>
        <div>
          <p className="text-green-100 text-sm mb-1 opacity-80">Énergie économisée</p>
          <p className="text-2xl font-bold">{formatEnergie(globalGains.energieData.evolutionCumuleeReel).replace(' GWh', '')} <span className="text-base font-medium opacity-80">GWh</span></p>
        </div>
      </div>
    </div>
  )
}

function ActionsDistribution({ synthese }) {
  const total = synthese.actionsCreated || 0;
  
  const pieData = [
    { name: "Complétées", value: synthese.actionsCompleted || 0, color: "#2DAC6A" },
    { name: "En progression", value: synthese.actionsInProgress || 0, color: "#F59600" },
    { name: "À venir", value: synthese.actionsUpcoming || 0, color: "#56BDB8" },
    { name: "Sans statut", value: synthese.actionsWithoutStatus || 0, color: "#9CA3AF" },
    { name: "Bloquées", value: synthese.actionsBlocked || 0, color: "#EE4B2B" }
  ].filter(d => d.value > 0);

  const displayData = pieData.length > 0 ? pieData : [{ name: "Aucune", value: 1, color: "#E5E7EB" }];

  return (
    <div className="h-full card-shadow p-6 flex flex-col">
      <h3 className="font-bold text-font-primary text-xl mb-4 text-center">Répartition des actions</h3>
      
      <div className="flex-1 flex flex-col min-h-[250px]">
        <div className="flex-1 relative min-h-[180px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie 
                data={displayData} 
                cx="50%" 
                cy="50%" 
                innerRadius={60} 
                outerRadius={80} 
                paddingAngle={4} 
                dataKey="value"
              >
                {displayData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} strokeWidth={0} />
                ))}
              </Pie>
              <Tooltip
                wrapperStyle={{ zIndex: 1000 }}
                content={({ active, payload }) => {
                  if (active && payload && payload.length && pieData.length > 0) {
                    return (
                      <div className="bg-white border border-gray-100 rounded-lg p-3 shadow-xl">
                        <p className="font-bold text-sm mb-1">{payload[0].name}</p>
                        <p className="text-sm text-gray-600">
                          <span className="font-bold text-lg ml-1" style={{color: payload[0].payload.color}}>{payload[0].value}</span> actions
                        </p>
                      </div>
                    )
                  }
                  return null
                }}
              />
            </PieChart>
          </ResponsiveContainer>

          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="text-3xl font-bold text-gray-900">{synthese.actionsCreated}</span>
            <span className="text-sm text-gray-500 font-medium">Total</span>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2">
          {pieData.map((item, index) => (
            <div key={index} className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2 truncate">
                <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: item.color }} />
                <span className="text-gray-600 truncate" title={item.name}>{item.name}</span>
              </div>
              <span className="font-semibold text-gray-900 ml-2">
                {total > 0 ? Math.round((item.value / total) * 100) : 0}%
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function EvolutionChart({ globalGains }) {
  const [selectedIndicator, setSelectedIndicator] = useState('GES');
  
  if (!globalGains) return <div className="h-full card-shadow p-6 flex items-center justify-center min-h-[400px]"><Loader /></div>;
  
  const selectedIndex = INDICATORS_CONFIG.findIndex(c => c.key === selectedIndicator);
  
  const evolutionData =  globalGains.indicators[selectedIndex].yearlyPrev.map((item, i) => ({year: item.year, previsionnel: item.value, reel:  globalGains.indicators[selectedIndex].yearlyReel[i]?.value || 0 }));

  return (
    <div className="h-full card-shadow p-6 flex flex-col">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h3 className="font-bold text-font-primary text-xl">Évolution {selectedIndicator} ({ globalGains.indicators[selectedIndex].unit})</h3>
          <p className="text-sm text-gray-500 mt-1">Impact de la charte sur la collectivité</p>
        </div>
        
        <div className="flex bg-gray-100 rounded-lg p-1">
          {INDICATORS_CONFIG.map((config) => (
             <button
               key={config.key}
               onClick={() => setSelectedIndicator(config.key)}
               className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                 selectedIndicator === config.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
               }`}
             >
               {config.label}
             </button>
          ))}
        </div>
      </div>

      <div className="flex-1 min-h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={evolutionData} margin={{ top: 10, right: 10, left: 0, bottom: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
            <XAxis 
              dataKey="year" 
              axisLine={false} 
              tickLine={false} 
              tick={{ fontSize: 12, fill: '#6B7280' }} 
              dy={10}
            />
            <YAxis 
              axisLine={false} 
              tickLine={false} 
              tick={{ fontSize: 12, fill: '#6B7280' }} 
              tickFormatter={(v) => {
                if (v >= 1000) return `${(v/1000).toFixed(0)}k`;
                return v;
              }}
            />
            <Tooltip
              content={({ active, payload, label }) => {
                if (active && payload && payload.length) {
                  return (
                    <div className="bg-white border border-gray-100 rounded-lg p-3 shadow-xl">
                      <p className="font-bold text-sm mb-2">{label}</p>
                      {payload.map((entry, index) => (
                        <div key={index} className="flex items-center gap-2 text-sm mb-1">
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }}></div>
                          <span className="text-gray-600">{entry.name}:</span>
                          <span className="font-semibold">{entry.value.toLocaleString('fr-FR')} { globalGains.indicators[selectedIndex].unit}</span>
                        </div>
                      ))}
                    </div>
                  );
                }
                return null;
              }}
            />
            <Legend 
               verticalAlign="bottom" 
               height={36} 
               iconType="circle"
               formatter={(value, entry) => <span className="text-sm text-gray-600 ml-2">{value}</span>}
            />
            <Line
              type="monotone"
              dataKey="reel"
              name="Mesuré (réel cumulé)"
              stroke="#2DAC6A"
              strokeWidth={3}
              dot={{ fill: '#2DAC6A', r: 4, strokeWidth: 2, stroke: '#fff' }}
              activeDot={{ r: 6, strokeWidth: 0 }}
            />
            <Line
              type="monotone"
              dataKey="previsionnel"
              name="Trajectoire prévisionnelle"
              stroke="#86EFAC"
              strokeWidth={3}
              strokeDasharray="4 4"
              dot={false}
              activeDot={{ r: 6 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
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

function ActionContributionSection({ collectivity }) {
  const [actionGains, setActionGains] = useState([]);
  const [collectivityActions, setCollectivityActions] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchActionGains = async () => {
    if (!collectivity) return;
    try {
      setIsLoading(true);
      const { ok, data, code } = await api.post('/excel/action-contribution', { collectivity: collectivity });
      if (!ok) return toast.error(code || "Une erreur est survenue");
      setActionGains(data);
    } catch (error) {
      toast.error(error.code || "Une erreur est survenue");
    } finally {
      setIsLoading(false);
    }
  };

  const fetchCollectivityActions = async () => {
    if (!collectivity) return;
    try {
      const { ok, data } = await api.post("/action/search", { collectivity_id: collectivity._id });
      if (!ok) return toast.error(data.code || "Une erreur est survenue");
      setCollectivityActions(data);
    } catch (error) {
      console.error(error);
    }
  };

  useEffect(() => {
    fetchActionGains();
    fetchCollectivityActions();
  }, [collectivity]);

  if (isLoading) {
    return (
      <div className="h-full card-shadow p-6 flex items-center justify-center min-h-[400px]">
        <Loader />
      </div>
    );
  }

  const filteredGains = actionGains.filter(gain => {
    return collectivityActions.some(action => action.excel_worksheetname === gain.action);
  }).map(gain => {
    const action = collectivityActions.find(a => a.excel_worksheetname === gain.action);
    return {...gain, displayName: action ? action.name : gain.action
    };
  });


  return (
    <div className="h-full card-shadow p-6 flex flex-col">
      <div className="mb-6">
        <h3 className="font-bold text-font-primary text-xl">Contribution des actions</h3>
        <p className="text-sm text-gray-500 mt-1">Part de chaque action dans les GES évités</p>
      </div>

      <div className="flex-1 space-y-4">
        {filteredGains.slice(0, 4).map((action, index) => {
          const totalReduction = filteredGains.reduce((acc, curr) => acc + Math.abs(curr.ges), 0);
          return (
            <div key={index} className={`flex flex-col gap-2 p-2 rounded-lg hover:bg-gray-50 transition-colors`}>
              <div className="font-bold text-gray-900 text-sm truncate" title={action.displayName}>
                {action.displayName}
              </div>

              <div className="flex items-center gap-4">
                <div className="flex-1 h-6 bg-gray-100 rounded flex overflow-hidden relative">
                   <div 
                     className={`h-full ${action.ges < 0 ? 'bg-[#2DAC6A]' : 'bg-[#EF4444]'}`} 
                     style={{ width: `${Math.min((Math.abs(action.ges) /  Math.max(...filteredGains.map(a => Math.abs(a.ges)), 1)) * 100, 100)}%` }}
                   />
                   <span className="absolute inset-0 flex items-center px-2 text-xs font-medium text-gray-700 drop-shadow-sm">
                     {action.ges > 0 ? '+' : ''}{formatGES(action.ges)}
                   </span>
                </div>
                
                <div className={`w-14 text-right text-sm font-bold ${action.ges < 0 ? 'text-[#2DAC6A]' : 'text-[#EF4444]'}`}>
                  {(totalReduction > 0 ? (Math.abs(action.ges) / totalReduction) * 100 : 0).toFixed(1)}%
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

