import React, { useState } from "react"
import { Link } from "react-router-dom"
import toast from "react-hot-toast"
import { Mail, ArrowLeft, Send, MessageCircle, Sparkles } from "lucide-react"

import api from "@/services/api"
import useStore from "@/services/store"

export default function Contact() {
  const { user } = useStore()
  const [form, setForm] = useState({
    name: user ? `${user.firstname || ""} ${user.lastname || ""}`.trim() : "",
    email: user?.email || "",
    subject: "",
    message: ""
  })
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.name || !form.email || !form.subject || !form.message) {
      return toast.error("Tous les champs sont obligatoires")
    }
    setLoading(true)
    try {
      const { ok, code } = await api.post("/contact", form)
      if (!ok) {
        setLoading(false)
        return toast.error(code || "Erreur lors de l'envoi du message")
      }
      toast.success("Votre message a bien été envoyé. Nous vous répondrons rapidement.")
      setForm({ name: form.name, email: form.email, subject: "", message: "" })
    } catch (error) {
      toast.error(error.code || "Erreur lors de l'envoi du message")
    }
    setLoading(false)
  }

  return (
    <div>
      <div className="max-w-3xl mx-auto px-6 py-12 lg:py-16">
        <div className="relative text-center mb-10">
          <div className="absolute right-0 top-0 hidden md:flex items-center gap-2 text-primary-green/40">
            <Mail className="w-7 h-7" strokeWidth={1.5} />
            <Sparkles className="w-5 h-5" strokeWidth={1.5} />
          </div>
          <div className="absolute left-0 top-2 hidden md:block text-primary-green/30">
            <MessageCircle className="w-8 h-8" strokeWidth={1.5} />
          </div>

          <span className="inline-block px-3 py-1 bg-secondary-green text-primary-green text-xs font-semibold rounded-full uppercase tracking-wider">
            Nous contacter
          </span>
          <h1 className="mt-4 text-4xl lg:text-5xl font-bold text-primary-slate">Une question ? Écrivez-nous.</h1>
          <p className="mt-3 text-base text-font-secondary max-w-xl mx-auto">
            Remplissez le formulaire ci-dessous et notre équipe vous répondra dans les meilleurs délais.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-100 p-6 lg:p-8 flex flex-col gap-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="name" className="text-sm font-semibold text-primary-slate">
                Nom complet
              </label>
              <input
                id="name"
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Jean Dupont"
                className="px-3 py-2.5 border border-gray-200 rounded-md text-sm focus:outline-none focus:border-primary-green focus:ring-2 focus:ring-primary-green/20 transition"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="email" className="text-sm font-semibold text-primary-slate">
                Adresse email
              </label>
              <input
                id="email"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="jean.dupont@exemple.fr"
                className="px-3 py-2.5 border border-gray-200 rounded-md text-sm focus:outline-none focus:border-primary-green focus:ring-2 focus:ring-primary-green/20 transition"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="subject" className="text-sm font-semibold text-primary-slate">
              Sujet
            </label>
            <input
              id="subject"
              type="text"
              value={form.subject}
              onChange={(e) => setForm({ ...form, subject: e.target.value })}
              placeholder="Objet de votre message"
              className="px-3 py-2.5 border border-gray-200 rounded-md text-sm focus:outline-none focus:border-primary-green focus:ring-2 focus:ring-primary-green/20 transition"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="message" className="text-sm font-semibold text-primary-slate">
              Message
            </label>
            <textarea
              id="message"
              rows={6}
              value={form.message}
              onChange={(e) => setForm({ ...form, message: e.target.value })}
              placeholder="Décrivez votre demande..."
              className="px-3 py-2.5 border border-gray-200 rounded-md text-sm focus:outline-none focus:border-primary-green focus:ring-2 focus:ring-primary-green/20 transition resize-y"
            />
          </div>

          <div className="flex items-center justify-between flex-wrap gap-3 pt-2">
            <Link to="/faq" className="inline-flex items-center gap-2 text-sm font-medium text-font-secondary hover:text-primary-green transition-colors">
              <ArrowLeft className="w-4 h-4" />
              Retour à la FAQ
            </Link>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary-green hover:bg-primary-green/90 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-md transition-colors"
            >
              <Send className="w-4 h-4" />
              {loading ? "Envoi en cours..." : "Envoyer le message"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
