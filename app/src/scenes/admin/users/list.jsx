import React, { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import Modal from "@/components/modal"
import api from "@/services/api"
import toast from "react-hot-toast"

const ROLE_LABELS = {
  admin: "Administrateur",
  user: "Utilisateur",
  economic_actor: "Acteur économique"
}

const ROLE_COLORS = {
  admin: "bg-blue-100 text-blue-800",
  user: "bg-gray-100 text-gray-800",
  economic_actor: "bg-green-100 text-green-800"
}

export default function List() {
  const navigate = useNavigate()
  const [users, setUsers] = useState([])
  const [isModalOpen, setIsModalOpen] = useState(false)

  const fetchUsers = async () => {
    try {
      const { data, ok, code } = await api.post("/user/search", {})
      if (!ok) return toast.error(code || "Une erreur est survenue")
      setUsers(data)
    } catch (error) {
      toast.error(error || "Une erreur est survenue")
    }
  }

  useEffect(() => {
    fetchUsers()
  }, [])

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Liste des Utilisateurs</h1>
        <button onClick={() => setIsModalOpen(true)} className="button-primary">
          Ajouter
        </button>
      </div>

      <table className="w-full overflow-hidden card-shadow">
        <thead className="bg-gray-100">
          <tr>
            <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Nom</th>
            <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Email</th>
            <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Rôle</th>
            <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Collectivités</th>
            <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Dernière connexion</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {users.map((user) => (
            <tr key={user._id} className="hover:bg-gray-50 cursor-pointer" onClick={() => navigate(`/admin/users/${user._id}`)}>
              <td className="px-6 py-4 text-sm font-medium text-gray-900">{user.name}</td>
              <td className="px-6 py-4 text-sm text-gray-600">{user.email}</td>
              <td className="px-6 py-4 text-sm text-gray-600">
                <span className={`px-2 py-1 rounded-full text-xs font-semibold ${ROLE_COLORS[user.role]}`}>{ROLE_LABELS[user.role]}</span>
              </td>
              <td className="px-6 py-4 text-sm text-gray-600">{user.collectivities?.length || 0}</td>
              <td className="px-6 py-4 text-sm text-gray-600">
                {" "}
                {user.last_login_at && !isNaN(new Date(user.last_login_at).getTime()) ? new Date(user.last_login_at).toLocaleDateString("fr-FR") : "Jamais"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <AddUserModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </div>
  )
}

const AddUserModal = ({ isOpen, onClose }) => {
  const navigate = useNavigate()
  const [values, setValues] = useState({ name: "", email: "", entityName: "" })
  const [accountType, setAccountType] = useState("user")

  const createUser = async () => {
    try {
      if (!values.name.trim()) return toast.error("Veuillez entrer un nom pour l'utilisateur")
      if (!values.email.trim()) return toast.error("Veuillez entrer un email pour l'utilisateur")
      if (accountType === "economic_actor" && !values.entityName.trim())  return toast.error("Veuillez entrer le nom de la société")

      const payload = { ...values, password: "Password123!",role: accountType }

      if (accountType === "economic_actor") payload.economic_actor_name = values.entityName

      const { ok, data, code } = await api.post("/user/", payload)
      if (!ok) return toast.error(code || "Une erreur est survenue")
      navigate(`/admin/users/${data._id}`)
    } catch (error) {
       return toast.error(error.code || "Une erreur est survenue")
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} className="max-w-xl">
      <div className="p-8 gap-2">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-gray-800">Ajouter un utilisateur</h2>
        </div>

        <div className="space-y-2 mb-6">
          <p className="text-sm font-semibold text-gray-700">Type de compte :</p>
          <div className="grid grid-cols-3 gap-3">
            <button
              type="button"
              className={`w-full px-4 py-2 text-sm font-medium border rounded-lg transition-colors ${
                accountType === "user" ? "bg-primary-green text-white border-primary-green" : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
              }`}
              onClick={() => setAccountType("user")}
            >
              Acteur public
            </button>
            <button
              type="button"
              className={`w-full px-4 py-2 text-sm font-medium border rounded-lg transition-colors ${
                accountType === "admin" ? "bg-primary-green text-white border-primary-green" : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
              }`}
              onClick={() => setAccountType("admin")}
            >
              Admin
            </button>
            <button
              type="button"
              className={`w-full px-4 py-2 text-sm font-medium border rounded-lg transition-colors ${
                accountType === "economic_actor" ? "bg-primary-green text-white border-primary-green" : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
              }`}
              onClick={() => setAccountType("economic_actor")}
            >
              Acteur économique
            </button>
          </div>
        </div>

        {accountType === "economic_actor" && (
          <div className="mb-6">
            <label className="block text-sm font-semibold text-gray-700 mb-2">Nom de la société</label>
            <input
              type="text"
              placeholder="Entrez le nom de la société"
              value={values.entityName}
              onChange={(e) => setValues({ ...values, entityName: e.target.value })}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all"
            />
          </div>
        )}

        <div className="mb-6">
          <label className="block text-sm font-semibold text-gray-700 mb-2">Nom complet</label>
          <input
            type="text"
            placeholder="Entrez le nom"
            value={values.name}
            onChange={(e) => setValues({ ...values, name: e.target.value })}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all"
          />
        </div>

        <div className="mb-6">
          <label className="block text-sm font-semibold text-gray-700 mb-2">Email</label>
          <input
            type="text"
            placeholder="Entrez l'email"
            value={values.email}
            onChange={(e) => setValues({ ...values, email: e.target.value })}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all"
          />
        </div>

        <div className="flex justify-end gap-3">
          <button onClick={createUser} className="button-primary" disabled={!values.name || !values.email || (accountType === "economic_actor" && !values.entityName)}>
            Créer
          </button>
        </div>
      </div>
    </Modal>
  )
}
