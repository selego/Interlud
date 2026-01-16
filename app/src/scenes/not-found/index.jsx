
import { useNavigate } from "react-router-dom"

export default function NotFound() {
  const navigate = useNavigate()
  return (
    <div className="relative overflow-hiddens flex items-center justify-center py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <h1 className="text-[120px] font-bold text-primary-green leading-none">404</h1>
          <h2 className="text-3xl font-bold text-gray-900 mb-2 mt-4">Page introuvable</h2>
          <p className="text-sm text-gray-600">La page que vous recherchez n'existe pas ou a été déplacée.</p>
        </div>

        <div className="bg-white card-shadow p-8 space-y-6">
          <div className="text-center space-y-4">
            <div className="w-16 h-16 mx-auto bg-secondary-green rounded-full flex items-center justify-center">
              <svg className="w-8 h-8 text-primary-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="text-gray-600">
              Oups ! Cette page semble avoir disparu.
            </p>
          </div>

          <button onClick={() => navigate("/")} className="button-primary w-full block text-center">
            Retour à l'accueil
          </button>
        </div>

        <div className="bg-blue-50 border-l-4 border-secondary-green rounded-lg p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-primary-green" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm text-primary-green">Vérifiez l'URL ou utilisez la navigation pour trouver ce que vous cherchez.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
