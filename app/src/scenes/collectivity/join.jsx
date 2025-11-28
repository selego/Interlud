import React, { useState } from "react"
import { FiCheckCircle, FiClock, FiXCircle } from "react-icons/fi"
import toast from "react-hot-toast"

import api from "@/services/api"
import useStore from "@/services/store"
import CollectivitySelector from "@/components/CollectivitySelector"

const Join = () => {
  const { user, setUser } = useStore()
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

  return (
    <div className="relative overflow-hidden py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <h2 className="text-4xl font-bold text-gray-900 mb-4">Rejoindre une collectivité</h2>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">Accédez aux outils et ressources pour la logistique urbaine durable</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
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
                  <p className="text-sm text-primary-green">Une fois votre demande approuvée, vous pourrez accéder au tableau de bord</p>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="card-shadow p-8">
              <h3 className="text-2xl font-bold text-gray-900 mb-6">Mes demandes d'accès</h3>

              {user.collectivities?.length > 0 ? (
                <div className="max-h-96 overflow-y-auto space-y-3 pr-2">
                  {user.collectivities.map(collectivity => (
                    <CollectivityStatus key={collectivity.id} collectivity={collectivity} />
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

const CollectivityStatus = ({ collectivity }) => {
  if (!collectivity) return null

  if (collectivity.status === "approved") {
    return (
      <div className="rounded-lg p-4 bg-green-50 border border-green-200">
        <div className="flex items-start gap-3">
          <FiCheckCircle className="h-5 w-5 flex-shrink-0 text-green-500" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <h4 className="text-base font-semibold text-green-900">{collectivity.name}</h4>
              <span className="text-[11px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-green-100 text-green-800">Accès approuvé</span>
            </div>
            <p className="text-xs text-green-700">Vous disposez désormais d&apos;un accès complet à cette collectivité.</p>
          </div>
        </div>
      </div>
    )
  }

  if (collectivity.status === "rejected") {
    return (
      <div className="rounded-lg p-4 bg-red-50 border border-red-200">
        <div className="flex items-start gap-3">
          <FiXCircle className="h-5 w-5 flex-shrink-0 text-red-500" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <h4 className="text-base font-semibold text-red-900">{collectivity.name}</h4>
              <span className="text-[11px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-red-100 text-red-800">Demande rejetée</span>
            </div>
            <p className="text-xs text-red-700">Cette demande n&apos;a pas été retenue. Contactez-nous pour en savoir plus.</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-lg p-4 bg-yellow-50 border border-yellow-200">
      <div className="flex items-start gap-3">
        <FiClock className="h-5 w-5 flex-shrink-0 text-yellow-500" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <h4 className="text-base font-semibold text-yellow-900">{collectivity.name}</h4>
            <span className="text-[11px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-800">En attente d&apos;approbation</span>
          </div>
          <p className="text-xs text-yellow-700">Votre demande est en cours de traitement par la collectivité.</p>
        </div>
      </div>
    </div>
  )
}

export default Join
