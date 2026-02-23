import React, { useEffect, useState } from "react"
import { useParams, useNavigate } from "react-router-dom"
import toast from "react-hot-toast"
import { FiUser, FiShield, FiClock, FiEye, FiEyeOff, FiHome, FiX } from "react-icons/fi"
import useStore from "@/services/store"

import Modal from "@/components/modal"
import api from "@/services/api"

export default function View() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [user, setUser] = useState()
  const [activeTab, setActiveTab] = useState("info")
  const { collectivity } = useStore()
  const getUser = async () => {
    try {
      const { data, code, ok } = await api.get(`/user/${id}`)
      if (!ok) return toast.error(code || "Une erreur est survenue")
      setUser(data)
    } catch (e) {
      toast.error("Une erreur est survenue")
    }
  }

  useEffect(() => {
    getUser()
  }, [id])

  if (!user)
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg text-gray-600">Chargement...</div>
      </div>
    )

  return (
    <div className="w-full max-w-7xl mx-auto px-4 py-8">
      <div className="mb-6">
        <div className="flex items-center gap-2 text-sm text-gray-600 mb-2">
          <button onClick={() => navigate("/collectivity")} className="hover:text-primary-green transition-colors">
            Utilisateurs
          </button>
          <span>/</span>
          <span className="text-gray-900 font-medium truncate max-w-[150px]">{user.name}</span>
        </div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{user.name || "Détails de l'utilisateur"}</h1>
      </div>

      <div className="flex border-b border-gray-200 mb-6">
        <button
          className={`px-6 py-3 text-sm font-semibold transition-all flex items-center gap-2 ${
            activeTab === "info" ? "text-primary-green border-b-2 border-primary-green" : "text-gray-500 hover:text-primary-green"
          }`}
          onClick={() => setActiveTab("info")}
        >
          <FiUser size={16} />
          Informations
        </button>

        <button
          className={`px-6 py-3 text-sm font-semibold transition-all flex items-center gap-2 ${
            activeTab === "rights" ? "text-primary-green border-b-2 border-primary-green" : "text-gray-500 hover:text-primary-green"
          }`}
          onClick={() => setActiveTab("rights")}
        >
          <FiShield size={16} />
          Droits d'action
        </button>

        <button
          className={`px-6 py-3 text-sm font-semibold transition-all flex items-center gap-2 ${
            activeTab === "history" ? "text-primary-green border-b-2 border-primary-green" : "text-gray-500 hover:text-primary-green"
          }`}
          onClick={() => setActiveTab("history")}
        >
          <FiClock size={16} />
          Historique actions
        </button>
      </div>
      {activeTab === "info" && <UserInfoTab user={user} setUser={setUser} />}
      {activeTab === "rights" && <UserActionRightsSection user={user} />}
      {activeTab === "history" && <UserHistoryTab user={user} />}
    </div>
  )
}

