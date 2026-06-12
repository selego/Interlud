// app/src/scenes/super_admin/users/view.jsx
import React, { useEffect, useState } from "react"
import { useParams, useNavigate } from "react-router-dom"
import toast from "react-hot-toast"
import { FiUser, FiShield, FiClock, FiEye, FiEyeOff, FiHome, FiX, FiArrowLeft, FiSend } from "react-icons/fi"

import Modal from "@/components/modal"
import api from "@/services/api"
import Select from "@/components/Select"

export default function View() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [user, setUser] = useState()
  const [activeTab, setActiveTab] = useState("info")

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
          <button onClick={() => navigate("/admin/users")} className="hover:text-primary-green transition-colors">
            Utilisateurs
          </button>
          <span>/</span>
          <span className="text-gray-900 font-medium truncate max-w-[150px]">{user.name}</span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="p-2 rounded-full hover:bg-gray-100 text-gray-600 hover:text-primary-green transition-colors"
            aria-label="Revenir à la page précédente"
          >
            <FiArrowLeft size={18} />
          </button>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{user.name || "Détails de l'utilisateur"}</h1>
        </div>
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
            activeTab === "collectivities" ? "text-primary-green border-b-2 border-primary-green" : "text-gray-500 hover:text-primary-green"
          }`}
          onClick={() => setActiveTab("collectivities")}
        >
          <FiHome size={16} />
          Collectivités
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
      {activeTab === "collectivities" && <UserCollectivitiesTab user={user} setUser={setUser} />}
    </div>
  )
}

function UserInfoTab({ user, setUser }) {
  const navigate = useNavigate()
  const [modalOpen, setModalOpen] = useState(false)

  const onUpdate = async () => {
    try {
      if (user.role === "economic_actor" && !user.economic_actor_id) return toast.error("Veuillez sélectionner un acteur économique")

      const payload = {
        ...user,
        economic_actor_id: user.economic_actor_id,
        economic_actor_name: user.economic_actor_name,
        collectivities: user.collectivities
      }

      if (user.role !== "economic_actor") {
        payload.economic_actor_id = null
        payload.economic_actor_name = null
      }

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
      navigate("/admin/users")
    } catch (e) {
      console.log(e)
      toast.error("Une erreur est survenue")
    }
  }

  return (
    <div className="card-shadow">
      <h2 className="text-xl font-semibold text-gray-900 mb-6">Informations générales</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div className="w-full">
          <label className="block text-sm font-medium text-gray-700 mb-2">Nom</label>
          <input className="w-full input-primary" value={user.name} onChange={(e) => setUser({ ...user, name: e.target.value })} placeholder="Nom de l'utilisateur" />
        </div>

        <div className="w-full">
          <label className="block text-sm font-medium text-gray-700 mb-2">E-mail</label>
          <input className="w-full input-primary" value={user.email} onChange={(e) => setUser({ ...user, email: e.target.value })} placeholder="email@exemple.fr" />
        </div>

        <div className="w-full">
          <label className="block text-sm font-medium text-gray-700 mb-2">Rôle</label>
          <Select
            value={user.role}
            onChange={(value) => setUser({ ...user, role: value })}
            options={[
              { value: "admin", label: "Admin" },
              { value: "user", label: "User" },
              { value: "economic_actor", label: "Acteur économique" }
            ]}
          />
        </div>

        <div className="w-full">
          <label className="block text-sm font-medium text-gray-700 mb-2">Statut</label>
          <Select
            value={user.status || "active"}
            onChange={(value) => setUser({ ...user, status: value })}
            options={[
              { value: "active", label: "Actif" },
              { value: "inactive", label: "Inactif" }
            ]}
          />
        </div>

        {user.role === "economic_actor" && (
          <div className="w-full md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-2">Acteur économique</label>
            {user.economic_actor_id ? (
              <div className="flex items-center justify-between p-4 bg-deco-background-green border border-secondary-green rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-primary-green rounded-full flex items-center justify-center">
                    <FiUser className="text-white" size={18} />
                  </div>
                  <div>
                    <h3 className="font-medium text-gray-900">{user.economic_actor_name}</h3>
                    <p className="text-xs text-gray-600">Acteur économique associé</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setModalOpen(true)}
                    className="px-3 py-1.5 text-sm text-primary-green hover:bg-primary-green hover:text-white rounded-lg transition-colors"
                  >
                    Changer
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-center py-8 bg-amber-50 border-2 border-amber-200 border-dashed rounded-lg">
                <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-3">
                  <FiUser className="text-amber-600" size={24} />
                </div>
                <p className="text-sm text-gray-600 mb-3">Aucun acteur économique associé</p>
                <button onClick={() => setModalOpen(true)} className="button-primary">
                  Ajouter un acteur économique
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between pt-6 border-t border-gray-200">
        <div className="flex items-center gap-3">
          {user.role === "admin" && <ResetPassword user={user} />}
          {!user.last_login_at && <InviteButton user={user} />}
        </div>
        <div className="flex items-center gap-3">
          <button
            className="button-primary"
            onClick={onUpdate}
            disabled={user.role === "economic_actor" && !user.economic_actor_id}
            title={user.role === "economic_actor" && !user.economic_actor_id ? "Veuillez sélectionner un acteur économique" : ""}
          >
            Enregistrer
          </button>
          <button className="button-primary bg-red-600" onClick={onDelete}>
            Supprimer
          </button>
        </div>
      </div>

      <SelectEconomicActorModal isOpen={modalOpen} onClose={() => setModalOpen(false)} user={user} setUser={setUser} />
    </div>
  )
}

function SelectEconomicActorModal({ isOpen, onClose, user, setUser }) {
  const [searchValue, setSearchValue] = useState("")
  const [searchResults, setSearchResults] = useState([])
  const [searching, setSearching] = useState(false)

  const searchEconomicActors = async (search) => {
    if (!search || search.trim().length < 2) return setSearchResults([])

    try {
      setSearching(true)
      const { ok, data, code } = await api.post("/economic_actor/search", { search })
      if (!ok) {
        toast.error(code || "Une erreur est survenue")
        return
      }
      setSearchResults(data)
    } catch (e) {
      console.log(e)
      toast.error("Une erreur est survenue")
    } finally {
      setSearching(false)
    }
  }

  const handleClose = () => {
    setSearchValue("")
    setSearchResults([])
    onClose()
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      searchEconomicActors(searchValue)
    }, 300)

    return () => clearTimeout(timer)
  }, [searchValue])

  return (
    <Modal isOpen={isOpen} className="max-w-2xl" onClose={handleClose}>
      <div className="p-6">
        <h3 className="text-xl font-semibold text-gray-900 mb-6">Sélectionner un acteur économique</h3>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">Rechercher un acteur économique</label>
          <input type="text" className="w-full input-primary" placeholder="Entrez un nom..." value={searchValue} onChange={(e) => setSearchValue(e.target.value)} />
        </div>

        {searching && (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-green"></div>
          </div>
        )}

        {!searching && searchResults.length > 0 && (
          <div className="border border-gray-200 rounded-lg overflow-hidden max-h-96 overflow-y-auto">
            <table className="w-full">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">Nom</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">Collectivités</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {searchResults.map((actor) => (
                  <tr key={actor._id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{actor.name}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{actor.collectivities?.length || 0} collectivités</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        className="px-3 py-1 bg-primary-green text-white text-sm rounded-lg hover:bg-primary-green/90 transition-colors"
                        onClick={() => {
                          setUser({
                            ...user,
                            economic_actor_id: actor._id,
                            economic_actor_name: actor.name,
                            collectivities: (actor.collectivities || []).map((col) => ({
                              id: col.id,
                              name: col.name,
                              role: "economic_actor",
                              status: "approved"
                            }))
                          })
                          toast.success("Acteur économique sélectionné. N'oubliez pas d'enregistrer.")
                          handleClose()
                        }}
                      >
                        Sélectionner
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!searching && searchValue.length >= 2 && searchResults.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            <p className="text-sm">Aucun acteur économique trouvé</p>
          </div>
        )}

        {!searching && searchValue.length < 2 && searchValue.length > 0 && (
          <div className="text-center py-8 text-gray-500">
            <p className="text-sm">Entrez au moins 2 caractères pour rechercher</p>
          </div>
        )}
      </div>
    </Modal>
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

function InviteButton({ user }) {
  const [loading, setLoading] = useState(false)

  const handleInvite = async () => {
    try {
      setLoading(true)
      const { ok, code } = await api.post(`/user/send-invite/${user._id}`)
      if (!ok) return toast.error(code || "Une erreur est survenue")
      toast.success("Invitation envoyée avec succès !")
    } catch (error) {
      console.log(error)
      toast.error("Une erreur est survenue")
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      className="px-6 py-2.5 bg-blue-100 hover:bg-blue-200 text-blue-700 font-medium rounded-lg transition-colors flex items-center gap-2"
      onClick={handleInvite}
      disabled={loading}
    >
      <FiSend size={16} />
      {loading ? "Envoi en cours..." : "Envoyer une invitation"}
    </button>
  )
}

function UserActionRightsSection({ user }) {
  const [rights, setRights] = useState([])
  const [actions, setActions] = useState([])
  const [addOpen, setAddOpen] = useState(false)
  const [addValues, setAddValues] = useState({ user_id: "", user_name: "", action_id: "", description: "", can_read: true, can_write: false })

  const fetchAction = async () => {
    try {
      const { ok, data, code } = await api.post("/action/search", { collectivity_ids: (user.collectivities || []).map((c) => c.id) })
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
    } catch (e) {
      console.log(e)
      toast.error("Une erreur est survenue")
    }
  }

  if (!user) return null

  if (user.role === "admin") {
    return (
      <div className="card-shadow">
        <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-400">
          <FiShield className="mx-auto h-12 w-12 text-gray-400" />
          <p className="mt-2 text-sm text-gray-600">Cet utilisateur est administrateur global. Tous les droits d'action sont accordés</p>
        </div>
      </div>
    )
  }

  if (user.role === "economic_actor") {
    return (
      <div className="card-shadow">
        <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-400">
          <FiHome className="mx-auto h-12 w-12 text-gray-400" />
          <p className="mt-2 text-sm text-gray-600">Cet utilisateur est acteur économique. Les droits d'action ne s'appliquent pas à ce rôle</p>
        </div>
      </div>
    )
  }

  if (rights.length === 0) {
    ;<div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
      <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
        />
      </svg>
      <p className="mt-2 text-sm text-gray-600">Aucun droit d'action défini</p>
    </div>
  }

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
                  <div className="relative inline-block" title={r.can_write ? "La lecture est requise lorsque l'écriture est activée" : ""}>
                    <input
                      type="checkbox"
                      checked={!!r.can_read}
                      disabled={!!r.can_write}
                      onChange={() => {
                        const copy = [...rights]
                        copy[idx] = { ...copy[idx], can_read: !copy[idx].can_read }
                        setRights(copy)
                      }}
                      className="w-4 h-4 input-primary"
                    />
                  </div>
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
                    <button className="button-primary" onClick={() => onSaveRow(r)}>
                      Enregistrer
                    </button>
                    <button className="button-primary bg-red-600" onClick={() => onDeleteRow(r)}>
                      Supprimer
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal isOpen={addOpen} onClose={() => setAddOpen(false)} className="max-w-lg">
        <div className="p-6">
          <h3 className="text-xl font-semibold mb-6">Ajouter un droit</h3>

          <div className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Action</label>
              <Select
                value={addValues.action_id}
                onChange={(value) => setAddValues({ ...addValues, action_id: value })}
                options={[
                  { value: "", label: "Sélectionner une action" },
                  ...[...actions]
                    .sort((a, b) => (a.collectivity_name || "").localeCompare(b.collectivity_name || "") || (a.name || "").localeCompare(b.name || ""))
                    .map((a) => ({
                      value: a._id,
                      label: a.name,
                      group: a.collectivity_name || "Sans collectivité"
                    }))
                ]}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
              <input
                className="w-full input-primary"
                value={addValues.description}
                onChange={(e) => setAddValues({ ...addValues, description: e.target.value })}
                placeholder="Ex : Accès temporaire, suivi campagne 2025…"
              />
            </div>

            <div className="mb-3">
              <p className="text-sm font-medium text-gray-700 mb-3">Permissions</p>
              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2 cursor-pointer" title={addValues.can_write ? "La lecture est requise lorsque l'écriture est activée" : ""}>
                  <input
                    type="checkbox"
                    checked={addValues.can_read}
                    disabled={addValues.can_write}
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
                        can_read: newCanWrite ? true : addValues.can_read,
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

function UserCollectivitiesTab({ user, setUser }) {
  const [addOpen, setAddOpen] = useState(false)
  const [addValues, setAddValues] = useState({ collectivity_id: "", collectivity_name: "", role: "user" })
  const [search, setSearch] = useState("")
  const [searchResults, setSearchResults] = useState([])
  const [searching, setSearching] = useState(false)

  const searchCollectivities = async () => {
    try {
      setSearching(true)
      const { ok, data, code } = await api.post("/collectivity/search", { search })
      if (!ok) return toast.error(code || "Une erreur est survenue")
      setSearchResults(data)
    } catch (e) {
      console.log(e)
      toast.error("Une erreur est survenue")
    } finally {
      setSearching(false)
    }
  }

  useEffect(() => {
    if (!addOpen) return
    const timer = setTimeout(searchCollectivities, 300)
    return () => clearTimeout(timer)
  }, [search, addOpen])

  const addCollectivity = async () => {
    if (!addValues.collectivity_id) return toast.error("Sélectionnez une collectivité")

    const exists = (user?.collectivities || []).some((x) => x.id === addValues.collectivity_id)
    if (exists) return toast.error("Cette collectivité est déjà associée")
    const updated = [...(user?.collectivities || []), { id: addValues.collectivity_id, name: addValues.collectivity_name, role: addValues.role, status: "approved" }]

    try {
      const { ok, data, code } = await api.put(`/user/${user._id}`, { collectivities: updated })
      if (!ok) return toast.error(code || "Une erreur est survenue")
      setUser(data)
      setAddOpen(false)
      setAddValues({ collectivity_id: "", collectivity_name: "", role: "user" })
      setSearch("")
      setSearchResults([])
      toast.success("Collectivité ajoutée avec succès")
    } catch (e) {
      console.log(e)
      toast.error("Une erreur est survenue")
    }
  }

  const updateCollectivityRole = async (collectivityId, newRole) => {
    const updated = (user?.collectivities || []).map((c) => (c.id === collectivityId ? { ...c, role: newRole } : c))

    try {
      const { ok, data, code } = await api.put(`/user/${user._id}`, { collectivities: updated })
      if (!ok) return toast.error(code || "Une erreur est survenue")
      setUser(data)
      toast.success("Rôle mis à jour")
    } catch (e) {
      console.log(e)
      toast.error("Une erreur est survenue")
    }
  }

  const removeCollectivity = async (idToRemove) => {
    if (!confirm("Êtes-vous sûr de vouloir retirer cette collectivité ?")) return
    const updated = (user?.collectivities || []).filter((x) => x.id !== idToRemove)

    try {
      const { ok, data, code } = await api.put(`/user/${user._id}`, { collectivities: updated })
      if (!ok) return toast.error(code || "Une erreur est survenue")
      setUser(data)
      toast.success("Collectivité retirée avec succès")
    } catch (e) {
      console.log(e)
      toast.error("Une erreur est survenue")
    }
  }

  if (user.role === "admin") {
    return (
      <div className="card-shadow">
        <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
          <FiShield className="mx-auto h-12 w-12 text-gray-400" />
          <p className="mt-2 text-sm text-gray-600">Cet utilisateur est administrateur global. Il a accès à toutes les collectivités en rôle admin</p>
        </div>
      </div>
    )
  }

  if (user.role === "economic_actor") {
    return (
      <div className="card-shadow">
        <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-400">
          <FiHome className="mx-auto h-12 w-12 text-gray-400" />
          <p className="mt-2 text-sm text-gray-600">Cet utilisateur est acteur économique. Ses collectivités sont gérées via son acteur économique associé</p>
        </div>
      </div>
    )
  }

  return (
    <div className="card-shadow">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Collectivités & Rôles</h2>
          <p className="text-sm text-gray-600 mt-1">Gérer les collectivités associées et leurs rôles</p>
        </div>
        <button className="button-primary" onClick={() => setAddOpen(true)}>
          Ajouter une collectivité
        </button>
      </div>

      {user?.collectivities && user.collectivities.length > 0 ? (
        <div className="space-y-4">
          {user.collectivities.map((collectivity) => (
            <div key={collectivity.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-primary-green/10 rounded-full flex items-center justify-center">
                  <FiHome className="text-blue-600" size={18} />
                </div>
                <div>
                  <h3 className="font-medium text-gray-900">{collectivity.name}</h3>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Select
                  value={collectivity.role || "user"}
                  onChange={(value) => updateCollectivityRole(collectivity.id, value)}
                  options={[
                    { value: "user", label: "Utilisateur" },
                    { value: "admin", label: "Administrateur" },
                    { value: "economic_actor", label: "Acteur économique" }
                  ]}
                />

                <button
                  className="p-2 text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
                  onClick={() => removeCollectivity(collectivity.id)}
                  title="Retirer cette collectivité"
                >
                  <FiX size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
          <FiHome className="mx-auto h-12 w-12 text-gray-400" />
          <p className="mt-2 text-sm text-gray-600">Aucune collectivité associée</p>
          <p className="text-xs text-gray-500 mt-1">Cliquez sur "Ajouter une collectivité" pour commencer</p>
        </div>
      )}

      <Modal isOpen={addOpen} className="max-w-lg" onClose={() => setAddOpen(false)}>
        <div className="p-6">
          <h3 className="text-xl font-semibold text-gray-900 mb-6">Ajouter une collectivité</h3>

          <div className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Collectivité</label>
              <input
                type="text"
                className="w-full input-primary"
                placeholder="Rechercher une collectivité..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />

              {searching && (
                <div className="flex items-center justify-center py-6">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-green"></div>
                </div>
              )}

              {!searching && (
                <div className="mt-2 border border-gray-200 rounded-lg overflow-hidden max-h-60 overflow-y-auto">
                  {searchResults.filter((c) => !user?.collectivities?.some((uc) => uc.id === c._id)).length === 0 ? (
                    <div className="px-4 py-6 text-center text-sm text-gray-500">Aucune collectivité trouvée</div>
                  ) : (
                    searchResults
                      .filter((c) => !user?.collectivities?.some((uc) => uc.id === c._id))
                      .map((c) => (
                        <button
                          key={c._id}
                          type="button"
                          onClick={() => setAddValues({ ...addValues, collectivity_id: c._id, collectivity_name: c.name })}
                          className={`w-full text-left px-4 py-3 text-sm transition-colors hover:bg-gray-50 ${
                            addValues.collectivity_id === c._id ? "bg-primary-green/10 text-primary-green font-medium" : "text-gray-900"
                          }`}
                        >
                          {c.name}
                        </button>
                      ))
                  )}
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Rôle dans cette collectivité</label>
              <Select
                value={addValues.role}
                onChange={(value) => setAddValues({ ...addValues, role: value })}
                options={[
                  { value: "user", label: "Utilisateur" },
                  { value: "admin", label: "Administrateur" }
                ]}
              />
            </div>
          </div>

          <div className="flex justify-end">
            <button className="button-primary" onClick={addCollectivity}>
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
