import React, { useState, useEffect } from "react"
import { useParams, useNavigate } from "react-router-dom"
import { FiUser, FiHome, FiUsers, FiArrowLeft, FiX } from "react-icons/fi"
import api from "@/services/api"
import toast from "react-hot-toast"
import Modal from "@/components/modal"
import Select from "@/components/Select"

export default function View() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [economicActor, setEconomicActor] = useState(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState("info")

  const fetchEconomicActor = async () => {
    try {
      setLoading(true)
      const { data, ok, code } = await api.get(`/economic_actor/${id}`)
      if (!ok) {
        toast.error(code || "Une erreur est survenue")
        navigate("/admin/economic-actors")
        return
      }
      setEconomicActor(data)
    } catch (error) {
      toast.error(error || "Une erreur est survenue")
      navigate("/admin/economic-actors")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchEconomicActor()
  }, [id])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-green"></div>
      </div>
    )
  }

  if (!economicActor) return null

  return (
    <div className="w-full max-w-7xl mx-auto px-4 py-8">
      <div className="mb-6">
        <div className="flex items-center gap-2 text-sm text-gray-600 mb-2">
          <button onClick={() => navigate("/admin/economic-actors")} className="hover:text-primary-green transition-colors">
            Acteurs économiques
          </button>
          <span>/</span>
          <span className="text-gray-900 font-medium truncate max-w-[150px]">{economicActor.name}</span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="p-2 rounded-full hover:bg-gray-100 text-gray-600 hover:text-primary-green transition-colors"
            aria-label="Revenir à la page précédente"
          >
            <FiArrowLeft size={18} />
          </button>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{economicActor.name || "Détails de l'acteur économique"}</h1>
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
            activeTab === "users" ? "text-primary-green border-b-2 border-primary-green" : "text-gray-500 hover:text-primary-green"
          }`}
          onClick={() => setActiveTab("users")}
        >
          <FiUsers size={16} />
          Utilisateurs
        </button>
      </div>

      {activeTab === "info" && <InfoTab economicActor={economicActor} setEconomicActor={setEconomicActor} />}
      {activeTab === "collectivities" && <CollectivitiesTab economicActor={economicActor} setEconomicActor={setEconomicActor} />}
      {activeTab === "users" && <UsersTab economicActor={economicActor} />}
    </div>
  )
}

function InfoTab({ economicActor, setEconomicActor }) {
  const navigate = useNavigate()
  const [values, setValues] = useState({
    name: economicActor?.name || "",
    description: economicActor?.description || ""
  })

  const onUpdate = async () => {
    try {
      const { ok, data, code } = await api.put(`/economic_actor/${economicActor._id}`, values)
      if (!ok) return toast.error(code || "Une erreur est survenue")
      setEconomicActor(data)
      toast.success("Acteur économique mis à jour")
    } catch (e) {
      console.log(e)
      toast.error("Une erreur est survenue")
    }
  }

  const onDelete = async () => {
    try {
      if (!confirm("Êtes-vous sûr de vouloir supprimer cet acteur économique ?")) return
      const { ok, code } = await api.delete(`/economic_actor/${economicActor._id}`)
      if (!ok) return toast.error(code || "Une erreur est survenue")
      toast.success("Acteur économique supprimé")
      navigate("/admin/economic-actors")
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
          <input className="w-full input-primary" value={values.name} onChange={(e) => setValues({ ...values, name: e.target.value })} placeholder="Nom de l'acteur économique" />
        </div>

        <div className="w-full">
          <label className="block text-sm font-medium text-gray-700 mb-2">Date de création</label>
          <input
            className="w-full input-primary bg-gray-50"
            value={economicActor.createdAt ? new Date(economicActor.createdAt).toLocaleDateString("fr-FR") : "-"}
            disabled
            readOnly
          />
        </div>

        <div className="w-full md:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
          <textarea
            className="w-full input-primary"
            value={values.description}
            onChange={(e) => setValues({ ...values, description: e.target.value })}
            placeholder="Description de l'acteur économique"
            rows={4}
          />
        </div>
      </div>

      <div className="flex items-center justify-end gap-3 pt-6 border-t border-gray-200">
        <button className="button-primary" onClick={onUpdate}>
          Enregistrer
        </button>
        <button className="button-primary bg-red-600" onClick={onDelete}>
          Supprimer
        </button>
      </div>
    </div>
  )
}

function CollectivitiesTab({ economicActor, setEconomicActor }) {
  const [collectivities, setCollectivities] = useState([])
  const [addOpen, setAddOpen] = useState(false)
  const [addValues, setAddValues] = useState({ collectivity_id: "" })

  const fetchCollectivities = async () => {
    try {
      const { ok, data, code } = await api.post("/collectivity/search", {})
      if (!ok) return toast.error(code || "Une erreur est survenue")
      setCollectivities(data)
    } catch (e) {
      console.log(e)
      toast.error("Une erreur est survenue")
    }
  }

  useEffect(() => {
    fetchCollectivities()
  }, [])

  const addCollectivity = async () => {
    if (!addValues.collectivity_id) return toast.error("Sélectionnez une collectivité")
    const collectivity = collectivities.find((x) => x._id === addValues.collectivity_id)
    if (!collectivity) return toast.error("Collectivité introuvable")

    const exists = (economicActor?.collectivities || []).some((x) => x.id === collectivity._id)
    if (exists) return toast.error("Cette collectivité est déjà associée")

    const updatedCollectivities = [...(economicActor?.collectivities || []), { id: collectivity._id, name: collectivity.name, joined_at: new Date() }]

    try {
      const { ok, data, code } = await api.put(`/economic_actor/${economicActor._id}`, { collectivities: updatedCollectivities })
      if (!ok) return toast.error(code || "Une erreur est survenue")
      setEconomicActor(data)

      await addUserCollectivities(collectivity)

      setAddOpen(false)
      setAddValues({ collectivity_id: "" })
      toast.success("Collectivité ajoutée avec succès")
    } catch (e) {
      console.log(e)
      toast.error("Une erreur est survenue")
    }
  }

  const addUserCollectivities = async (collectivity) => {
    try {
      const { ok, data, code } = await api.post("/user/search", { economic_actor_id: economicActor._id })
      if (!ok) return toast.error(code || "Une erreur est survenue")
      for (const user of data) {
        if (user.collectivities.some((col) => col.id === collectivity._id)) continue
        const updatedUserCollectivities = [...(user.collectivities || []), { id: collectivity._id, name: collectivity.name, role: "economic_actor", status: "approved" }]
        await api.put(`/user/${user._id}`, { collectivities: updatedUserCollectivities })
      }
    } catch (e) {
      console.log(e)
      toast.error("Une erreur est survenue")
    }
  }

  const removeCollectivity = async (collectivity) => {
    if (!window.confirm("Êtes-vous sûr de vouloir retirer cette collectivité ? Elle sera également retirée de tous les utilisateurs de cet acteur économique.")) return
    const updated = (economicActor?.collectivities || []).filter((x) => x.id !== collectivity.id)

    try {
      const { ok, data, code } = await api.put(`/economic_actor/${economicActor._id}`, { collectivities: updated })
      if (!ok) return toast.error(code || "Une erreur est survenue")
      setEconomicActor(data)

      await removeUserCollectivities(collectivity)

      toast.success("Collectivité retirée avec succès")
    } catch (e) {
      console.log(e)
      toast.error("Une erreur est survenue")
    }
  }

  const removeUserCollectivities = async (collectivity) => {
    try {
      const { ok, data, code } = await api.post("/user/search", { economic_actor_id: economicActor._id })
      if (!ok) return toast.error(code || "Une erreur est survenue")
      for (const user of data) {
        const updatedUserCollectivities = (user.collectivities || []).filter((col) => col.id !== collectivity.id)
        await api.put(`/user/${user._id}`, { collectivities: updatedUserCollectivities })
      }
    } catch (e) {
      console.log(e)
      toast.error("Une erreur est survenue")
    }
  }

  return (
    <div className="card-shadow">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Collectivités</h2>
          <p className="text-sm text-gray-600 mt-1">Gérer les collectivités associées à cet acteur économique</p>
        </div>
        <button className="button-primary" onClick={() => setAddOpen(true)}>
          Ajouter une collectivité
        </button>
      </div>

      {economicActor?.collectivities && economicActor.collectivities.length > 0 ? (
        <div className="space-y-4">
          {economicActor.collectivities.map((collectivity) => (
            <div key={collectivity.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-primary-green/10 rounded-full flex items-center justify-center">
                  <FiHome className="text-primary-green" size={18} />
                </div>
                <div>
                  <h3 className="font-medium text-gray-900">{collectivity.name}</h3>
                  <p className="text-xs text-gray-500">Rejoint le {collectivity.joined_at ? new Date(collectivity.joined_at).toLocaleDateString("fr-FR") : "-"}</p>
                </div>
              </div>

              <button
                className="p-2 text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
                onClick={() => removeCollectivity(collectivity)}
                title="Retirer cette collectivité"
              >
                <FiX size={16} />
              </button>
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
              <Select
                value={addValues.collectivity_id}
                onChange={(value) => setAddValues({ ...addValues, collectivity_id: value })}
                options={[
                  { value: "", label: "Sélectionner une collectivité" },
                  ...collectivities
                    .filter((c) => !economicActor?.collectivities?.some((ec) => ec.id === c._id))
                    .map((c) => ({
                      value: c._id,
                      label: c.name
                    }))
                ]}
              />
            </div>
          </div>

          <div className="flex justify-end mt-6">
            <button className="button-primary" onClick={addCollectivity}>
              Ajouter
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

function UsersTab({ economicActor }) {
  const navigate = useNavigate()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [addOpen, setAddOpen] = useState(false)

  const fetchUsers = async () => {
    try {
      setLoading(true)
      const { ok, data, code } = await api.post("/user/search", { economic_actor_id: economicActor._id })
      if (!ok) return toast.error(code || "Une erreur est survenue")
      setUsers(data)
    } catch (e) {
      console.log(e)
      toast.error("Une erreur est survenue")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchUsers()
  }, [economicActor])

  if (loading) {
    return (
      <div className="card-shadow">
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-green"></div>
        </div>
      </div>
    )
  }

  return (
    <div className="card-shadow">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Utilisateurs</h2>
          <p className="text-sm text-gray-600 mt-1">Liste des utilisateurs appartenant à cet acteur économique</p>
        </div>
        <button className="button-primary" onClick={() => setAddOpen(true)}>
          Ajouter un utilisateur
        </button>
      </div>

      {users.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Nom</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Email</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Dernière connexion</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {users.map((user) => (
                <tr key={user._id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 text-sm font-medium text-gray-900 cursor-pointer" onClick={() => navigate(`/admin/users/${user._id}`)}>
                    {user.name}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600 cursor-pointer" onClick={() => navigate(`/admin/users/${user._id}`)}>
                    {user.email}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600 cursor-pointer" onClick={() => navigate(`/admin/users/${user._id}`)}>
                    {user.last_login_at && !isNaN(new Date(user.last_login_at).getTime()) ? new Date(user.last_login_at).toLocaleDateString("fr-FR") : "Jamais"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
          <FiUsers className="mx-auto h-12 w-12 text-gray-400" />
          <p className="mt-2 text-sm text-gray-600">Aucun utilisateur dans cet acteur économique</p>
          <p className="text-xs text-gray-500 mt-1">Cliquez sur "Ajouter un utilisateur" pour commencer</p>
        </div>
      )}

      <AddUserModal isOpen={addOpen} onClose={() => setAddOpen(false)} economicActor={economicActor} onUserAdded={fetchUsers} />
    </div>
  )
}

const AddUserModal = ({ isOpen, onClose, economicActor, onUserAdded }) => {
  const [searchValue, setSearchValue] = useState("")
  const [searchResults, setSearchResults] = useState([])
  const [searching, setSearching] = useState(false)

  const searchUsers = async (search) => {
    if (!search || search.trim().length < 2) return setSearchResults([])

    try {
      setSearching(true)
      const { ok, data, code } = await api.post("/user/search", { search, role: "economic_actor" })
      if (!ok) {
        toast.error(code || "Une erreur est survenue")
        return
      }
      const filtered = data.filter((u) => u.economic_actor_id !== economicActor._id)
      setSearchResults(filtered)
    } catch (e) {
      console.log(e)
      toast.error("Une erreur est survenue")
    } finally {
      setSearching(false)
    }
  }

  const addUserToEconomicActor = async (user) => {
    try {
      const { ok } = await api.put(`/user/${user._id}`, {
        economic_actor_id: economicActor._id,
        economic_actor_name: economicActor.name,
        collectivities: economicActor.collectivities.map((col) => ({
          id: col.id,
          name: col.name,
          role: "economic_actor",
          status: "approved"
        }))
      })

      if (!ok) {
        toast.error("Une erreur est survenue")
        return
      }

      toast.success(user.name + " a été ajouté à " + economicActor.name)
      handleClose()
      await onUserAdded()
    } catch (e) {
      console.log(e)
      toast.error("Une erreur est survenue")
    }
  }

  const handleClose = () => {
    setSearchValue("")
    setSearchResults([])
    onClose()
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      searchUsers(searchValue)
    }, 300)

    return () => clearTimeout(timer)
  }, [searchValue])

  return (
    <Modal isOpen={isOpen} className="max-w-2xl" onClose={handleClose}>
      <div className="p-6">
        <h3 className="text-xl font-semibold text-gray-900 mb-6">Ajouter un utilisateur</h3>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">Rechercher par nom ou email</label>
          <input type="text" className="w-full input-primary" placeholder="Entrez un nom ou un email..." value={searchValue} onChange={(e) => setSearchValue(e.target.value)} />
          <p className="text-xs text-gray-500 mt-1">Recherche parmi les utilisateurs ayant le rôle "Acteur économique"</p>
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
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">Email</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">Acteur économique actuel</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {searchResults.map((user) => (
                  <tr key={user._id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{user.name}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{user.email}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{user.economic_actor_name || "Aucun"}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        className="px-3 py-1 bg-primary-green text-white text-sm rounded-lg hover:bg-primary-green/90 transition-colors"
                        onClick={() => addUserToEconomicActor(user)}
                      >
                        Ajouter
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
            <p className="text-sm">Aucun utilisateur trouvé</p>
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
