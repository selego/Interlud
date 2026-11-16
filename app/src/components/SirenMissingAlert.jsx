import React, { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import toast from "react-hot-toast"
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

  const fetchCollectivity = async () => {
    try {
      setCollectivity(null)
      if (!action?.collectivity_id && !storeCollectivity?._id) return
      const { ok, data, code } = await api.get(`/collectivity/${action?.collectivity_id || storeCollectivity?._id}`)
      if (!ok) return toast.error(code || "Une erreur est survenue")
      setCollectivity(data)
    } catch (error) {
      toast.error(error.code || "Une erreur est survenue")
    }
  }

  useEffect(() => {
    fetchCollectivity()
  }, [action?.collectivity_id, storeCollectivity?._id])

  if (!collectivity || collectivity.siren || areResultsHidden(user, collectivity)) return null

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
