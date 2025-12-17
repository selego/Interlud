import { useState, useEffect } from "react"
import validator from "validator"
import { Link, Navigate, useSearchParams, useNavigate } from "react-router-dom"
import toast from "react-hot-toast"

import store from "@/services/store"
import api from "@/services/api"
import Loader from "@/components/loader"

const Invite = () => {
  const [values, setValues] = useState({ email: "", password: "", first_name: "", last_name: "" })
  const [errors, setErrors] = useState({ email: "", password: "", first_name: "", last_name: "" })
  const [invalidToken, setInvalidToken] = useState(false)
  const [loading, setLoading] = useState(false)
  const [searchParams] = useSearchParams()
  const { user, setUser } = store()
  const navigate = useNavigate()
  const redirect = searchParams.get("redirect")
  const inviteToken = searchParams.get("token")

  async function getUser() {
    try {
      const { ok, user, code } = await api.post("/user/check-invitation-token", { invitation_token: inviteToken })
      if (!ok) throw new Error(code)
      setValues({ ...values, email: user.email })
    } catch (error) {
      console.error(error)
      toast.error("Invalid or expired invitation token")
      setInvalidToken(true)
    }
  }

  useEffect(() => {
    if (inviteToken) getUser()
  }, [inviteToken])

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (!values.email) return setErrors({ ...errors, email: "Ce champ est requis" })
    if (!values.password) return setErrors({ ...errors, password: "Ce champ est requis" })
    if (!values.first_name) return setErrors({ ...errors, first_name: "Ce champ est requis" })
    if (!values.last_name) return setErrors({ ...errors, last_name: "Ce champ est requis" })
    if (!validator.isEmail(values?.email)) return toast.error("Adresse e-mail invalide")

    setLoading(true)
    try {
      const data = { ...values, name: `${values.first_name} ${values.last_name}`, invitation_token: inviteToken }
      delete data.first_name
      delete data.last_name

      const { ok, data: user, token, code } = await api.post("/user/invite-accepted", data)
      if (!ok) return toast.error(code || "Une erreur est survenue")
      if (token) api.setToken(token)
      if (user) {
        setUser(user)
        toast.success("Votre compte a été créé avec succès !")
        if (redirect) navigate(redirect)
        else navigate("/")
      }
    } catch (error) {
      console.log("✌️  error", error)
      if (error.code === "USER_ALREADY_REGISTERED") return toast.error("Cette adresse e-mail est déjà enregistrée.\nEssayez de vous connecter.")
      toast.error("Erreur lors de la création du compte")
    }
    setLoading(false)
  }

  if (user) return <Navigate to={"/"} />

  if (!redirect && invalidToken) {
    toast.error("Lien d'invitation invalide")
    return (
      <div className="relative overflow-hidden flex items-center justify-center py-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-lg w-full space-y-8">
          <div className="text-center">
            <h2 className="text-3xl font-bold text-gray-900 mb-2">Invitation</h2>
            <p className="text-sm text-gray-600">Rejoignez InTerLUD+</p>
          </div>

          <div className="bg-white rounded-2xl shadow-xl p-8 space-y-6">
            <div className="text-center">
              <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 mb-4">
                <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">Lien d'invitation invalide</h3>
              <p className="text-sm text-gray-600">Le lien d'invitation que vous avez utilisé n'est pas valide ou a expiré.</p>
              <p className="text-sm text-gray-600 mt-2">Veuillez contacter l'administrateur pour obtenir un nouveau lien.</p>
            </div>

            <div className="text-center pt-4">
              <Link className="text-primary-green hover:text-primary-green font-medium transition-colors" to="/auth">
                Retour à la connexion
              </Link>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="relative overflow-hidden flex items-center justify-center py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <h2 className="text-3xl font-bold text-gray-900 mb-2">Invitation InTerLUD+</h2>
          <p className="text-sm text-gray-600">Complétez votre inscription pour commencer</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-8 space-y-6">
          <form onSubmit={handleSubmit}>
            <div className="flex gap-4">
              <div className="mb-6">
                <label htmlFor="last_name" className="block text-sm font-medium text-gray-700 mb-2">
                  Nom <span className="text-red-500">*</span>
                </label>
                <input
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-green focus:border-transparent transition-all"
                  name="last_name"
                  type="text"
                  id="last_name"
                  value={values.last_name}
                  onChange={(e) => setValues({ ...values, last_name: e.target.value })}
                  placeholder="Votre nom"
                  required
                />
                {errors.last_name && <p className="text-sm text-red-500 mt-1">{errors.last_name}</p>}
              </div>
              <div className="mb-6">
                <label htmlFor="first_name" className="block text-sm font-medium text-gray-700 mb-2">
                  Prénom <span className="text-red-500">*</span>
                </label>
                <input
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-green focus:border-transparent transition-all"
                  name="first_name"
                  type="text"
                  id="first_name"
                  value={values.first_name}
                  onChange={(e) => setValues({ ...values, first_name: e.target.value })}
                  placeholder="Votre prénom"
                  required
                />
                {errors.first_name && <p className="text-sm text-red-500 mt-1">{errors.first_name}</p>}
              </div>
            </div>

            <div className="mb-6">
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                Adresse e-mail <span className="text-red-500">*</span>
              </label>
              <input
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-green focus:border-transparent transition-all disabled:bg-gray-100 disabled:cursor-not-allowed"
                name="email"
                type="email"
                id="email"
                value={values.email}
                onChange={(e) => setValues({ ...values, email: e.target.value })}
                placeholder="votre@email.fr"
                disabled
                required
              />
              {errors.email && <p className="text-sm text-red-500 mt-1">{errors.email}</p>}
            </div>

            <div className="mb-6">
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                Mot de passe <span className="text-red-500">*</span>
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
              {errors.password && <p className="text-sm text-red-500 mt-1">{errors.password}</p>}
            </div>

            <button type="submit" className="button-primary w-full" disabled={loading}>
              {loading ? <Loader size="small" color="white" /> : "Créer mon compte"}
            </button>
          </form>

          {!inviteToken && (
            <>
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
                  Vous avez déjà un compte ? &nbsp;
                  <Link className="text-primary-green hover:text-primary-green font-medium transition-colors" to="/auth">
                    Se connecter
                  </Link>
                </p>
              </div>
            </>
          )}
        </div>

        <div className="bg-blue-50 border-l-4 border-secondary-green rounded-lg p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-secondary-green" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm text-primary-green">Vous avez été invité à rejoindre InTerLUD+. Complétez votre profil pour accéder à la plateforme.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Invite
