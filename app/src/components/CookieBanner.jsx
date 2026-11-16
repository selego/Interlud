import { useState } from "react"
import { Link } from "react-router-dom"

const STORAGE_KEY = "cookieBannerDismissed"

const isDismissed = () => {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1"
  } catch (e) {
    return false
  }
}

// Bandeau d'information : traceurs strictement nécessaires, pas de consentement à recueillir.
export default function CookieBanner() {
  const [visible, setVisible] = useState(() => !isDismissed())

  const close = () => {
    try {
      localStorage.setItem(STORAGE_KEY, "1")
    } catch (e) {
      // stockage indisponible : le bandeau est masqué pour cette visite seulement
    }
    setVisible(false)
  }

  if (!visible) return null

  return (
    <section
      role="region"
      aria-labelledby="cookie-banner-title"
      className="fixed bottom-4 left-4 right-24 sm:bottom-6 sm:left-6 sm:right-auto sm:max-w-md z-40 bg-white border border-gray-200 rounded-lg shadow-lg p-4 text-sm text-gray-800"
    >
      <div className="flex items-start justify-between gap-3">
        <h2 id="cookie-banner-title" className="text-base font-semibold text-gray-900 !mb-0">
          Cookies et authentification
        </h2>
        <button type="button" onClick={close} className="fr-btn fr-btn--tertiary-no-outline fr-btn--sm fr-icon-close-line fr-btn--icon-right shrink-0">
          Fermer
        </button>
      </div>
      <p className="mt-2 !mb-2 text-sm leading-relaxed">
        EVALUD utilise uniquement des traceurs techniques strictement nécessaires au fonctionnement et à la sécurité de la Plateforme, notamment afin de permettre et de
        sécuriser l'authentification des Utilisateurs.
      </p>
      <p className="!mb-2 text-sm leading-relaxed">Ces traceurs ne sont utilisés ni à des fins publicitaires ni à des fins de profilage.</p>
      <Link to="/politique-de-confidentialite" className="fr-link fr-link--sm">
        En savoir plus
      </Link>
    </section>
  )
}
