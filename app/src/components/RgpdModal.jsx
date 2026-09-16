import { useState } from "react"
import toast from "react-hot-toast"

import Modal from "@/components/modal"
import Conditions from "@/scenes/confidentiality/conditions"
import useStore from "@/services/store"
import api from "@/services/api"
import { RGPD_LAST_UPDATE } from "@/utils/constants"

export default function RgpdModal() {
  const { user, setUser } = useStore()
  const [loading, setLoading] = useState(false)

  if (!user) return null

  const mustAccept = !user.rgpd_accepted_at || new Date(user.rgpd_accepted_at) < new Date(RGPD_LAST_UPDATE)
  if (!mustAccept) return null

  const handleAccept = async () => {
    setLoading(true)
    try {
      const { ok, data, code } = await api.put("/user", { rgpd_accepted_at: new Date() })
      if (!ok) return toast.error(code || "Erreur lors de l'enregistrement de votre acceptation")
      setUser(data)
    } catch (error) {
      toast.error(error || "Erreur lors de l'enregistrement de votre acceptation")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal isOpen className="w-[calc(100%_-_60px)] max-w-4xl">
      <div className="flex flex-col max-h-[90vh]">
        <div className="flex-1 overflow-y-auto">
          <Conditions />
        </div>
        <div className="border-t border-gray-200 px-8 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <p className="text-sm text-gray-600">
            Pour continuer à utiliser la plateforme, vous devez accepter les Conditions Générales d'Utilisation.
          </p>
          <button type="button" className="fr-btn" onClick={handleAccept} disabled={loading}>
            {loading ? "Enregistrement..." : "J'accepte"}
          </button>
        </div>
      </div>
    </Modal>
  )
}
