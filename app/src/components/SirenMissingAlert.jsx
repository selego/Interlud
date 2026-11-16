import React, { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import Alert from "@codegouvfr/react-dsfr/Alert"
import api from "@/services/api"
import useStore from "@/services/store"
import { areResultsHidden } from "@/utils/results"

// Avertit quand la collectivité n'a pas de SIREN : il est écrit dans l'indicateur Excel SIRENTerr
// à la création d'une action, et certains calculs (ex. parts de parc de B3) valent 0 sans lui.
// Collectivité vérifiée : celle de l'action si `action` est fourni, sinon celle du store.
// `className` : espacement selon la page.
// Masqué aux acteurs économiques (ils ne voient pas les résultats et ne peuvent pas modifier la collectivité).
export default function SirenMissingAlert({ action, className }) {
  const { user, collectivity: storeCollectivity } = useStore()
  const [collectivity, setCollectivity] = useState(null)
  const targetId = action?.collectivity_id || storeCollectivity?._id
  const hidden = !targetId || areResultsHidden(user, targetId)

  useEffect(() => {
    setCollectivity(null)
    if (hidden) return
    // Réponse ignorée si la collectivité a changé entre-temps
    let cancelled = false
    const fetchCollectivity = async () => {
      try {
        const { ok, data } = await api.get(`/collectivity/${targetId}`)
        // Simple information : en cas d'erreur, on n'affiche rien plutôt qu'un message d'erreur
        if (!cancelled && ok) setCollectivity(data)
      } catch (error) {
        // idem
      }
    }
    fetchCollectivity()
    return () => {
      cancelled = true
    }
  }, [targetId, hidden])

  if (hidden || !collectivity || collectivity._id !== targetId || collectivity.siren) return null

  return (
    <Alert
      className={className}
      severity="warning"
      small
      description={
        <>
          Le SIREN de votre collectivité n&apos;est pas renseigné : certains résultats (par exemple les parts de parc) seront nuls.{" "}
          {user?.role === "admin" ||
          (user?.collectivities || []).some((c) => c.id === collectivity._id && c.status === "approved" && c.role === "admin") ? (
            <Link to={`/admin/collectivity/${collectivity._id}`}>Renseignez-le dans les informations de la collectivité.</Link>
          ) : (
            "Demandez à un administrateur de votre collectivité de le renseigner."
          )}
        </>
      }
    />
  )
}
