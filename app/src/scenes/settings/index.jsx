import React, { useState, useEffect } from "react"
import toast from "react-hot-toast"
import { FiEye, FiEyeOff, FiHome, FiShield, FiUser } from "react-icons/fi"

import api from "@/services/api"
import useStore from "@/services/store"
import Modal from "@/components/modal"

export default function Settings() {
  const { user } = useStore()
  const [activeTab, setActiveTab] = useState("profile")

  return (
    <div className="w-full max-w-7xl mx-auto px-4 py-8">
      <div className="flex border-b border-gray-200 mb-6">
        <button
          className={`px-6 py-3 text-sm font-semibold transition-all flex items-center gap-2 ${
            activeTab === "profile" ? "text-primary-green border-b-2 border-primary-green" : "text-gray-500 hover:text-primary-green"
          }`}
          onClick={() => setActiveTab("profile")}
        >
          <FiUser size={16} />
          Profil
        </button>

        <button
          className={`px-6 py-3 text-sm font-semibold transition-all flex items-center gap-2 ${
            activeTab === "rights" ? "text-primary-green border-b-2 border-primary-green" : "text-gray-500 hover:text-primary-green"
          }`}
          onClick={() => setActiveTab("rights")}
        >
          <FiShield size={16} />
          Droits d'accès
        </button>
      </div>

      {activeTab === "profile" && <ProfileTab user={user} />}
      {activeTab === "rights" && <RightsTab user={user} />}
    </div>
  )
}

