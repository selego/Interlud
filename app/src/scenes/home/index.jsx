import React, { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { PieChart, Pie, Cell, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import api from "@/services/api"
import toast from "react-hot-toast"
import useStore from "@/services/store"

// Fonction à remplacer par votre fetch de BDD
const fetchData = async () => {
  await new Promise(resolve => setTimeout(resolve, 100))
  
  return {
    collectivite: "Collectivité",
    synthese: {
      actionsCreees: 3,
      actionsMisesAJour: 12,
      actionsTerminees: 6,
    },
    repartitionActions: {
      terminees: 6,
      aCompleter: 12,
      enAttente: 39,
    },
    evolutionStatuts: {
      data: [
        { mois: "Jan 2025", terminees: 5, enAttente: 20 },
        { mois: "Fev 2025", terminees: 8, enAttente: 25 },
        { mois: "Mar 2025", terminees: 12, enAttente: 28 },
        { mois: "Avr 2025", terminees: 15, enAttente: 30 },
        { mois: "Mai 2025", terminees: 18, enAttente: 32 },
        { mois: "Juin 2025", terminees: 22, enAttente: 33 },
        { mois: "Juil 2025", terminees: 25, enAttente: 34 },
        { mois: "Aout 2025", terminees: 28, enAttente: 34 },
      ]
    },
    actions: [
      {
        id: "68f6453bbfdfb486bd415c5d",
        nom: "Décarbonnation du fret routier",
        description: "Une description à hauteur fixe qui peut tenir en une ou deux lignes puis le texte...",
        completionPourcentage: 66,
        statut: "À compléter",
      },
      {
        id: "68f0fc288459830dcd4b3e8e",
        nom: "Aménagement d'espace vert",
        description: "Une description à hauteur fixe qui peut tenir en une ou deux lignes puis le texte...",
        completionPourcentage: 100,
        statut: "Terminée",
      },
      {
        id: "68f0fc288459830dcd4b3e8e",
        nom: "Décarbonnation du fret maritime...",
        description: "Une description à hauteur fixe qui peut tenir en une ou deux lignes puis le texte...",
        completionPourcentage: 100,
        statut: "Terminée",
      },
      {
        id: "68f0fc288459830dcd4b3e8e",
        nom: "Remplacement des chauffage...",
        description: "Une description à hauteur fixe qui peut tenir en une ou deux lignes puis le texte...",
        completionPourcentage: 66,
        statut: "En attente",
      },
      {
        id: "68f0fc288459830dcd4b3e8e",
        nom: "Rénovation des écoles et des...",
        description: "Une description à hauteur fixe qui peut tenir en une ou deux lignes puis le texte...",
        completionPourcentage: 66,
        statut: "En attente",
      },
      {
        id: 6,
        nom: "Rénovation des écoles et des...",
        description: "Une description à hauteur fixe qui peut tenir en une ou deux lignes puis le texte...",
        completionPourcentage: 66,
        statut: "Terminée",
      },
      {
        id: 7,
        nom: "Rénovation des écoles et des...",
        description: "Une description à hauteur fixe qui peut tenir en une ou deux lignes puis le texte...",
        completionPourcentage: 66,
        statut: "En attente",
      },
    ],
  }
}

const getStatutBadgeClass = (statut) => {
  if (statut === "Terminée") return "bg-primary-green/10 text-primary-green"
  if (statut === "À compléter") return "bg-primary-orange/10 text-primary-orange"
  if (statut === "En attente") return "bg-primary-teal/10 text-primary-teal"
  return "bg-gray-100 text-gray-700"

}

const COLORS = {
  terminees: '#2DAC6A', // green
  aCompleter: '#F59600', // orange
  enAttente: '#56BDB8', // cyan
}

export default function Home() {
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState(null)
  const [searchTerm, setSearchTerm] = useState("")
  const [filtreTerminees, setFiltreTerminees] = useState(true)
  const [filtreACompleter, setFiltreACompleter] = useState(true)
  const [filtreEnAttente, setFiltreEnAttente] = useState(true)
  const [periodeSynthese, setPeriodeSynthese] = useState("Ce mois-ci")
  const [periodeEvolution, setPeriodeEvolution] = useState("Par mois")
  const navigate = useNavigate()
  const { collectivity, user } = useStore()

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true)
        const result = await fetchData()
        setData(result)
      } catch (error) {
        console.error("Erreur lors du chargement des données:", error)
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-500">Chargement...</div>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-red-500">Erreur lors du chargement des données</div>
      </div>
    )
  }

  const filteredActions = data.actions.filter(action => {
    const matchesSearch = action.nom.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesFiltre = 
      (filtreTerminees && action.statut === "Terminée") ||
      (filtreACompleter && action.statut === "À compléter") ||
      (filtreEnAttente && action.statut === "En attente")
    return matchesSearch && matchesFiltre
  })

  // Données pour le graphique donut
  const pieData = [
    { name: 'Terminées', value: data?.repartitionActions.terminees || 0 },
    { name: 'À compléter', value: data?.repartitionActions.aCompleter || 0 },
    { name: 'En attente', value: data?.repartitionActions.enAttente || 0 },
  ]

  if (user?.collectivities?.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className=""> Vous n'avez pas encore de collectivités associées à votre compte. Veuillez contacter l'administrateur pour obtenir un accès.</div>
      </div>
    )
  }

  return (
    <div className="">
      <div className="relative z-10 max-w-8xl mx-auto px-6 sm:px-8 lg:px-10 py-8">
        <div className="mb-8">
          <h1 className="text-font-primary text-4xl">
            Dashboard de <span className="font-bold text-primary-green">{[data.collectivite]}</span>
          </h1>
          <p className="text-base mt-1">Ce tableau de bord est personnel</p>
        </div>

      <div className="grid grid-cols-1 xl:grid-cols-15 gap-6 mb-12">
        <div className="xl:col-span-3 p-6 h-[340px] card-shadow">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-bold text-font-primary text-2xl">Synthèse</h3>
            <select 
              value={periodeSynthese}
              onChange={(e) => setPeriodeSynthese(e.target.value)}
              className="border border-secondary-green  bg-deco-background-green rounded-full text-sm px-3 py-2 text-[#768776]"
            >
              <option>Mois-ci</option>
              <option>Semaine</option>
              <option>Jour</option>
            </select>
          </div>
          
          <div className="space-y-4">
            <div className=" gap-3">
              <div className="flex items-center gap-2">
                <span className="text-4xl font-bold text-gray-900">{data.synthese.actionsCreees}</span>
                <span className="w-6 h-6 bg-gray-300 rounded-full flex items-center justify-center text-gray-600 text-sm font-medium">=</span>
              </div>
              <span className="text-lg text-font-secondary">Actions crées</span>

            </div>
            
            <div className="gap-3">
              <div className="flex items-center gap-2">
                <span className="text-4xl font-bold text-gray-900">{data.synthese.actionsMisesAJour}</span>
                <span className="w-6 h-6 bg-primary-green rounded-full flex items-center justify-center text-white text-xs font-bold">+2</span>
              </div>

              <span className="text-lg text-font-secondary">Actions mise à jour</span>

            </div>
            
            <div className="gap-3">
              <div className="flex items-center gap-2">
                <span className="text-4xl font-bold text-gray-900">{data.synthese.actionsTerminees}</span>
                <span className="w-6 h-6 bg-primary-orange rounded-full flex items-center justify-center text-white text-xs font-bold">-3</span>
              </div>

              <span className="text-lg text-font-secondary">Actions terminées</span>

            </div>
          </div>
        </div>

        {/* Card Répartition des actions */}
        <div className="xl:col-span-4 p-6 h-full card-shadow">
          <h3 className="font-bold text-font-primary text-2xl mb-4">Répartition des actions</h3>
          
          <div className="flex gap-2 mb-6 flex-wrap">
            <button
              onClick={() => setFiltreTerminees(!filtreTerminees)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                filtreTerminees ? "bg-primary-green text-white" : "border border-gray-300 text-gray-700 bg-white"
              }`}
            >
              Terminées 
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
            </button>
            <button
              onClick={() => setFiltreACompleter(!filtreACompleter)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                filtreACompleter ? "bg-primary-orange text-white" : "border border-gray-300 text-gray-700 bg-white"
              }`}
            >
              À compléter 
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
            </button>
            <button
              onClick={() => setFiltreEnAttente(!filtreEnAttente)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                filtreEnAttente ? "bg-primary-teal text-white" : "border border-gray-300 text-gray-700 bg-white"
              }`}
            >
              En attente 
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
            </button>
          </div>

          {/* Donut Chart */}
          <div className="h-[260px] flex flex-col items-center justify-center relative">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={95}
                  paddingAngle={4}
                  dataKey="value"
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={
                      entry.name === 'Terminées' ? COLORS.terminees :
                      entry.name === 'À compléter' ? COLORS.aCompleter :
                      COLORS.enAttente
                    } />
                  ))}
                </Pie>
                <Tooltip content={({ active, payload }) => {
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
                }} />
              </PieChart>
            </ResponsiveContainer>
            
            <div className="mt-6 flex flex-wrap gap-x-4 gap-y-2 justify-center text-xs text-gray-600">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-full bg-primary-green"></div>
                <span>Actions terminées</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-full bg-primary-orange"></div>
                <span>Actions à compléter</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-full bg-primary-teal"></div>
                <span>Actions en attente</span>
              </div>
            </div>
          </div>
        </div>

        <div className="xl:col-span-8 p-6 h-full card-shadow">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-font-primary text-2xl">Évolutions du statut des actions</h3>
            <select 
              value={periodeEvolution}
              onChange={(e) => setPeriodeEvolution(e.target.value)}
              className="border border-secondary-green  bg-deco-background-green rounded-full text-sm text-[#768776] px-3 py-2"
            >
              <option>Mois</option>
              <option>Semaine</option>
              <option>Jour</option>
            </select>
          </div>
          
          <div className="flex gap-2 mb-6 flex-wrap">
            <button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium bg-primary-green text-white transition-all">
              Terminées 
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
            </button>
            <button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium bg-primary-orange text-white transition-all">
              À compléter 
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
            </button>
            <button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border border-gray-300 text-gray-700 bg-white transition-all">
              En attente
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
              </svg>
            </button>
          </div>

          <div className="h-[260px] rounded-lg overflow-hidden mt-2">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.evolutionStatuts.data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis 
                  dataKey="mois" 
                  tick={{ fontSize: 11, fill: '#6b7280' }} 
                  axisLine={{ stroke: '#e5e7eb' }}
                  tickLine={{ stroke: '#e5e7eb' }}
                />
                <YAxis 
                  tick={{ fontSize: 11, fill: '#6b7280' }}
                  axisLine={{ stroke: '#e5e7eb' }}
                  tickLine={{ stroke: '#e5e7eb' }}
                />
                <Tooltip content={({ active, payload, label }) => {
                  if (active && payload && payload.length) {
                    return (
                      <div className="bg-white border-2 border-primary-orange rounded-lg p-3 shadow-lg">
                        <p className="font-bold text-sm mb-1">{label}</p>
                        {payload.map((entry, index) => (
                          <p key={index} className="text-sm text-gray-600">
                            Nombre d'action {entry.name?.toLowerCase()} 
                            <span className="text-primary-orange font-bold text-lg ml-1">{entry.value}</span>
                          </p>
                        ))}
                      </div>
                    )
                  }
                  return null
                }} />
                <Line 
                  type="monotone" 
                  dataKey="terminees" 
                  stroke={COLORS.terminees} 
                  strokeWidth={3}
                  name="Terminées"
                  dot={{ fill: COLORS.terminees, r: 4 }}
                  activeDot={{ r: 6 }}
                />
                <Line 
                  type="monotone" 
                  dataKey="enAttente" 
                  stroke={COLORS.aCompleter} 
                  strokeWidth={3}
                  name="En attente"
                  dot={{ fill: COLORS.aCompleter, r: 4 }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          
          {/* Légende */}
          <div className="mt-6 flex flex-wrap gap-x-4 gap-y-2 justify-start text-xs text-gray-600">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-primary-green"></div>
              <span>Actions terminées</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-primary-orange"></div>
              <span>Actions en attente</span>
            </div>
          </div>
        </div>
      </div> 


      {/* Toutes les actions */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-4">
          <h2 className="font-bold text-font-primary text-3xl">Toutes les actions</h2>
          <div className="relative">
              <input
                type="text"
                placeholder="Rechercher une action..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 pr-4 py-2 input-primary text-sm w-96"
              />
              <svg className="w-5 h-5 text-gray-400 absolute left-3 top-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button className="inline-flex items-center px-4 py-2 rounded-full text-sm font-medium bg-primary-green text-white">
              Masquer les actions terminées ✕
            </button>


            <select className="border border-secondary-green  bg-deco-background-green rounded-full text-sm text-[#768776] px-3 py-2">
              <option>Tous les statuts</option>
              <option>Terminée</option>
              <option>À compléter</option>
              <option>En attente</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {filteredActions.map((action) => (
            <div 
              key={action.id} 
              className="card-shadow"
              onClick={() => navigate(`/actions/${action.id}/dashboard`)}
            >
              <div className="mb-3">
                <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${getStatutBadgeClass(action.statut)}`}>
                  {action.statut}
                </span>
              </div>
              
              <h3 className="font-bold text-font-primary text-lg mb-2 truncate">{action.nom}</h3>
              <p className="text-sm text-gray-500 mb-3 line-clamp-2">{action.description}</p>
              
              <div className="flex items-center justify-between mb-2">
                <button className="text-sm text-primary-orange font-semibold border-b border-primary-orange">
                  Voir l'action
                </button>
                <div className="flex items-center gap-1">
                  <div className="w-4 h-4 rounded-full border-2 border-gray-300 flex items-center justify-center">
                    <div className={`w-2 h-2 rounded-full ${action.completionPourcentage === 100 ? 'bg-gray-600' : ''}`}></div>
                  </div>
                  <span className="text-xs text-gray-600">Complété à {action.completionPourcentage}%</span>
                </div>
              </div>
            </div>
          ))}

        <div className="mt-6 border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer" onClick={() => navigate(`/actions`)}>
          <div className="flex justify-center mb-2">
            <div className="flex gap-2">
              <div className="w-6 h-6 border-2 border-primary-green rounded"></div>
              <div className="w-6 h-6 bg-primary-green rounded"></div>
              <div className="w-1 h-6 bg-primary-green"></div>
            </div>
          </div>
          <p className="text-sm font-medium text-primary-green">Voir toutes les actions</p>
        </div>
        </div>
      </div>
      </div>
    </div>
  )
}