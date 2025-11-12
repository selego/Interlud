import React, { useState } from "react"
import api from "@/services/api"
import toast from "react-hot-toast"
import useStore from "@/services/store"
import CollectivitySelector from "@/components/CollectivitySelector"
import Dashboard from "./dashboard"

export default function Home() {
  const { collectivity, user, setUser } = useStore()
  const [selectedCollectivity, setSelectedCollectivity] = useState(null)

  const handleRequestAccess = async () => {
    if (!selectedCollectivity) return toast.error("Sélectionnez une collectivité")
    try {
      const { ok, data, code } = await api.post("/user/request-collectivity-access", { collectivityId: selectedCollectivity._id })
      if (!ok) return toast.error(code || "Une erreur est survenue")
      setUser(data)
      toast.success("Demande envoyée avec succès ! En attente d'approbation")
    } catch (error) {
      toast.error(error.code || "Une erreur est survenue")
    }
  }

  if (!collectivity) {
    return (
      <div className="relative overflow-hidden py-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="text-center mb-12">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">Rejoindre une collectivité</h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">Accédez aux outils et ressources pour la logistique urbaine durable</p>
          </div>

          {/* Main Content Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Left Column - Collectivity Selection */}
            <div className="space-y-6">
              <div className="card-shadow p-8">
                <h3 className="text-2xl font-bold text-gray-900 mb-6">Sélectionner une collectivité</h3>

                <div className="space-y-6">
                  <div>
                    <label htmlFor="collectivity" className="block text-sm font-medium text-gray-700 mb-3">
                      Choisissez votre collectivité
                    </label>
                    <CollectivitySelector onSelect={collectivity => setSelectedCollectivity(collectivity)} />
                  </div>

                  <button
                    onClick={handleRequestAccess}
                    disabled={!selectedCollectivity}
                    className="button-primary w-full px-6 py-4 text-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Demander l'accès
                  </button>
                </div>

                <div className="relative my-8">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-gray-300"></div>
                  </div>
                  <div className="relative flex justify-center text-sm">
                    <span className="px-4 bg-white text-gray-500">Ou</span>
                  </div>
                </div>

                <div className="text-center">
                  <p className="text-sm text-gray-600">
                    Vous ne trouvez pas votre collectivité ? &nbsp;
                    <button
                      className="text-primary-green hover:text-primary-green font-medium transition-colors underline"
                      onClick={() => toast.info("Contactez le support InTerLUD+ pour ajouter votre collectivité")}
                    >
                      Contacter le support InTerLUD+
                    </button>
                  </p>
                </div>
              </div>

              {/* Info Box */}
              <div className="bg-blue-50 border-l-4 border-secondary-green rounded-lg p-6">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <svg className="h-6 w-6 text-secondary-green" fill="currentColor" viewBox="0 0 20 20">
                      <path
                        fillRule="evenodd"
                        d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <p className="text-sm text-primary-green">Une fois votre demande approuvée, vous pourrez accéder au tableau de bord de votre collectivité</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column - Pending Requests */}
            <div className="space-y-6">
              <div className="card-shadow p-8">
                <h3 className="text-2xl font-bold text-gray-900 mb-6">Mes demandes d'accès</h3>

                {user.collectivities?.length > 0 ? (
                  <div className="max-h-96 overflow-y-auto space-y-3 pr-2">
                    {user.collectivities.map(c => (
                      <div key={c.id} className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                        <div className="flex items-start">
                          <div className="flex-shrink-0">
                            <svg className="h-4 w-4 text-yellow-500 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                              <path
                                fillRule="evenodd"
                                d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z"
                                clipRule="evenodd"
                              />
                            </svg>
                          </div>
                          <div className="ml-3 flex-1">
                            <h4 className="text-base font-semibold text-yellow-800 mb-1">{c.name}</h4>
                            <p className="text-xs text-yellow-700 mb-1">Demande envoyée - En attente d'approbation</p>
                            <div className="flex items-center text-xs text-yellow-600">
                              <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                              Délai de traitement : 2-5 jours ouvrés
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12 ov">
                    <svg className="mx-auto h-12 w-12 text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                      />
                    </svg>
                    <h4 className="text-lg font-medium text-gray-900 mb-2">Aucune demande en cours</h4>
                    <p className="text-sm text-gray-500">Vos demandes d'accès aux collectivités apparaîtront ici</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }
  return <Dashboard collectivity={collectivity} />
}
