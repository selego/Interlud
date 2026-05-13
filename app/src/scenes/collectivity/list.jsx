import api from "@/services/api"
import toast from "react-hot-toast"
import useStore from "@/services/store"
import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import validator from "validator"
import Modal from "@/components/modal"

const ROLE_LABELS = {
  user: "Utilisateur",
  admin: "Administrateur",
  economic_actor: "Acteur économique"
}

const ROLE_COLORS = {
  user: "bg-gray-100 text-gray-800",
  admin: "bg-blue-100 text-blue-800",
  economic_actor: "bg-green-100 text-green-800"
}

export default function List() {
  const navigate = useNavigate()
  const [users, setUsers] = useState([])
  const [isModalOpen, setIsModalOpen] = useState(false)
  const { collectivity } = useStore()

  const fetchUsers = async () => {
    if (!collectivity?._id) return
    try {
      const { data, ok, code } = await api.post("/user/search", { collectivity_id: collectivity._id })
      if (!ok) return toast.error(code || "Une erreur est survenue")
      setUsers(data)
    } catch (error) {
      toast.error("Une erreur est survenue")
    }
  }

  useEffect(() => {
    fetchUsers()
  }, [collectivity])

  if (!collectivity) {
    return (
      <div className="p-8">
        <div className="flex flex-col items-center justify-center min-h-[400px] text-center">
          <div className="text-6xl mb-4">🏛️</div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Aucune collectivité sélectionnée</h2>
          <p className="text-gray-600 mb-6">Veuillez sélectionner une collectivité pour accéder à la gestion des membres.</p>
          <button onClick={() => navigate("/")} className="button-primary">
            Retour à l'accueil
          </button>
        </div>
      </div>
    )
  }

  if (users.length === 0)
    return (
      <div className="p-8">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold">Membres de {collectivity?.name}</h1>
          <button onClick={() => setIsModalOpen(true)} className="button-primary">
            Inviter un membre
          </button>
        </div>

        <div className="flex items-center justify-center">
          <div className="text-lg text-gray-600">Aucun membre dans cette collectivité</div>
        </div>
        <InviteMemberModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} collectivity={collectivity} onSuccess={fetchUsers} />
      </div>
    )

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Membres de {collectivity?.name}</h1>
        <button onClick={() => setIsModalOpen(true)} className="button-primary">
          Inviter un membre
        </button>
      </div>

      <table className="w-full overflow-hidden card-shadow">
        <thead className="bg-gray-100">
          <tr>
            <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Nom</th>
            <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Email</th>
            <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Rôle</th>
            <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Statut</th>
            <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Dernière connexion</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {users.map((user) => {
            const collectivityData = user.collectivities?.find((c) => c.id === collectivity._id)
            return (
              <tr key={user._id} className="hover:bg-gray-50 cursor-pointer" onClick={() => navigate(`/collectivity/${user._id}`)}>
                <td className="px-6 py-4 text-sm font-medium text-gray-900">{user.name || "-"}</td>
                <td className="px-6 py-4 text-sm text-gray-600">{user.email}</td>
                <td className="px-6 py-4 text-sm text-gray-600">
                  <span className={`px-2 py-1 rounded-full text-xs font-semibold ${ROLE_COLORS[collectivityData?.role || "user"]}`}>
                    {ROLE_LABELS[collectivityData?.role || "user"]}
                  </span>
                </td>
                <td className="px-6 py-4 text-sm text-gray-600">
                  <span
                    className={`px-2 py-1 rounded-full text-xs ${
                      collectivityData?.status === "approved"
                        ? "bg-green-100 text-green-800"
                        : collectivityData?.status === "pending"
                        ? "bg-yellow-100 text-yellow-800"
                        : "bg-red-100 text-red-800"
                    }`}
                  >
                    {collectivityData?.status === "approved" ? "Approuvé" : collectivityData?.status === "pending" ? "En attente" : "Rejeté"}
                  </span>
                </td>
                <td className="px-6 py-4 text-sm text-gray-600">
                  {user.last_login_at && !isNaN(new Date(user.last_login_at).getTime()) ? new Date(user.last_login_at).toLocaleDateString("fr-FR") : "Jamais"}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <InviteMemberModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} collectivity={collectivity} onSuccess={fetchUsers} />
    </div>
  )
}

const InviteMemberModal = ({ isOpen, onClose, collectivity, onSuccess }) => {
  const [email, setEmail] = useState("")
  const [loading, setLoading] = useState(false)

  const handleInvite = async () => {
    try {
      if (!validator.isEmail(email)) return toast.error("Veuillez entrer un email valide")

      setLoading(true)

      const { ok, code } = await api.post("/user/invite", {
        email: email,
        collectivity
      })
      if (!ok) {
        return toast.error(code || "Une erreur est survenue")
      }

      toast.success("Invitation envoyée avec succès !")
      setEmail("")
      onClose()
      if (onSuccess) onSuccess()
    } catch (error) {
      if (error.code === "ALREADY_MEMBER") return toast.error("Cet utilisateur est déjà membre de la collectivité.")
      toast.error("Une erreur est survenue")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        setEmail("")
        onClose()
      }}
      className="max-w-xl"
    >
      <div className="p-8 gap-2">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-gray-800">Inviter un membre</h2>
        </div>

        <div className="mb-2">
          <label className="block text-sm font-semibold text-gray-700 mb-2">Email</label>
          <input
            type="email"
            placeholder="Entrez l'email de la personne à inviter"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                handleInvite()
              }
            }}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all"
          />
        </div>

        <div className="text-xs text-gray-600 mb-6">
          La personne recevra un email d'invitation pour rejoindre la collectivité <strong>{collectivity?.name}</strong>
        </div>

        <div className="flex justify-end gap-3">
          <button onClick={handleInvite} className="button-primary" disabled={!email.trim() || loading}>
            {loading ? "Envoi en cours..." : "Envoyer l'invitation"}
          </button>
        </div>
      </div>
    </Modal>
  )
}
