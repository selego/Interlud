import React, { useState } from "react"
import { Link } from "react-router-dom"
import { ChevronDown, HelpCircle, MessageCircle, Sparkles, Mail, Download } from "lucide-react"
import { FAQ, FAQ_CATEGORIES } from "./data"

export default function Faq() {
  const [activeCategory, setActiveCategory] = useState(FAQ_CATEGORIES[0].id)
  const [openId, setOpenId] = useState(null)

  const filteredFaq = FAQ.filter((item) => item.category === activeCategory)

  return (
    <div>
      <div className="max-w-7xl mx-auto px-6 py-12 lg:py-16">
        <div className="relative text-center mb-12">
          <div className="absolute right-0 top-0 hidden md:flex items-center gap-2 text-primary-green/40">
            <HelpCircle className="w-7 h-7" strokeWidth={1.5} />
            <Sparkles className="w-5 h-5" strokeWidth={1.5} />
          </div>
          <div className="absolute left-0 top-2 hidden md:block text-primary-green/30">
            <MessageCircle className="w-8 h-8" strokeWidth={1.5} />
          </div>

          <span className="inline-block px-3 py-1 bg-secondary-green text-primary-green text-xs font-semibold rounded-full uppercase tracking-wider">
            Centre d'aide
          </span>
          <h1 className="mt-4 text-4xl lg:text-5xl font-bold text-primary-slate">Foire aux questions</h1>
          <p className="mt-3 text-base text-font-secondary max-w-xl mx-auto">
            Trouvez les réponses aux questions les plus fréquentes sur l'utilisation de la plateforme InTerLUD+.
          </p>
          <a
            href="/EVALUD_Guide_Utilisateurs.pdf"
            download
            className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 bg-primary-green hover:bg-primary-green/90 text-white text-sm font-semibold rounded-md transition-colors"
          >
            <Download className="w-4 h-4" />
            Télécharger le guide utilisateur
          </a>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <aside className="lg:col-span-3">
            <div className="bg-white rounded-xl border border-gray-100 p-4 sticky top-6">
              <p className="text-xs font-semibold text-primary-green uppercase tracking-wider px-3 mb-3">Catégories</p>
              <nav className="flex flex-col gap-1">
                {FAQ_CATEGORIES.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => {
                      setActiveCategory(cat.id)
                      setOpenId(null)
                    }}
                    className={`relative text-left text-sm px-3 py-2.5 rounded-md transition-colors ${
                      activeCategory === cat.id ? "font-semibold text-primary-green bg-secondary-green/40" : "text-font-primary hover:bg-gray-50"
                    }`}
                  >
                    {activeCategory === cat.id && <span className="absolute left-0 top-2 bottom-2 w-1 bg-primary-green rounded-r" />}
                    {cat.label}
                  </button>
                ))}
              </nav>
            </div>
          </aside>

          <main className="lg:col-span-9 flex flex-col gap-3">
            {filteredFaq.map((item) => {
              const isOpen = openId === item.id
              return (
                <div
                  key={item.id}
                  id={item.id}
                  className={`bg-white rounded-xl border transition-all ${isOpen ? "border-primary-green shadow-sm" : "border-gray-100 hover:border-gray-200"}`}
                >
                  <button
                    onClick={() => setOpenId(isOpen ? null : item.id)}
                    className="w-full flex items-center justify-between gap-4 text-left px-5 py-4"
                  >
                    <span className={`text-base font-semibold ${isOpen ? "text-primary-green" : "text-primary-slate"}`}>{item.question}</span>
                    <span
                      className={`shrink-0 flex items-center justify-center w-7 h-7 rounded-full transition-colors ${
                        isOpen ? "bg-primary-green text-white" : "bg-gray-100 text-font-secondary"
                      }`}
                    >
                      <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                    </span>
                  </button>
                  {isOpen && (
                    <div className="px-5 pb-5 -mt-1">
                      <div className="border-t border-gray-100 pt-4 text-sm text-font-primary leading-relaxed">{item.answer}</div>
                    </div>
                  )}
                </div>
              )
            })}

            <div className="mt-6 bg-white rounded-xl border border-gray-100 p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="shrink-0 w-10 h-10 rounded-full bg-secondary-green flex items-center justify-center">
                  <Mail className="w-5 h-5 text-primary-green" />
                </div>
                <div>
                  <p className="font-semibold text-primary-slate">Vous n'avez pas trouvé votre réponse ?</p>
                  <p className="text-sm text-font-secondary mt-0.5">Notre équipe est disponible pour vous accompagner.</p>
                </div>
              </div>
              <Link
                to="/contact"
                className="shrink-0 inline-flex items-center gap-2 px-4 py-2 bg-primary-green hover:bg-primary-green/90 text-white text-sm font-semibold rounded-md transition-colors"
              >
                Nous contacter
              </Link>
            </div>
          </main>
        </div>
      </div>
    </div>
  )
}
