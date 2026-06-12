import React, { useState } from "react"
import queryString from "query-string"
import toast from "react-hot-toast"
import { useNavigate, useLocation, Link } from "react-router-dom"

import LoadingButton from "@/components/loadingButton"

import api from "@/services/api"

export default () => {
  const [values, setValues] = useState({ password: "", password1: "" })

  const navigate = useNavigate()
  const location = useLocation()

  const send = async () => {
    try {
      const { token } = queryString.parse(location.search)
      const res = await api.post("/user/forgot_password_reset", { ...values, token })
      if (!res.ok) throw res
      toast.success("Mot de passe réinitialisé avec succès !")
      navigate("/")
    } catch (e) {
      toast.error(`Erreur lors de la réinitialisation du mot de passe : ${e && e.code}`)
    }
  }

  return (
    <div className="relative overflow-hidden flex items-center justify-center py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <h2 className="text-3xl font-bold text-gray-900 mb-2">Nouveau mot de passe</h2>
          <p className="text-sm text-gray-600">Choisissez un nouveau mot de passe pour votre espace InTerLUD+</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-8 space-y-6">
          <form
            onSubmit={(e) => {
              e.preventDefault()
              send()
            }}
          >
            <div className="border border-gray-200 bg-gray-50 text-gray-500 text-sm p-3 rounded-lg mb-6">
              Format : minimum 6 caractères, dont au moins une lettre.
            </div>

            <div className="mb-6">
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                Nouveau mot de passe
              </label>
              <input
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-green focus:border-transparent transition-all"
                name="password"
                type="password"
                id="password"
                value={values.password}
                onChange={(e) => setValues({ ...values, password: e.target.value })}
                placeholder="••••••••"
                required
              />
            </div>

            <div className="mb-6">
              <label htmlFor="password1" className="block text-sm font-medium text-gray-700 mb-2">
                Confirmer le mot de passe
              </label>
              <input
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-green focus:border-transparent transition-all"
                name="password1"
                type="password"
                id="password1"
                value={values.password1}
                onChange={(e) => setValues({ ...values, password1: e.target.value })}
                placeholder="••••••••"
                required
              />
            </div>

            <LoadingButton className="button-primary w-full" type="submit">
              Réinitialiser
            </LoadingButton>

            <div className="text-center mt-6">
              <Link to="/auth" className="text-sm text-primary-green hover:text-primary-green font-medium transition-colors">
                Retour à la connexion
              </Link>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
