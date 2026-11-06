import React, { useState, useEffect } from "react"
import api from "@/services/api"
import toast from "react-hot-toast"
import useStore from "@/services/store"
import Loader from "@/components/loader"
import IndicatorValueInput from "@/scenes/actions/view/completion/IndicatorValueInput"
import { isIndicatorValueFilled } from "@/utils/indicatorHelpers"

// Même palette que les cartes d'indicateurs (completion/SituationTab.jsx)
const STATE_STYLES = {
  todo: {
    accent: "#56BDB8",
    tagText: "À remplir",
    tagBg: "#D2EDEC",
    tagColor: "#0A6B66",
    inputClass: "!border-[1.5px] !border-[#56BDB8] !bg-[#F5FBFB] placeholder:!text-[#0A6B66]",
    cardShadow: "0 1px 3px rgba(10,54,65,.06)"
  },
  done: {
    accent: "#2DAC6A",
    tagText: "Rempli",
    tagBg: "#D9EFE3",
    tagColor: "#1B7A47",
    inputClass: "!border-[#e1e5e8] !bg-white",
    cardShadow: "0 1px 2px rgba(10,54,65,.05)"
  }
}

const SAVE_LABELS = { saving: "Enregistrement…", saved: "Enregistré", error: "Erreur d'enregistrement" }

export default function Questionnaire() {
  const { user } = useStore()

  if (user.role !== "economic_actor") {
    return (
      <div className="p-8">
        <h1 className="text-3xl font-bold mb-4">Questionnaire</h1>
        <p className="text-gray-600">Ce questionnaire est réservé aux acteurs économiques.</p>
      </div>
    )
  }

  return (
    <div className="w-full max-w-5xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-6">Questionnaire</h1>
      <IntroText />
      <Questions />
    </div>
  )
}

function IntroText() {
  const [form, setForm] = useState(null)

  const fetchForm = async () => {
    try {
      const { ok, data, code } = await api.get("/economic_actor_form")
      if (!ok) return toast.error(code || "Une erreur est survenue")
      setForm(data)
    } catch (error) {
      toast.error(error.code || "Une erreur est survenue")
    }
  }

  useEffect(() => {
    fetchForm()
  }, [])

  if (!form?.intro_text) return null

  return <p className="text-[13.5px] text-[#5b6b66] bg-[#F3F7F6] border border-[#DCE7E4] rounded-[14px] px-[13px] py-[11px] mb-6 leading-relaxed whitespace-pre-line">{form.intro_text}</p>
}

function Questions() {
  const [questions, setQuestions] = useState(null)
  const [failed, setFailed] = useState(false)

  const fetchQuestions = async () => {
    try {
      setFailed(false)
      const { ok, data, code } = await api.post("/economic_actor_question/search", {})
      if (!ok) {
        setFailed(true)
        return toast.error(code || "Une erreur est survenue")
      }
      setQuestions(data)
    } catch (error) {
      setFailed(true)
      toast.error(error.code || "Une erreur est survenue")
    }
  }

  useEffect(() => {
    fetchQuestions()
  }, [])

  if (failed) return <LoadError onRetry={fetchQuestions} />
  if (!questions) return <Loader />

  if (questions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-gray-400">
        <p className="text-sm font-medium">Aucune question n'est disponible pour le moment.</p>
      </div>
    )
  }

  return <Answers questions={questions} />
}

function Answers({ questions }) {
  const [answers, setAnswers] = useState(null)
  const [failed, setFailed] = useState(false)

  const fetchAnswers = async () => {
    try {
      setFailed(false)
      const { ok, data, code } = await api.get("/economic_actor_answer/mine")
      if (!ok) {
        setFailed(true)
        return toast.error(code || "Une erreur est survenue")
      }
      setAnswers(data)
    } catch (error) {
      setFailed(true)
      toast.error(error.code || "Une erreur est survenue")
    }
  }

  useEffect(() => {
    fetchAnswers()
  }, [])

  if (failed) return <LoadError onRetry={fetchAnswers} />
  if (!answers) return <Loader />

  return (
    <div className="flex flex-col gap-[11px]">
      {questions.map((question) => (
        <QuestionCard
          key={question._id}
          question={question}
          answer={answers.find((a) => a.question_id === question._id)}
          onSaved={(saved) => setAnswers((prev) => [...prev.filter((a) => a.question_id !== saved.question_id), saved])}
        />
      ))}
    </div>
  )
}

function QuestionCard({ question, answer, onSaved }) {
  const [saveStatus, setSaveStatus] = useState(null)
  const stateStyle = STATE_STYLES[isIndicatorValueFilled({ value: answer?.value, indicator_type: question.type }) ? "done" : "todo"]

  const handleSave = async (newValue) => {
    try {
      setSaveStatus("saving")
      const { ok, data, code } = await api.put(`/economic_actor_answer/mine/${question._id}`, { value: { [question.type]: newValue } })
      if (!ok) {
        setSaveStatus("error")
        return toast.error(code || "Une erreur est survenue")
      }
      setSaveStatus("saved")
      onSaved(data)
    } catch (error) {
      setSaveStatus("error")
      toast.error(error.code || "Une erreur est survenue")
    }
  }

  return (
    <div className="bg-white rounded-xl border border-[#eef1f0] px-[18px] py-4 transition-all" style={{ borderLeft: `4px solid ${stateStyle.accent}`, boxShadow: stateStyle.cardShadow }}>
      <div className="flex items-center gap-2.5 mb-2">
        <span className="w-[9px] h-[9px] rounded-full shrink-0" style={{ background: stateStyle.accent }} />
        <h3 className="text-[15px] font-bold text-[#123314] m-0 leading-tight">{question.label}</h3>
        <span className="ml-auto inline-flex items-center text-[11.5px] font-semibold px-[11px] py-1 rounded-full whitespace-nowrap" style={{ background: stateStyle.tagBg, color: stateStyle.tagColor }}>
          {stateStyle.tagText}
        </span>
      </div>
      {question.description && <p className="text-[12.5px] text-[#5b6b66] mb-2 leading-relaxed whitespace-pre-line">{question.description}</p>}
      {question.actions?.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {question.actions.map((action) => (
            <span key={action.id} className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[#F1F4F3] text-[#5b6b66]">
              {action.name}
            </span>
          ))}
        </div>
      )}
      <label className="block text-[10.5px] font-semibold uppercase tracking-wider text-[#9aa8a4] mb-2">Réponse</label>
      <div className="flex items-center gap-2">
        <div className="flex-1 max-w-xl">
          <IndicatorValueInput
            value={answer?.value?.[question.type]}
            indicatorType={question.type}
            options={question.value_possibilities}
            onChange={handleSave}
            className={`w-full ${stateStyle.inputClass}`}
          />
        </div>
        {question.value_unit && <span className="text-xs text-[#768776] whitespace-nowrap">{question.value_unit}</span>}
        {saveStatus && <span className={`text-xs font-semibold whitespace-nowrap ${saveStatus === "error" ? "text-red-600" : "text-[#768776]"}`}>{SAVE_LABELS[saveStatus]}</span>}
      </div>
    </div>
  )
}

function LoadError({ onRetry }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 gap-3">
      <p className="text-sm text-gray-600">Impossible de charger le questionnaire.</p>
      <button onClick={onRetry} className="button-primary">
        Réessayer
      </button>
    </div>
  )
}
