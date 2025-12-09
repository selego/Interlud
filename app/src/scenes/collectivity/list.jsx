import api from "@/services/api"
import toast from "react-hot-toast"
import useStore from "@/services/store"
import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"

const ROLE_LABELS = {
  user: "Utilisateur",
  admin: "Administrateur",
  economic_actor: "Acteur économique"
}

export default function List() {
  const navigate = useNavigate()
  const [users, setUsers] = useState([])
  const { collectivity } = useStore()

  const fetchUsers = async () => {
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
  }, [])

  if ( users.length === 0 ) return (
    <div className="p-8"> 
          <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Membres de {collectivity?.name}</h1>
      </div>

      <div className="flex items-center justify-center">
        <div className="text-lg text-gray-600">Aucun membre dans cette collectivité</div>
      </div>
    </div>
  )


  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Membres de {collectivity?.name}</h1>
      </div>

      <table className="w-full overflow-hidden card-shadow">
        <thead className="bg-gray-100">
          <tr>
            <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Nom</th>
            <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Email</th>
            <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Rôle</th>
            <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Statut</th>
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
                  <span className="px-2 py-1 rounded-full text-xs bg-gray-100 text-gray-800">{ROLE_LABELS[collectivityData?.role || "user"]}</span>
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
                <td className="px-6 py-4 text-sm"></td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
