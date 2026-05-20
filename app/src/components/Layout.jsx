import React from "react"
import background_element from "@/assets/background_element.png"
import Logo from "@/assets/primary_logo.png"
import FullBanner from "@/assets/Bandeau-complet-BAT.svg"
import Header from "@/components/header"
import { createConsentManagement } from "@codegouvfr/react-dsfr/consentManagement"
import { Link } from "react-router-dom"

export const { ConsentBannerAndConsentManagement, FooterConsentManagementItem, FooterPersonalDataPolicyItem, useConsent } = createConsentManagement({
  finalityDescription: {
    matomo: {
      title: "Matomo",
      description: "Outil d'analyse comportementale des utilisateurs."
    },
    tally: {
      title: "Tally",
      description: "Hébergement de formulaires."
    }
  },
  personalDataPolicyLinkProps: {
    href: "/politique-de-confidentialite#cookies"
  }
})

export default function Layout({ children }) {
  return (
    <div className="flex flex-col min-h-screen">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:px-4 focus:py-2 focus:bg-primary-green focus:text-white focus:rounded-md focus:shadow-lg"
      >
        Aller au contenu principal
      </a>
      <div className="relative z-50">
        <Header />
      </div>

      <main className="flex-1 bg-white relative" id="main" tabIndex={-1}>
        <div className="fixed w-1/2 h-3/5 pointer-events-none z-0" style={{ right: "-200px", top: "-100px" }}>
          <img src={background_element} alt="" className="w-full h-full object-contain" />
        </div>

        <div className="fixed bottom-[150px] w-1/3 h-1/3 pointer-events-none z-0" style={{ left: "-200px" }}>
          <img src={background_element} alt="" className="w-full h-full object-contain transform rotate-180" />
        </div>

        <div className="fixed w-1/3 h-1/3 right-[180px] pointer-events-none z-0" style={{ bottom: "-250px" }}>
          <img src={background_element} alt="" className="w-full h-full object-contain transform rotate-180" />
        </div>

        <div className="relative z-10">{children}</div>
      </main>

      <footer className="bg-gray-50 border border-primary backdrop-blur-sm w-full mt-16">
        <div className="max-w-7xl mx-auto px-6 py-8">
          {/* Section principale */}
          <div className="grid grid-cols-1 md:grid-cols-6 gap-8 mb-8">
            {/* Logo et description */}
            <div className="col-span-4 flex-shrink-0 max-w-2xl">
              <img src={Logo} alt="Logo InTerLUD" className="h-10 mb-4" />
              <p className="text-md font-bold text-gray-600 ml-2">À propos</p>
              <p className="text-sm text-gray-600 leading-relaxed ml-2">
                Le Programme Interlud+ vise le déploiement, par les collectivités territoriales et les acteurs économiques, d’actions volontaires sur le transport de marchandises
                en ville dans le cadre des chartes de logistique urbaine durable sur l’ensemble du territoire français. Le site interlud.green fait partie des outils numériques
                d’intérêt général développés par Interlud+.
              </p>
            </div>

            {/* Navigation */}
            <nav className="col-span-2 flex-shrink-0 flex items-center">
              <div className="flex flex-col gap-y-2 items-start">
                <Link to="/contact" className="text-sm text-gray-700 hover:text-primary-green hover:underline underline-offset-4 transition-colors">
                  Contactez-nous
                </Link>
                <Link to="/cgu" className="text-sm text-gray-700 hover:text-primary-green hover:underline underline-offset-4 transition-colors">
                  Mentions légales
                </Link>
                <Link to="/politique-de-confidentialite" className="text-sm text-gray-700 hover:text-primary-green hover:underline underline-offset-4 transition-colors">
                  Politique de confidentialité
                </Link>
                <a
                  href="https://github.com/selego/Interlud"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-gray-700 hover:text-primary-green hover:underline underline-offset-4 transition-colors"
                >
                  Code source (GitHub)
                </a>
              </div>
            </nav>
          </div>

          {/* Séparateur */}
          <div className="h-px bg-gray-200/70 mb-6" />

          {/* Copyright */}
          <div className="flex flex-col md:flex-row justify-between items-center gap-4 text-xs text-gray-500">
            <p className="text-center text-sm">© 2026 Interlud+ · Tous droits réservés</p>
          </div>
        </div>
      </footer>

      {/* Porteurs du projet */}
      <div className="bg-white max-w-7xl mx-auto pt-4 pb-3 md:pt-6 md:pb-7">
        <img src={FullBanner} alt="Full Banner" className="w-full h-full object-contain" />
      </div>
    </div>
  )
}
