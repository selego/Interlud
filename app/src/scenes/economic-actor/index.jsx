import api from "@/services/api"
import toast from "react-hot-toast"
import useStore from "@/services/store"
import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import validator from "validator"
import Modal from "@/components/modal"

export default function EconomicActor() {
  const navigate = useNavigate()
  const [users, setUsers] = useState([])
  const [isModalOpen, setIsModalOpen] = useState(false)
  const { economicActor } = useStore()

  const fetchUsers = async () => {
    if (!economicActor?._id) return
    try {
      const { ok, data, code } = await api.post("/user/search", { economic_actor_id: economicActor._id })
      if (!ok) return toast.error(code || "Une erreur est survenue")
      setUsers(data)
    } catch (error) {
      toast.error(error.code || "Une erreur est survenue")
    }
  }

  useEffect(() => {
    fetchUsers()
  }, [economicActor])

  if (!economicActor) {
    return (
      <div className="p-8">
        <div className="flex flex-col items-center justify-center min-h-[400px] text-center">
          <div className="text-6xl mb-4">🏢</div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Aucun acteur économique</h2>
          <p className="text-gray-600 mb-6">Votre compte n'est rattaché à aucun acteur économique.</p>
          <button onClick={() => navigate("/")} className="button-primary">
            Retour à l'accueil
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Membres de {economicActor?.name}</h1>
        <button onClick={() => setIsModalOpen(true)} className="button-primary">
          Inviter un membre
        </button>
      </div>

      {users.length === 0 ? (
        <div className="flex items-center justify-center">
          <div className="text-lg text-gray-600">Aucun membre dans cet acteur économique</div>
        </div>
      ) : (
        <table className="w-full overflow-hidden card-shadow">
          <thead className="bg-gray-100">
            <tr>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Nom</th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Email</th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Dernière connexion</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {users.map((user) => (
              <tr key={user._id} className="hover:bg-gray-50">
                <td className="px-6 py-4 text-sm font-medium text-gray-900">{user.name || "-"}</td>
                <td className="px-6 py-4 text-sm text-gray-600">{user.email}</td>
                <td className="px-6 py-4 text-sm text-gray-600">
                  {user.last_login_at && !isNaN(new Date(user.last_login_at).getTime()) ? new Date(user.last_login_at).toLocaleDateString("fr-FR") : "Jamais"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <InviteMemberModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} economicActor={economicActor} onSuccess={fetchUsers} />
    </div>
  )
}

const InviteMemberModal = ({ isOpen, onClose, economicActor, onSuccess }) => {
  const [email, setEmail] = useState("")
  const [loading, setLoading] = useState(false)

  const handleInvite = async () => {
    try {
      if (!validator.isEmail(email)) return toast.error("Veuillez entrer un email valide")

      setLoading(true)

      const { ok, code } = await api.post("/user/invite", {
        email: email,
        economic_actor: economicActor
      })
      if (!ok) {
        if (code === "ALREADY_MEMBER") return toast.error("Cet utilisateur est déjà membre de l'acteur économique.")
        return toast.error(code || "Une erreur est survenue")
      }

      toast.success("Invitation envoyée avec succès !")
      setEmail("")
      onClose()
      if (onSuccess) onSuccess()
    } catch (error) {
      if (error.code === "ALREADY_MEMBER") return toast.error("Cet utilisateur est déjà membre de l'acteur économique.")
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
          La personne recevra un email d'invitation pour rejoindre l'acteur économique <strong>{economicActor?.name}</strong>
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
