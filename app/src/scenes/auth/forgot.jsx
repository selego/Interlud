import React, { useState } from "react"
import { Link } from "react-router-dom"
import validator from "validator"
import toast from "react-hot-toast"

import LoadingButton from "@/components/loadingButton"

import api from "@/services/api"

export default () => {
  const [done, setDone] = useState(false)
  const [email, setEmail] = useState("")

  const send = async () => {
    try {
      if (!validator.isEmail(email)) return toast.error("Adresse e-mail invalide")
      const { ok, code } = await api.post("/user/forgot_password", { email })
      if (!ok) return toast.error(code || "Une erreur est survenue")
      toast.success("E-mail envoyé !")
      setDone(true)
    } catch (error) {
      toast.error(error.code || "Une erreur est survenue")
    }
  }

  return (
    <div className="relative overflow-hidden flex items-center justify-center py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <h2 className="text-3xl font-bold text-gray-900 mb-2">Mot de passe oublié</h2>
          <p className="text-sm text-gray-600">Réinitialisez l'accès à votre espace InTerLUD+</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-8 space-y-6">
          {done ? (
            <div className="text-center space-y-4">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
                <svg className="h-6 w-6 text-primary-green" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-sm text-gray-600">
                Un lien de réinitialisation a été envoyé à votre adresse e-mail. Consultez votre boîte de réception et suivez le lien pour
                définir un nouveau mot de passe.
              </p>
              <Link to="/auth" className="inline-block text-sm text-primary-green hover:text-primary-green font-medium transition-colors">
                Retour à la connexion
              </Link>
            </div>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault()
                send()
              }}
            >
              <p className="text-sm text-gray-600 mb-6">Entrez votre adresse e-mail ci-dessous pour recevoir le lien de réinitialisation.</p>

              <div className="mb-6">
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                  Adresse e-mail
                </label>
                <input
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-green focus:border-transparent transition-all"
                  name="email"
                  type="email"
                  id="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="votre@email.fr"
                  required
                />
              </div>

              <LoadingButton className="button-primary w-full" type="submit">
                Envoyer le lien
              </LoadingButton>

              <div className="text-center mt-6">
                <Link to="/auth" className="text-sm text-primary-green hover:text-primary-green font-medium transition-colors">
                  Retour à la connexion
                </Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
