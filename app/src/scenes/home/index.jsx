import React, { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"

// Fonction à remplacer par votre fetch de BDD
const fetchData = async () => {
  // Simuler un délai de réseau
  await new Promise(resolve => setTimeout(resolve, 100))
  
  // Retourner les données hardcodées
  return {
    collectivite: "[Collectivité]",
    actions: [
      {
        id: 1,
        nom: "[Nom de l'action]",
        description: "Description de l'action",
        completionPourcentage: 83,
        type: "Brouillon",
      },
      {
        id: 2,
        nom: "Rénovation des écoles et des mairie",
        description: "Réalisation",
        completionPourcentage: 100,
        type: "Complété",
      },
      {
        id: 3,
        nom: "Card title",
        description: "Réalisation",
        completionPourcentage: 83,
        type: "En cours",
      },
      {
        id: 4,
        nom: "Card title",
        description: "Réalisation",
        completionPourcentage: 83,
        type: "En cours",
      },
    ],
    gainsPrevisionnels: {
      titre: "Gains prévisionnels",
      filtres: [
        { id: 1, nom: "BTE", actif: true },
        { id: 2, nom: "FCS", actif: true },
        { id: 3, nom: "GTEC", actif: false },
        { id: 4, nom: "MT", actif: false },
        { id: 5, nom: "Groupe", actif: false },
      ],
      valeur: "332 kgPhys",
      description: "Correspond aux économies sur les gains prévisionnels",
      chartData: [], // Vos données de graphique ici
    },
    gainsReels: {
      titre: "Gains réels",
      filtres: [
        { id: 1, nom: "BTE", actif: true },
        { id: 2, nom: "MT", actif: true },
        { id: 3, nom: "FCS", actif: true },
        { id: 4, nom: "MT", actif: false },
        { id: 5, nom: "GTG", actif: false },
        { id: 6, nom: "Groupe", actif: false },
      ],
      total: "1138,8 kgEC",
      chartData: [], // Vos données de graphique donut
    },
    gainsReelsPrevisionnels: {
      titre: "Gains réels & prévisionnels",
      filtres: [
        { id: 1, nom: "BTE", actif: true },
        { id: 2, nom: "FCS", actif: true },
        { id: 3, nom: "MT", actif: false },
        { id: 4, nom: "MTG", actif: false },
        { id: 5, nom: "GT", actif: false },
        { id: 6, nom: "Groupe", actif: false },
      ],
      gainsPrevisionnels: "111 kg/pers",
      gainsReels: "471 kg/pers",
      description: "Correspond aux actions mises en oeuvre pour les gains prévisionnels",
      chartData: [], // Vos données de graphique barres
    },
    gainsReelsBottom: {
      titre: "Gains réels",
      filtres: [
        { id: 1, nom: "BTE", actif: true },
        { id: 2, nom: "FCS", actif: false },
        { id: 3, nom: "MT", actif: true },
        { id: 4, nom: "MTG", actif: false },
        { id: 5, nom: "GT", actif: false },
        { id: 6, nom: "Groupe", actif: false },
      ],
      chartData: [], // Vos données de graphique ligne
    },
  }
}

export default function Home() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

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

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-gray-900">
          Dashboard de <span className="font-bold">{data.collectivite}</span>
        </h1>
        <p className="text-sm text-gray-500 mt-1">Le tableau de bord de personnel</p>
      </div>

      {/* Action Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {data.actions.map((action) => (
          <div key={action.id} className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm" onClick={() => navigate(`/action/${action.id}`)}>
            <div className="text-sm text-gray-600 mb-2">
              Complété à <span className="font-semibold">{action.completionPourcentage}%</span>
            </div>
            <h3 className="font-semibold text-gray-900 mb-3">{action.nom}</h3>
            <p className="text-xs text-gray-500 mb-3">{action.description}</p>
            <button className="text-sm text-orange-500 font-medium hover:text-orange-600">
              Compléter
            </button>
          </div>
        ))}
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm mb-6">
        <div className="flex items-start justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center">
            <span className="text-green-500 mr-2">↗</span>
            {data.gainsPrevisionnels.titre}
          </h2>
        </div>
        
        <div className="flex gap-2 mb-6 flex-wrap">
          {data.gainsPrevisionnels.filtres.map((filtre) => (
            <span
              key={filtre.id}
              className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${
                filtre.actif
                  ? filtre.nom === "BTE"
                    ? "bg-green-500 text-white"
                    : filtre.nom === "FCS"
                    ? "bg-orange-500 text-white"
                    : "bg-blue-500 text-white"
                  : "border border-gray-300 text-gray-700 bg-white"
              }`}
            >
              {filtre.nom}
            </span>
          ))}
        </div>

        {/* Chart placeholder */}
        <div className="h-64 bg-gray-50 rounded-lg flex items-center justify-center border border-gray-200">
          <p className="text-gray-400">Graphique Gains prévisionnels (ligne)</p>
        </div>
        
        <div className="mt-4 text-sm text-gray-600">
          <p>Gains prévisionnels : {data.gainsPrevisionnels.valeur}</p>
          <p className="text-xs text-gray-500 mt-1">{data.gainsPrevisionnels.description}</p>
        </div>
        <p className="text-xs text-gray-500 mt-2">Naviguer facilement</p>
      </div>

      {/* Gains réels Section */}
      <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm mb-6">
        <div className="flex items-start justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center">
            <span className="text-red-500 mr-2">↘</span>
            {data.gainsReels.titre}
          </h2>
        </div>
        
        {/* Filter badges */}
        <div className="flex gap-2 mb-6 flex-wrap">
          {data.gainsReels.filtres.map((filtre) => (
            <span
              key={filtre.id}
              className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${
                filtre.actif
                  ? filtre.nom === "BTE"
                    ? "bg-green-500 text-white"
                    : filtre.nom === "FCS"
                    ? "bg-orange-500 text-white"
                    : "bg-blue-500 text-white"
                  : "border border-gray-300 text-gray-700 bg-white"
              }`}
            >
              {filtre.nom}
            </span>
          ))}
        </div>

        {/* Chart placeholder - Donut chart */}
        <div className="h-64 bg-gray-50 rounded-lg flex items-center justify-center border border-gray-200">
          <p className="text-gray-400">Graphique Gains réels (donut/pie chart)</p>
        </div>
        
        <div className="mt-4 text-sm text-gray-600">
          <p>Total : {data.gainsReels.total}</p>
        </div>
        <p className="text-xs text-gray-500 mt-2">Naviguer facilement</p>
      </div>

      {/* Gains réels & prévisionnels Section */}
      <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm mb-6">
        <div className="flex items-start justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center">
            <span className="text-green-500 mr-2">↗</span>
            {data.gainsReelsPrevisionnels.titre}
          </h2>
          <select className="text-sm border-gray-300 rounded-md">
            <option>Tous</option>
          </select>
        </div>
        
        {/* Filter badges */}
        <div className="flex gap-2 mb-6 flex-wrap">
          {data.gainsReelsPrevisionnels.filtres.map((filtre) => (
            <span
              key={filtre.id}
              className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${
                filtre.actif
                  ? filtre.nom === "BTE"
                    ? "bg-green-500 text-white"
                    : filtre.nom === "FCS"
                    ? "bg-orange-500 text-white"
                    : "bg-blue-500 text-white"
                  : "border border-gray-300 text-gray-700 bg-white"
              }`}
            >
              {filtre.nom}
            </span>
          ))}
        </div>

        {/* Chart placeholder - Bar chart */}
        <div className="h-64 bg-gray-50 rounded-lg flex items-center justify-center border border-gray-200">
          <p className="text-gray-400">Graphique Gains réels & prévisionnels (barres)</p>
        </div>
        
        <div className="mt-4 text-sm text-gray-600">
          <p>Gains prévisionnels : {data.gainsReelsPrevisionnels.gainsPrevisionnels}</p>
          <p>Gains réels : {data.gainsReelsPrevisionnels.gainsReels}</p>
        </div>
        <p className="text-xs text-gray-500 mt-2">{data.gainsReelsPrevisionnels.description}</p>
        <p className="text-xs text-gray-500 mt-1">Naviguer facilement</p>
      </div>

      {/* Gains réels bottom Section */}
      <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
        <div className="flex items-start justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center">
            <span className="text-green-500 mr-2">↗</span>
            {data.gainsReelsBottom.titre}
          </h2>
        </div>
        
        {/* Filter badges */}
        <div className="flex gap-2 mb-6 flex-wrap">
          {data.gainsReelsBottom.filtres.map((filtre) => (
            <span
              key={filtre.id}
              className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${
                filtre.actif
                  ? filtre.nom === "BTE"
                    ? "bg-green-500 text-white"
                    : filtre.nom === "FCS"
                    ? "bg-orange-500 text-white"
                    : "bg-blue-500 text-white"
                  : "border border-gray-300 text-gray-700 bg-white"
              }`}
            >
              {filtre.nom}
            </span>
          ))}
        </div>

        {/* Chart placeholder */}
        <div className="h-64 bg-gray-50 rounded-lg flex items-center justify-center border border-gray-200">
          <p className="text-gray-400">Graphique Gains réels (ligne)</p>
        </div>

        {/* Add measure card */}
        <div className="mt-6 border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
          <div className="flex justify-center mb-2">
            <div className="flex gap-2">
              <div className="w-6 h-6 border-2 border-green-500 rounded"></div>
              <div className="w-6 h-6 bg-green-500 rounded"></div>
            </div>
          </div>
          <p className="text-sm font-medium text-gray-700">Ajouter une mesure</p>
        </div>
      </div>
    </div>
  )
}