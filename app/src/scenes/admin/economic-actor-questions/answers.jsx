import React, { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { FiArrowLeft } from "react-icons/fi"
import api from "@/services/api"
import toast from "react-hot-toast"
import Loader from "@/components/loader"

// Lecture seule des réponses des acteurs économiques au questionnaire.
export default function Answers() {
  const navigate = useNavigate()
  const [answers, setAnswers] = useState(null)
  const [filters, setFilters] = useState({ question_id: "" })

  const fetchAnswers = async () => {
    try {
      const { ok, data, code } = await api.post("/economic_actor_answer/admin/search", { ...filters })
      if (!ok) return toast.error(code || "Une erreur est survenue")
      setAnswers(data)
    } catch (error) {
      toast.error(error.code || "Une erreur est survenue")
    }
  }

  useEffect(() => {
    fetchAnswers()
  }, [filters])

  return (
    <div className="p-8">
      <button onClick={() => navigate("/admin/economic-actor-questions")} className="flex items-center gap-2 text-sm text-gray-600 mb-4">
        <FiArrowLeft /> Retour au questionnaire
      </button>
      <h1 className="text-3xl font-bold mb-6">Réponses des acteurs économiques</h1>

      <QuestionFilter filters={filters} setFilters={setFilters} />

      {!answers ? (
        <Loader />
      ) : answers.length === 0 ? (
        <div className="flex items-center justify-center py-12">
          <p className="text-lg text-gray-600">Aucune réponse pour le moment</p>
        </div>
      ) : (
        <table className="w-full overflow-hidden card-shadow">
          <thead className="bg-gray-100">
            <tr>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Acteur économique</th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Question</th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Réponse</th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Mise à jour</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {answers.map((answer) => (
              <tr key={answer._id}>
                <td className="px-6 py-4 text-sm font-medium text-gray-900">{answer.economic_actor_name || "-"}</td>
                <td className="px-6 py-4 text-sm text-gray-600">
                  {answer.question_label}
                  {!answer.question_active && <span className="ml-2 text-xs text-gray-500">(désactivée)</span>}
                </td>
                <td className="px-6 py-4 text-sm text-gray-900 whitespace-pre-line">{answer.value ? `${answer.value}${answer.value_unit ? ` ${answer.value_unit}` : ""}` : "-"}</td>
                <td className="px-6 py-4 text-sm text-gray-600">{answer.updatedAt ? new Date(answer.updatedAt).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }) : "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

function QuestionFilter({ filters, setFilters }) {
  const [questions, setQuestions] = useState([])

  const fetchQuestions = async () => {
    try {
      const { ok, data, code } = await api.post("/economic_actor_question/search", { limit: 1000 })
      if (!ok) return toast.error(code || "Une erreur est survenue")
      setQuestions(data)
    } catch (error) {
      toast.error(error.code || "Une erreur est survenue")
    }
  }

  useEffect(() => {
    fetchQuestions()
  }, [])

  return (
    <div className="mb-4 max-w-md">
      <label className="block text-sm font-semibold text-gray-700 mb-2">Question</label>
      <select value={filters.question_id} onChange={(e) => setFilters({ ...filters, question_id: e.target.value })} className="w-full input-primary rounded-lg">
        <option value="">Toutes les questions</option>
        {questions.map((question) => (
          <option key={question._id} value={question._id}>
            {question.label}
          </option>
        ))}
      </select>
    </div>
  )
}
