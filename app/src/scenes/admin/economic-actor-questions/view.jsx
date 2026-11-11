import { useParams, useNavigate } from "react-router-dom"
import { useState, useEffect } from "react"
import { FiTrash2, FiArrowLeft } from "react-icons/fi"
import api from "@/services/api"
import toast from "react-hot-toast"
import Select from "@/components/Select"
import Loader from "@/components/loader"

export default function View() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [question, setQuestion] = useState(null)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const getQuestion = async () => {
    try {
      const { ok, data, code } = await api.get(`/economic_actor_question/${id}`)
      if (!ok) return toast.error(code || "Une erreur est survenue")
      setQuestion(data)
    } catch (error) {
      toast.error(error.code || "Une erreur est survenue")
    }
  }

  const handleSave = async () => {
    try {
      if (!question.label?.trim()) return toast.error("Veuillez entrer l'intitulé de la question")
      if ((question.type === "radio" || question.type === "checkbox") && !(question.value_possibilities || []).some((option) => option.trim()))
        return toast.error("Ajoutez au moins une option pour une question à choix")
      setSaving(true)
      const { ok, data, code } = await api.put(`/economic_actor_question/${id}`, question)
      if (!ok) return toast.error(code || "Une erreur est survenue")
      setQuestion(data)
      toast.success("Question sauvegardée !")
    } catch (error) {
      toast.error(error.code || "Une erreur est survenue")
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    try {
      if (!confirm("Supprimer cette question et toutes les réponses déjà saisies par les acteurs économiques ? Cette action est définitive.\n\nPour la retirer sans perdre les réponses, décochez plutôt « Question active »."))
        return
      setDeleting(true)
      const { ok, code } = await api.delete(`/economic_actor_question/${id}`)
      if (!ok) return toast.error(code || "Une erreur est survenue")
      toast.success("Question supprimée")
      navigate("/admin/economic-actor-questions")
    } catch (error) {
      toast.error(error.code || "Une erreur est survenue")
    } finally {
      setDeleting(false)
    }
  }

  useEffect(() => {
    getQuestion()
  }, [id])

  if (!question) return <Loader />

  return (
    <div className="w-full max-w-7xl mx-auto px-4 py-8">
      <div className="mb-6">
        <div className="flex items-center gap-2 text-sm text-gray-600 mb-2">
          <button onClick={() => navigate("/admin/economic-actor-questions")} className="hover:text-primary-green transition-colors">
            Questionnaire acteurs économiques
          </button>
          <span>/</span>
          <span className="text-gray-900 font-medium truncate max-w-[150px]">{question.label}</span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="p-2 rounded-full hover:bg-gray-100 text-gray-600 hover:text-primary-green transition-colors"
            aria-label="Revenir à la page précédente"
          >
            <FiArrowLeft size={18} />
          </button>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{question.label || "Détails de la question"}</h1>
        </div>
      </div>

      <div className="space-y-4 card-shadow">
        <h2 className="text-lg font-semibold text-gray-900 pb-2 border-b">Informations générales</h2>

        <div>
          <label className="block text-sm font-medium mb-2">Intitulé de la question</label>
          <input type="text" value={question.label || ""} onChange={(e) => setQuestion({ ...question, label: e.target.value })} className="w-full input-primary" />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Aide affichée à l'acteur (facultatif)</label>
          <textarea value={question.description || ""} onChange={(e) => setQuestion({ ...question, description: e.target.value })} rows="3" className="w-full input-primary rounded-lg" />
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium mb-2">Type de réponse</label>
            <Select
              value={question.type || ""}
              onChange={(value) => setQuestion({ ...question, type: value })}
              options={[
                { value: "number", label: "Nombre" },
                { value: "text", label: "Texte libre" },
                { value: "radio", label: "Choix unique (liste déroulante)" },
                { value: "checkbox", label: "Choix multiples (cases à cocher)" }
              ]}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Unité (facultatif, ex. : t, km, %)</label>
            <input type="text" value={question.value_unit || ""} onChange={(e) => setQuestion({ ...question, value_unit: e.target.value })} className="w-full input-primary" />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Ordre d'affichage (du plus petit au plus grand)</label>
            <input type="number" value={question.order ?? 0} onChange={(e) => setQuestion({ ...question, order: Number(e.target.value) })} className="w-full input-primary" />
          </div>
        </div>

        {(question.type === "checkbox" || question.type === "radio") && (
          <div>
            <label className="block text-sm font-medium mb-2">Options proposées à l'acteur</label>
            <div className="space-y-2">
              {(question.value_possibilities || []).map((option, index) => (
                <div key={index} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={option}
                    onChange={(e) => setQuestion({ ...question, value_possibilities: question.value_possibilities.map((o, i) => (i === index ? e.target.value : o)) })}
                    className="flex-1 input-primary"
                    placeholder={`Option ${index + 1}`}
                  />
                  <button
                    type="button"
                    onClick={() => setQuestion({ ...question, value_possibilities: question.value_possibilities.filter((_, i) => i !== index) })}
                    className="px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <FiTrash2 size={16} />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setQuestion({ ...question, value_possibilities: [...(question.value_possibilities || []), ""] })}
                className="px-4 py-2 text-primary-green hover:bg-primary-green/10 rounded-lg border border-primary-green transition-colors"
              >
                Ajouter une option
              </button>
            </div>
          </div>
        )}

        <LinkedActions question={question} setQuestion={setQuestion} />

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={!!question.active}
            onChange={(e) => setQuestion({ ...question, active: e.target.checked })}
            className="w-4 h-4"
            style={{ accentColor: "#2DAC6A" }}
          />
          <span className="text-sm text-gray-700">Question active : affichée aux acteurs économiques. Décochez pour la masquer sans perdre les réponses déjà saisies.</span>
        </label>

        <div className="pt-4 mt-4 border-t border-light-border flex items-center justify-end gap-3">
          <button onClick={handleDelete} disabled={deleting} className="button-primary bg-red-600 inline-flex items-center gap-2 disabled:opacity-60">
            {deleting ? "Suppression..." : "Supprimer"}
          </button>
          <button onClick={handleSave} disabled={saving} className="button-primary inline-flex items-center gap-2 disabled:opacity-60">
            {saving ? "Enregistrement..." : "Enregistrer"}
          </button>
        </div>
      </div>
    </div>
  )
}

function LinkedActions({ question, setQuestion }) {
  const [actions, setActions] = useState([])

  const fetchActions = async () => {
    try {
      const { ok, data, code } = await api.post("/action/search", { type: "global", limit: 100 })
      if (!ok) return toast.error(code || "Erreur lors de la récupération des actions globales")
      setActions(data)
    } catch (error) {
      toast.error(error.code || "Erreur lors de la récupération des actions globales")
    }
  }

  useEffect(() => {
    fetchActions()
  }, [])

  return (
    <div>
      <label className="block text-sm font-medium mb-1">Fiches rattachées (facultatif)</label>
      <p className="text-xs text-gray-600 mb-2">Pour information et pour l'export : la question reste affichée à tous les acteurs économiques.</p>
      {actions.length === 0 ? (
        <p className="text-sm text-gray-500">Aucune fiche disponible</p>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {actions.map((action) => (
            <label key={action._id} className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={(question.actions || []).some((a) => a.id === action._id)}
                onChange={(e) =>
                  setQuestion({
                    ...question,
                    actions: e.target.checked ? [...(question.actions || []), { id: action._id, name: action.name }] : question.actions.filter((a) => a.id !== action._id)
                  })
                }
                className="w-4 h-4"
                style={{ accentColor: "#2DAC6A" }}
              />
              <span className="text-sm text-gray-700">{action.name}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}
