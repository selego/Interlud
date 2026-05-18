import React, { useState } from "react"
import { Link } from "react-router-dom"
import { HelpCircle, ChevronDown, ArrowRight, X } from "lucide-react"
import { FAQ } from "@/scenes/faq/data"

export default function FaqWidget() {
  const [open, setOpen] = useState(false)
  const [openId, setOpenId] = useState(null)

  return (
    <div className="fixed bottom-6 right-6 z-50 w-14 h-14">
      {open && (
        <div className="absolute bottom-[72px] right-0 w-[360px] max-w-[calc(100vw-3rem)] bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden flex flex-col" style={{ maxHeight: "70vh" }}>
          <div className="flex items-center justify-between px-4 py-3 bg-primary-green text-white">
            <div>
              <p className="font-semibold text-sm">Besoin d'aide ?</p>
              <p className="text-xs opacity-90">Questions fréquentes</p>
            </div>
            <button onClick={() => setOpen(false)} className="hover:bg-white/10 rounded p-1 transition-colors" aria-label="Fermer">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="overflow-y-auto divide-y divide-gray-100">
            {FAQ.filter((q) => q.featured).map((item) => (
              <div key={item.id}>
                <button onClick={() => setOpenId(openId === item.id ? null : item.id)} className="w-full flex items-start justify-between gap-2 text-left px-4 py-3 hover:bg-gray-50 transition-colors">
                  <span className="text-sm font-medium text-gray-800">{item.question}</span>
                  <ChevronDown className={`w-4 h-4 text-gray-400 shrink-0 mt-0.5 transition-transform ${openId === item.id ? "rotate-180" : ""}`} />
                </button>
                {openId === item.id && <div className="px-4 pb-3 text-sm text-gray-600 leading-relaxed">{item.answer}</div>}
              </div>
            ))}
          </div>

          <Link
            to="/faq"
            onClick={() => setOpen(false)}
            className="flex items-center justify-center gap-2 px-4 py-3 bg-gray-50 hover:bg-gray-100 text-sm font-medium text-primary-green border-t border-gray-200 transition-colors"
          >
            Voir toutes les questions
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      )}

      <button
        onClick={() => setOpen(!open)}
        className="bg-primary-green hover:bg-primary-green/90 text-white rounded-full shadow-lg w-14 h-14 flex items-center justify-center transition-colors"
        aria-label={open ? "Fermer la FAQ" : "Ouvrir la FAQ"}
      >
        <HelpCircle className="w-6 h-6" />
      </button>
    </div>
  )
}
