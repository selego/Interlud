import React, { useState, useEffect } from "react"
import { useParams } from "react-router-dom"

// Fonction à remplacer par votre fetch de BDD
const fetchActionData = async (actionId) => {
  
  // Retourner les données hardcodées
  return {
    id: actionId,
    nom: "[Nom de l'action]",
    statut: "Brouillon",
    completionPourcentage: 62,
    derniereModification: {
      temps: "3h",
      utilisateur: "User 1345",
    },
    sections: [
      {
        id: "donnees-base",
        nom: "Données de base",
        completionPourcentage: 62,
        expanded: false,
      },
      {
        id: "donnees-production",
        nom: "Données de production",
        completionPourcentage: 100,
        expanded: false,
      },
      {
        id: "fret-routier",
        nom: "Fret routier",
        completionPourcentage: 66,
        expanded: true,
        categories: [
          { id: 1, nom: "Catégorie 1" },
          { id: 2, nom: "Catégorie 2" },
          { id: 3, nom: "Catégorie 3" },
        ],
      },
    ],
    fretRoutier: {
      categories: [
        {
          id: 1,
          nom: "VUL Electrique (Crit'Air E)",
          typeVehicule: "VUL",
          ptac: { min: "1Tt", max: "3,5t" },
          motorisation: "Electrique",
          normeEuro: "Electrique",
          vignetteCritAir: "E",
          nombreVehicules: 4,
          distanceAnnuelle: "25 000",
          tauxRemplissage: 2,
        },
        {
          id: 2,
          nom: "VUL Electrique (Crit'Air E)",
          typeVehicule: "VUL",
          ptac: { min: "1Tt", max: "3,5t" },
          motorisation: "Electrique",
          normeEuro: "Electrique",
          vignetteCritAir: "E",
          nombreVehicules: 4,
          distanceAnnuelle: "25 000",
          tauxRemplissage: 2,
        },
      ],
    },
  }
}

export default function ActionDetail() {
  const { id } = useParams()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [expandedSections, setExpandedSections] = useState({})

  const loadData = async () => {
    try {
      setLoading(true)
      const result = await fetchActionData(id)
      setData(result)
      
      const initialExpanded = {}
      result.sections.forEach(section => {
        initialExpanded[section.id] = section.expanded
      })
      setExpandedSections(initialExpanded)
    } catch (error) {
      console.error("Erreur lors du chargement des données:", error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [id])

  const toggleSection = (section) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }))
  }

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
    <div className="flex bg-gray-50 min-h-screen">
      {/* Sidebar - Static */}
      <div className="w-80 bg-white border-r border-gray-200 flex-shrink-0">
        <div className="p-6 top-0">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">{data.nom}</h2>
          
          {data.sections.map((section) => (
            <div key={section.id} className="mb-4">
              <button 
                onClick={() => toggleSection(section.id)}
                className="flex items-center justify-between w-full py-2 text-sm font-medium text-gray-700 hover:text-gray-900"
              >
                <div className="flex items-center gap-2">
                  <span>{section.nom}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs ${section.completionPourcentage === 100 ? 'text-green-600' : 'text-gray-500'}`}>
                    Complété à {section.completionPourcentage}%
                  </span>
                  <span className="text-lg">{expandedSections[section.id] ? "▼" : "▶"}</span>
                </div>
              </button>

              {expandedSections[section.id] && section.categories && (
                <div className="ml-6 mt-2 space-y-2">
                  {section.categories.map((categorie) => (
                    <div key={categorie.id} className="flex items-center gap-2 text-sm text-gray-600 py-1">
                      <span className="w-4 h-4 rounded-full border border-gray-400"></span>
                      <span>{categorie.nom}</span>
                    </div>
                  ))}
                  <button className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700 py-1 font-medium">
                    + Ajouter une catégorie
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1">
        <div className="max-w-5xl mx-auto p-8">
          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-2xl font-bold text-green-600">{data.nom}</h1>
              <span className="px-3 py-1 bg-gray-200 text-gray-700 rounded-md text-sm">{data.statut}</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <span className="text-green-600">◐</span>
              <span>Complété à <strong>{data.completionPourcentage}%</strong></span>
              <span className="text-gray-400">—</span>
              <span>
                Dernière mise à jours il y a <strong>{data.derniereModification.temps}</strong> par{" "}
                <strong>{data.derniereModification.utilisateur}</strong>
              </span>
            </div>
          </div>

          {/* Fret routier Section */}
          <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-6">Fret routier</h2>

            {data.fretRoutier.categories.map((categorie, index) => (
              <div 
                key={categorie.id} 
                className={`mb-8 ${index < data.fretRoutier.categories.length - 1 ? 'pb-8 border-b border-gray-200' : ''}`}
              >
                <h3 className="text-lg font-medium text-gray-900 mb-4">Catégorie {categorie.id}</h3>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Nom de la catégorie de véhicules
                    </label>
                    <input 
                      type="text" 
                      defaultValue={categorie.nom}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Type de véhicule
                    </label>
                    <select 
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                      defaultValue={categorie.typeVehicule}
                    >
                      <option>VUL</option>
                      <option>PL</option>
                      <option>VL</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      PTAC
                    </label>
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center px-3 py-2 rounded-md bg-green-500 text-white text-sm">
                        de {categorie.ptac.min}
                      </span>
                      <span className="text-gray-400">à {categorie.ptac.max}</span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Motorisation
                    </label>
                    <div className="flex gap-2">
                      {['Electrique', 'Essence', 'Diesel'].map((motor) => (
                        <button
                          key={motor}
                          className={`px-4 py-2 rounded-md text-sm ${
                            categorie.motorisation === motor
                              ? 'bg-green-600 text-white font-medium'
                              : 'border border-gray-300 text-gray-700'
                          }`}
                        >
                          {motor}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Norme euro
                    </label>
                    <div className="flex gap-2">
                      {['Electrique', 'Essence', 'Diesel'].map((norme) => (
                        <button
                          key={norme}
                          className={`px-4 py-2 rounded-md text-sm ${
                            categorie.normeEuro === norme
                              ? 'bg-green-600 text-white font-medium'
                              : 'border border-gray-300 text-gray-700'
                          }`}
                        >
                          {norme}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Vignette crit'air
                    </label>
                    <select 
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                      defaultValue={categorie.vignetteCritAir}
                    >
                      <option>E</option>
                      <option>1</option>
                      <option>2</option>
                      <option>3</option>
                      <option>4</option>
                      <option>5</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Nombre de véhicules correspondants
                    </label>
                    <input 
                      type="number" 
                      defaultValue={categorie.nombreVehicules}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Ordre de grandeur de la distance parcourue annuellement{" "}
                      <span className="text-gray-500 text-xs italic">
                        (ensemble des véhicules renseigné pour la catégorie)
                      </span>
                    </label>
                    <input 
                      type="text" 
                      defaultValue={categorie.distanceAnnuelle}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Estimation du taux de remplissage moyen de ces véhicules
                    </label>
                    <input 
                      type="number" 
                      defaultValue={categorie.tauxRemplissage}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}