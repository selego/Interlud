import React, { useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import store from "@/services/store"
import toast from "react-hot-toast"
import api from "@/services/api"

export default () => {
  const [values, setValues] = useState({ email: "admin@selego.co", password: "abc123$$" })
  const { user, setUser } = store()
  const navigate = useNavigate()

  const login = async () => {
    try {
      const { user, token } = await api.post(`/user/signin`, values)
      if (token) api.setToken(token)
      if (user) setUser(user)
    } catch (e) {
      console.log("e", e)
      toast.error(e.code)
    }
  }

  if (user) navigate("/")

  return (
      <div className="min-h-[calc(100vh-300px)] flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-blue-50 to-green-50">
        <div className="max-w-md w-full space-y-8">
          <div className="text-center">
            <h2 className="text-3xl font-bold text-gray-900 mb-2">
              Connexion
            </h2>
            <p className="text-sm text-gray-600">
              Accédez à votre espace InTerLUD+
            </p>
          </div>

          <div className="bg-white rounded-2xl shadow-xl p-8 space-y-6">
            <form onSubmit={(e) => { e.preventDefault(); login()}}>
              <div className="mb-6">
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                  Adresse e-mail
                </label>
                <input
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  name="email"
                  type="email"
                  id="email"
                  value={values.email}
                  onChange={e => setValues({ ...values, email: e.target.value })}
                  placeholder="votre@email.fr"
                  required
                />
              </div>

              <div className="mb-4">
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                  Mot de passe
                </label>
                <input
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  name="password"
                  type="password"
                  id="password"
                  value={values.password}
                  onChange={e => setValues({ ...values, password: e.target.value })}
                  placeholder="••••••••"
                  required
                />
              </div>

              <div className="text-right mb-6">
                <Link 
                  to="/auth/forgot" 
                  className="text-sm text-blue-600 hover:text-blue-700 hover:underline transition-colors"
                >
                  Mot de passe oublié ?
                </Link>
              </div>

              <button
                className="w-full bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-medium rounded-lg px-6 py-3 transition-all duration-200 transform hover:scale-[1.02] shadow-md hover:shadow-lg"
                onClick={login}
              >
                Se connecter
              </button>
            </form>

            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white text-gray-500">Ou</span>
              </div>
            </div>

            <div className="text-center">
              <p className="text-sm text-gray-600">
                Vous n'avez pas encore de compte ?
                <Link 
                  className="text-blue-600 hover:text-blue-700 font-medium hover:underline transition-colors" 
                  to="/auth/signup"
                >
                  Créer un compte
                </Link>
              </p>
            </div>
          </div>

          <div className="bg-blue-50 border-l-4 border-blue-600 rounded-lg p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-sm text-blue-700">
                  Accédez aux outils et ressources pour la logistique urbaine durable
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
  )
}