function UserInfoTab({ user, setUser }) {
  const navigate = useNavigate()
  const { collectivity } = useStore()

  const [values, setValues] = useState({
    name: user?.name || "",
    email: user?.email || "",
    status: user.status || "",
    collectivityRole: user.collectivities?.find((c) => c.id === collectivity?._id).role || "user"
  })

  const onUpdate = async () => {
    try {
      const updatedCollectivities = user.collectivities.map((c) => (c.id === collectivity._id ? { ...c, role: values.collectivityRole } : c))
      const payload = { ...values, collectivities: updatedCollectivities }

      const { ok, data, code } = await api.put(`/user/${user._id}`, payload)
      if (!ok) return toast.error(code || "Une erreur est survenue")
      setUser(data)
      toast.success("Utilisateur mis à jour")
    } catch (e) {
      console.log(e)
      toast.error("Une erreur est survenue")
    }
  }

  const onDelete = async () => {
    try {
      if (!confirm("Êtes-vous sûr de vouloir supprimer cet utilisateur ?")) return
      const { ok, data, code } = await api.delete(`/user/${user._id}`)
      if (!ok) return toast.error(code || "Une erreur est survenue")
      toast.success("Utilisateur supprimé")
      navigate("/collectivity")
    } catch (e) {
      console.log(e)
      toast.error("Une erreur est survenue")
    }
  }

  const attachCollectivityToEconomicActor = async () => {
    try {
      if (!collectivity?._id || !user?.economic_actor_id) return
      if (user.collectivities?.find((c) => c.id === collectivity._id)?.role !== "economic_actor") return

      const { ok, data: economicActor, code } = await api.get(`/economic_actor/${user.economic_actor_id}`)
      if (!ok || !economicActor) return toast.error(code || "Une erreur est survenue")
      if (economicActor?.collectivities?.some((c) => c.id === collectivity._id)) return

      const payload = { collectivities: [...(economicActor?.collectivities || []), { id: collectivity._id, name: collectivity.name, joined_at: new Date() }] }
      const { ok: updateOk, code: updateCode } = await api.put(`/economic_actor/${economicActor._id}`, payload)
      if (!updateOk) return toast.error(updateCode || "Une erreur est survenue")
    } catch (e) {
      toast.error("Une erreur est survenue")
    }
  }

  const handleStatus = async (status) => {
    try {
      const updatedCollectivities = user.collectivities.map((c) => (c.id === collectivity._id ? { ...c, status } : c))
      const payload = { ...values, collectivities: updatedCollectivities }

      const { ok, data, code } = await api.put(`/user/${user._id}`, payload)
      if (!ok) return toast.error(code || "Une erreur est survenue")
      setUser(data)
      toast.success(`Utilisateur ${status === "approved" ? "approuvé" : "rejeté"}`)

      if (status === "approved") await attachCollectivityToEconomicActor()
    } catch (e) {
      console.log(e)
      toast.error("Une erreur est survenue")
    }
  }

  return (
    <div className="card-shadow">
      {/* En-tête + boutons (haut) */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Détails de l'utilisateur</h1>
          <p className="text-gray-500 mt-1">Gère les informations et les permissions de l'utilisateur.</p>
        </div>
      </div>

      {/* Informations générales */}
      <div className="pt-6 mt-6 border-t border-light-border">
        <h2 className="text-lg font-semibold mb-4">Informations générales</h2>

        {user.collectivities?.find((c) => c.id === collectivity._id)?.status === "pending" && (
          <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
            <div className="flex items-center justify-between">
              <span className="text-sm text-yellow-700">Demande en attente</span>
              <div className="flex gap-2">
                <button onClick={() => handleStatus("approved")} className="px-3 py-1 text-xs button-primary">
                  Approuver
                </button>
                <button onClick={() => handleStatus("rejected")} className="px-3 py-1 text-xs bg-red-500 text-white hover:bg-red-600 rounded">
                  Rejeter
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div className="w-full">
            <label className="block text-sm font-semibold mb-2">Nom</label>
            <input className="w-full input-primary" value={values.name} onChange={(e) => setValues({ ...values, name: e.target.value })} placeholder="Nom de l'utilisateur" />
          </div>

          <div className="w-full">
            <label className="block text-sm font-semibold mb-2">E-mail</label>
            <input className="w-full input-primary" value={values.email} onChange={(e) => setValues({ ...values, email: e.target.value })} placeholder="email@exemple.fr" />
          </div>

          <div className="w-full">
            <label className="block text-sm font-semibold mb-2">Statut</label>
            <select className="w-full input-primary" value={values.status || "active"} onChange={(e) => setValues({ ...values, status: e.target.value })}>
              <option value="active">Actif</option>
              <option value="inactive">Inactif</option>
            </select>
          </div>

          {collectivity && (
            <div className="w-full">
              <label className="block text-sm font-semibold mb-2">Rôle dans la collectivité</label>
              <select className="w-full input-primary" value={values.collectivityRole} onChange={(e) => setValues({ ...values, collectivityRole: e.target.value })}>
                <option value="user">Utilisateur</option>
                <option value="admin">Administrateur</option>
                <option value="economic_actor">Acteur économique</option>
              </select>
            </div>
          )}
        </div>

        {user.role === "admin" && (
          <div className="flex items-center justify-between pt-6 border-t border-gray-200">
            <ResetPassword user={user} />
          </div>
        )}
      </div>

      {/* Boutons bas (identiques) */}
      <div className="pt-6 mt-6 border-t border-light-border">
        <div className="flex justify-end gap-3">
          <button onClick={onDelete} className="button-primary bg-red-600">
            Supprimer
          </button>
          <button onClick={onUpdate} className="button-primary">
            Enregistrer
          </button>
        </div>
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

function UserActionRightsSection({ user }) {
  const [rights, setRights] = useState([])
  const [actions, setActions] = useState([])
  const [addOpen, setAddOpen] = useState(false)
  const [addValues, setAddValues] = useState({ user_id: "", user_name: "", action_id: "", description: "", can_read: true, can_write: false })
  const { collectivity } = useStore()

  const fetchAction = async () => {
    try {
      const { ok, data, code } = await api.post("/action/search", { collectivity_id: collectivity._id })
      if (!ok) return toast.error(code || "Une erreur est survenue")
      setActions(data)
    } catch (e) {
      console.log(e)
      toast.error("Une erreur est survenue")
    }
  }

  const fetchRight = async () => {
    try {
      const { ok, data, code } = await api.post("/user_action_right/search", { user_id: user._id })
      if (!ok) return toast.error(code || "Une erreur est survenue")
      setRights(data)
    } catch (e) {
      console.log(e)
      toast.error("Une erreur est survenue")
    }
  }

  useEffect(() => {
    fetchAction()
    fetchRight()
  }, [user])

  const onSaveRow = async (right) => {
    try {
      const { ok, code } = await api.put(`/user_action_right/${right._id}`, right)
      if (!ok) return toast.error(code || "Une erreur est survenue")
      toast.success("Droit mis à jour")
      await fetchRight()
    } catch (e) {
      console.log(e)
      toast.error("Une erreur est survenue")
    }
  }

  const onDeleteRow = async (right) => {
    try {
      if (!confirm("Êtes-vous sûr de vouloir supprimer ce droit ?")) return
      const { ok, code } = await api.delete(`/user_action_right/${right._id}`)
      if (!ok) return toast.error(code || "Une erreur est survenue")
      toast.success("Droit supprimé")
      await fetchRight()
    } catch (e) {
      console.log(e)
      toast.error("Une erreur est survenue")
    }
  }

  const handleAdd = async () => {
    try {
      if (!addValues.action_id) return toast.error("Veuillez sélectionner une action")
      const action = actions.find((a) => a._id === addValues.action_id)
      if (!action) return toast.error("Action introuvable")
      const payload = {
        user_id: user._id,
        user_name: user.name || "",
        collectivity_id: action.collectivity_id || "",
        collectivity_name: action.collectivity_name || "",
        action_id: action._id,
        action_name: action.name || "",
        description: addValues.description || "",
        can_read: !!addValues.can_read,
        can_write: !!addValues.can_write
      }

      const { ok, code } = await api.post("/user_action_right", payload)
      if (!ok) return toast.error(code || "Une erreur est survenue")
      setAddOpen(false)
      setAddValues({ user_id: user._id, user_name: user.name || "", action_id: "", description: "", can_read: true, can_write: false })
      await fetchRight()
      toast.success("Droit ajouté avec succès")
    } catch (e) {
      console.log(e)
      toast.error("Une erreur est survenue")
    }
  }

  if (!user) return null

  const userCollectivityRole = user.collectivities?.find((c) => c.id === collectivity?._id)?.role

  if (userCollectivityRole === "admin" || user.role === "admin")
    return (
      <div className="card-shadow">
        <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-400">
          <FiShield className="mx-auto h-12 w-12 text-gray-400" />
          <p className="mt-2 text-sm text-gray-600">Cet utilisateur est administrateur. Tous les droits d'action sont accordés</p>
        </div>
      </div>
    )

  if (userCollectivityRole === "economic_actor")
    return (
      <div className="card-shadow">
        <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-400">
          <FiHome className="mx-auto h-12 w-12 text-gray-400" />
          <p className="mt-2 text-sm text-gray-600">Cet utilisateur est acteur économique. Les droits d'action ne s'appliquent pas à ce rôle</p>
        </div>
      </div>
    )
  return (
    <div className="card-shadow">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Droits d'action</h2>
          <p className="text-sm text-gray-600 mt-1">Gérer les permissions d'accès aux actions</p>
        </div>
        <button className="button-primary" onClick={() => setAddOpen(true)}>
          Ajouter un droit
        </button>
      </div>

      {rights.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
          <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          <p className="mt-2 text-sm text-gray-600">Aucun droit d'action défini</p>
          <p className="text-xs text-gray-500 mt-1">Cliquez sur "Ajouter un droit" pour commencer</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Collectivité</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Action</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Description</th>
                <th className="px-6 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider">Lire</th>
                <th className="px-6 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider">Écrire</th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {rights.map((r, idx) => (
                <tr key={r._id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 text-sm text-gray-900 font-medium">{r.collectivity_name || r.collectivity_id}</td>
                  <td className="px-6 py-4 text-sm text-gray-700">{r.action_name || r.action_id}</td>
                  <td className="px-6 py-4 text-sm">
                    <input
                      className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all text-sm"
                      value={r.description || ""}
                      onChange={(e) => {
                        const copy = [...rights]
                        copy[idx] = { ...copy[idx], description: e.target.value }
                        setRights(copy)
                      }}
                      placeholder="Ajouter une description"
                    />
                  </td>
                  <td className="px-6 py-4 text-center">
                    <input
                      type="checkbox"
                      checked={!!r.can_read}
                      onChange={() => {
                        const copy = [...rights]
                        copy[idx] = { ...copy[idx], can_read: !copy[idx].can_read }
                        setRights(copy)
                      }}
                      className="w-4 h-4 input-primary"
                    />
                  </td>
                  <td className="px-6 py-4 text-center">
                    <input
                      type="checkbox"
                      checked={!!r.can_write}
                      onChange={() => {
                        const copy = [...rights]
                        const newCanWrite = !copy[idx].can_write
                        copy[idx] = { ...copy[idx], can_write: newCanWrite, can_read: newCanWrite ? true : copy[idx].can_read }
                        setRights(copy)
                      }}
                      className="w-4 h-4 input-primary"
                    />
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button className="button-primary px-3 py-1.5 text-xs" onClick={() => onSaveRow(r)}>
                        Enregistrer
                      </button>
                      <button className="button-primary bg-red-600 px-3 py-1.5 text-xs" onClick={() => onDeleteRow(r)}>
                        Supprimer
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal isOpen={addOpen} onClose={() => setAddOpen(false)} className="max-w-lg">
        <div className="p-6">
          <h3 className="text-xl font-semibold mb-6">Ajouter un droit</h3>

          <div className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Action</label>
              <select className="w-full input-primary" value={addValues.action_id} onChange={(e) => setAddValues({ ...addValues, action_id: e.target.value })}>
                <option value="">Sélectionner une action</option>
                {actions.map((a) => (
                  <option key={a._id} value={a._id}>
                    {a.name} {a.collectivity_name ? `— ${a.collectivity_name}` : ""}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
              <input
                className="w-full input-primary"
                value={addValues.description}
                onChange={(e) => setAddValues({ ...addValues, description: e.target.value })}
                placeholder="Description optionnelle"
              />
            </div>

            <div className="mb-3">
              <p className="text-sm font-medium text-gray-700 mb-3">Permissions</p>
              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={addValues.can_read}
                    onChange={() => setAddValues({ ...addValues, can_read: !addValues.can_read })}
                    className="w-4 h-4 input-primary"
                  />
                  <span className="text-sm text-gray-700">Lire</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={addValues.can_write}
                    onChange={() => {
                      const newCanWrite = !addValues.can_write
                      setAddValues({
                        ...addValues,
                        can_write: newCanWrite,
                        can_read: newCanWrite ? true : addValues.can_read // Si on coche "écrire", on coche automatiquement "lire"
                      })
                    }}
                    className="w-4 h-4 input-primary"
                  />
                  <span className="text-sm text-gray-700">Écrire</span>
                </label>
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <button className="button-primary" onClick={handleAdd}>
              Ajouter
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

function UserHistoryTab({ user }) {
  return (
    <div className="card-shadow">
      <h2 className="text-xl font-semibold text-gray-900">Historique actions</h2>
      <p className="text-sm text-gray-600 mt-1">Historique des actions effectuées par l'utilisateur</p>
    </div>
  )
}
