import React, { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import Modal from "@/components/modal"
import api from "@/services/api"
import toast from "react-hot-toast"
import Pagination from "@/components/pagination"

const TYPE_LABELS = { number: "Nombre", text: "Texte", radio: "Radio", checkbox: "Checkbox" }

export default function List() {
  const navigate = useNavigate()
  const [questions, setQuestions] = useState([])
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [filters, setFilters] = useState({ page: 0, limit: 20 })
  const [total, setTotal] = useState(0)

  const fetchQuestions = async () => {
    try {
      const { ok, data, code, total } = await api.post("/economic_actor_question/search", filters)
      if (!ok) return toast.error(code || "Une erreur est survenue")
      setQuestions(data)
      setTotal(total)
    } catch (error) {
      toast.error(error.code || "Une erreur est survenue")
    }
  }

  useEffect(() => {
    fetchQuestions()
  }, [filters])

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Questionnaire acteurs économiques</h1>
        <button onClick={() => setIsModalOpen(true)} className="button-primary">
          Ajouter une question
        </button>
      </div>

      <IntroText />

      {questions.length === 0 ? (
        <div className="flex items-center justify-center py-12">
          <div className="text-lg text-gray-600">Aucune question pour le moment</div>
        </div>
      ) : (
        <table className="w-full overflow-hidden card-shadow">
          <thead className="bg-gray-100">
            <tr>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Ordre</th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Question</th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Type</th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Fiches rattachées</th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Statut</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {questions.map((question) => (
              <tr key={question._id} className="hover:bg-gray-50 cursor-pointer" onClick={() => navigate(`/admin/economic-actor-questions/${question._id}`)}>
                <td className="px-6 py-4 text-sm text-gray-600">{question.order}</td>
                <td className="px-6 py-4 text-sm font-medium text-gray-900">{question.label}</td>
                <td className="px-6 py-4 text-sm text-gray-600">{TYPE_LABELS[question.type]}</td>
                <td className="px-6 py-4 text-sm text-gray-600">{question.actions?.length ? question.actions.map((action) => action.name).join(", ") : "-"}</td>
                <td className="px-6 py-4 text-sm text-gray-600">{question.active ? "Active" : "Désactivée"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <AddQuestionModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
      <Pagination
        total={total}
        per_page={filters.limit}
        currentPage={filters.page + 1}
        onNext={() => setFilters({ ...filters, page: filters.page + 1 })}
        onPrevious={() => setFilters({ ...filters, page: filters.page - 1 })}
      />
    </div>
  )
}

function IntroText() {
  const [form, setForm] = useState(null)
  const [saving, setSaving] = useState(false)

  const fetchForm = async () => {
    try {
      const { ok, data, code } = await api.get("/economic_actor_form")
      if (!ok) return toast.error(code || "Une erreur est survenue")
      setForm(data)
    } catch (error) {
      toast.error(error.code || "Une erreur est survenue")
    }
  }

  const handleSave = async () => {
    try {
      setSaving(true)
      const { ok, data, code } = await api.put("/economic_actor_form", form)
      if (!ok) return toast.error(code || "Une erreur est survenue")
      setForm(data)
      toast.success("Texte explicatif sauvegardé !")
    } catch (error) {
      toast.error(error.code || "Une erreur est survenue")
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => {
    fetchForm()
  }, [])

  if (!form) return null

  return (
    <div className="space-y-4 card-shadow mb-6">
      <h2 className="text-lg font-semibold text-gray-900 pb-2 border-b">Texte explicatif</h2>
      <p className="text-sm text-gray-600">Affiché en haut de la page questionnaire des acteurs économiques.</p>
      <textarea value={form.intro_text || ""} onChange={(e) => setForm({ ...form, intro_text: e.target.value })} rows="4" className="w-full input-primary rounded-lg" />
      <div className="flex justify-end">
        <button onClick={handleSave} disabled={saving} className="button-primary disabled:opacity-60">
          {saving ? "Enregistrement..." : "Enregistrer"}
        </button>
      </div>
    </div>
  )
}

const AddQuestionModal = ({ isOpen, onClose }) => {
  const navigate = useNavigate()
  const [label, setLabel] = useState("")

  const createQuestion = async () => {
    try {
      if (!label.trim()) return toast.error("Veuillez entrer l'intitulé de la question")
      const { ok, data, code } = await api.post("/economic_actor_question", { label })
      if (!ok) return toast.error(code || "Une erreur est survenue")
      navigate(`/admin/economic-actor-questions/${data._id}`)
    } catch (error) {
      toast.error(error.code || "Une erreur est survenue")
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} className="max-w-md">
      <div className="p-8">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-gray-800">Ajouter une question</h2>
        </div>

        <div className="mb-6">
          <label className="block text-sm font-semibold text-gray-700 mb-2">Intitulé de la question</label>
          <input
            type="text"
            placeholder="Entrez l'intitulé"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-green focus:border-transparent transition-all"
          />
        </div>

        <div className="flex justify-end gap-3">
          <button onClick={createQuestion} className="button-primary">
            Créer
          </button>
        </div>
      </div>
    </Modal>
  )
}