function ProfileTab({ user }) {
  const [values, setValues] = useState({ email: user?.email || "", name: user?.name || "" })
  const { setUser } = useStore()

  const updateUser = async () => {
    try {
      const { ok, data, code } = await api.put("/user", values)
      if (!ok) return toast.error(code || "Erreur lors de la mise à jour des informations")
      setUser(data)
      toast.success("Informations mises à jour avec succès")
    } catch (error) {
      console.error("Error updating user:", error)
      toast.error("Erreur lors de la mise à jour des informations")
    }
  }

  return (
    <div className="card-shadow">
      <h2 className="text-xl font-semibold text-gray-900 mb-6">Informations personnelles</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div className="w-full">
          <label className="block text-sm font-medium text-gray-700 mb-2">Nom</label>
          <input className="w-full input-primary" value={values.name} onChange={(e) => setValues({ ...values, name: e.target.value })} placeholder="Nom de l'utilisateur" />
        </div>

        <div className="w-full">
          <label className="block text-sm font-medium text-gray-700 mb-2">E-mail</label>
          <input className="w-full input-primary" value={values.email} onChange={(e) => setValues({ ...values, email: e.target.value })} placeholder="email@exemple.fr" />
        </div>
      </div>

      <div className="flex items-center justify-between pt-6 border-t border-gray-200">
        <ResetPassword user={user} />
        <button className="button-primary" onClick={updateUser}>
          Enregistrer
        </button>
      </div>
    </div>
  )
}
function RightsTab({ user }) {
  const [userActionRights, setUserActionRights] = useState([])

  const fetchUserActionRights = async () => {
    try {
      const { ok, data, code } = await api.post("/user_action_right/search", { user_id: user._id })
      if (!ok) return toast.error(code || "Erreur lors de la récupération des droits")
      setUserActionRights(data)
    } catch (error) {
      console.error("Error fetching user action rights:", error)
      toast.error("Erreur lors de la récupération des droits")
    }
  }

  useEffect(() => {
    if (user) fetchUserActionRights()
  }, [user])

  if (user.role === "admin") {
    return (
      <div className="card-shadow">
        <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
          <FiShield className="mx-auto h-12 w-12 text-gray-400" />
          <p className="mt-2 text-sm text-gray-600">Vous êtes administrateur global. Tous les droits d'action sont accordés</p>
        </div>
      </div>
    )
  }

  if (user.role === "economic_actor") {
    return (
      <div className="card-shadow">
        <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
          <FiShield className="mx-auto h-12 w-12 text-gray-400" />
          <p className="text-sm text-gray-600 mx-20 mt-2">
            Vous êtes <span className="font-semibold text-primary-green">acteur économique</span>
            <br />
            <br />
            <span className="text-sm text-gray-600">
              Vous pouvez visualiser et compléter les informations pour votre structure. Les données que vous renseignez ne sont visibles que par vous et ne concernent que votre
              organisation.
            </span>
          </p>
        </div>
      </div>
    )
  }

  if (user.collectivities && user.collectivities.length === 0) {
    return (
      <div className="card-shadow">
        <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
          <FiShield className="mx-auto h-12 w-12 text-gray-400" />
          <p className="mt-2 text-sm text-gray-600">Vous n'avez accès à aucune collectivité</p>
        </div>
      </div>
    )
  }

  return (
    <div className="card-shadow">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Mes droits d'action</h2>
          <p className="text-sm text-gray-600 mt-1">Droits d'accès aux actions par collectivité</p>
        </div>
      </div>
      <div className="space-y-6">
        {user.collectivities.map((collectivity) => (
          <div key={collectivity.id} className="border border-gray-200 rounded-lg">
            <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-primary-green/10 rounded-full flex items-center justify-center">
                    <FiHome className="text-primary-green" size={16} />
                  </div>
                  <div>
                    <h4 className="font-medium text-gray-900">{collectivity.name}</h4>
                    <p className="text-sm text-gray-600">
                      {collectivity.role === "admin" ? "Toutes les actions" : `${userActionRights.filter((right) => right.collectivity_id === collectivity.id).length} action(s)`}
                    </p>
                  </div>
                </div>
                <div className={`px-3 py-1 rounded-full text-xs font-medium ${collectivity.role === "admin" ? "bg-green-100 text-green-800" : "bg-blue-100 text-blue-800"}`}>
                  {collectivity.role === "admin" ? "Administrateur" : "Utilisateur"}
                </div>
              </div>
            </div>

            {collectivity.role === "admin" ? (
              <div className="p-4 text-center">
                <div className="flex items-center justify-center gap-2 text-green-600">
                  <FiShield size={16} />
                  <span className="text-sm font-medium">Tous les droits accordés</span>
                </div>
              </div>
            ) : (
              <div className="divide-y divide-gray-200">
                {userActionRights?.length > 0 &&
                  userActionRights
                    .filter((right) => right.collectivity_id === collectivity.id)
                    .map((right) => (
                      <div key={right._id} className="p-4">
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                          <div className="md:col-span-2">
                            <h5 className="font-medium text-gray-900">{right.action_name}</h5>
                            <p className="text-sm text-gray-600">{right.description || "Aucune description"}</p>
                          </div>

                          <div className="flex items-center justify-center">
                            <div
                              className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${
                                right.can_read ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
                              }`}
                            >
                              <FiEye className="mr-1" size={12} />
                              Lecture: {right.can_read ? "Oui" : "Non"}
                            </div>
                          </div>

                          <div className="flex items-center justify-center">
                            <div
                              className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${
                                right.can_write ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
                              }`}
                            >
                              <FiShield className="mr-1" size={12} />
                              Écriture: {right.can_write ? "Oui" : "Non"}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function ResetPassword({ user }) {
  const [open, setOpen] = useState(false)
  const [values, setValues] = useState({ newPassword: "", verifyPassword: "" })
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showVerifyPassword, setShowVerifyPassword] = useState(false)

  const resetPasswordHandle = async () => {
    if (values.newPassword !== values.verifyPassword) return toast.error("Les mots de passe ne correspondent pas")
    if (values.newPassword.length < 6) return toast.error("Le mot de passe doit contenir au moins 6 caractères")
    try {
      const { ok, message } = await api.post(`/user/reset_password/${user._id}`, values)
      if (!ok) return toast.error(message || "Erreur lors de la mise à jour du mot de passe")
      setOpen(false)
      toast.success("Mot de passe mis à jour avec succès !")
      setValues({ newPassword: "", verifyPassword: "" })
    } catch (error) {
      toast.error(error.message || "Une erreur est survenue")
    }
  }

  return (
    <>
      <button className="px-6 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-lg transition-colors" onClick={() => setOpen(true)}>
        Réinitialiser le mot de passe
      </button>

      <Modal isOpen={open} className="max-w-lg" onClose={() => setOpen(false)}>
        <div className="p-6">
          <h3 className="text-xl font-semibold text-gray-900 mb-6">Réinitialiser le mot de passe</h3>

          <div className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Nouveau mot de passe</label>
              <div className="relative">
                <input
                  className="w-full input-primary"
                  type={showNewPassword ? "text" : "password"}
                  placeholder="Entrer le nouveau mot de passe"
                  value={values.newPassword}
                  onChange={(e) => setValues({ ...values, newPassword: e.target.value })}
                />
                <button type="button" className="absolute top-1/2 -translate-y-1/2 right-3 text-gray-400 hover:text-gray-600" onClick={() => setShowNewPassword(!showNewPassword)}>
                  {showNewPassword ? <FiEyeOff size={18} /> : <FiEye size={18} />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Confirmer le mot de passe</label>
              <div className="relative">
                <input
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all pr-10"
                  type={showVerifyPassword ? "text" : "password"}
                  placeholder="Confirmer le nouveau mot de passe"
                  value={values.verifyPassword}
                  onChange={(e) => setValues({ ...values, verifyPassword: e.target.value })}
                />
                <button
                  type="button"
                  className="absolute top-1/2 -translate-y-1/2 right-3 text-gray-400 hover:text-gray-600"
                  onClick={() => setShowVerifyPassword(!showVerifyPassword)}
                >
                  {showVerifyPassword ? <FiEyeOff size={18} /> : <FiEye size={18} />}
                </button>
              </div>
            </div>
          </div>

          <div className="flex justify-end mt-2">
            <button className="button-primary" disabled={!values.newPassword || !values.verifyPassword} onClick={resetPasswordHandle}>
              Réinitialiser
            </button>
          </div>
        </div>
      </Modal>
    </>
  )
}
