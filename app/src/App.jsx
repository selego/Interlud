import { useEffect, useState } from "react"
import { BrowserRouter, Navigate, Outlet, Route, Routes } from "react-router-dom"
import { Toaster } from "react-hot-toast"
import * as Sentry from "@sentry/browser"

import Auth from "@/scenes/auth"
import Home from "@/scenes/home"
import Action from "@/scenes/action"
// import Test from "@/scenes/test"
import SuperAdminAction from "@/scenes/super_admin/action"
import SuperAdminCollectivity from "@/scenes/super_admin/collectivity"
import SuperAdminIndicator from "@/scenes/super_admin/indicator"

import AdminUsers from "@/scenes/super_admin/users"
import Layout from "@/components/Layout"
import Loader from "@/components/loader"

import useStore from "@/services/store"
import api from "@/services/api"

import { environment, SENTRY_URL } from "./config"

if (environment === "production") {
  Sentry.init({ dsn: SENTRY_URL, environment: "app" })
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AuthLayout />}>
          <Route path="/auth/*" element={<Auth />} />
        </Route>
        <Route element={<UserLayout />}>
          <Route path="/" element={<Home />} />
          <Route path="/action/:id/*" element={<Action />} />
          <Route path="/admin/users/*" element={<AdminUsers />} />
          <Route path="/recherche" element={<div>Page de recherche</div>} />
          {/* <Route path="/test" element={<Test />} /> */}
          <Route path="/a-propos" element={<div>À propos</div>} />
          <Route path="/contact" element={<div>Contact</div>} />
          <Route path="/cgu" element={<div>CGU</div>} />
          <Route path="/politique-de-confidentialite" element={<div>Politique de confidentialité</div>} />
          <Route path="/politique-des-cookies" element={<div>Politique des cookies</div>} />
          <Route path="/mentions-legales" element={<div>Mentions légales</div>} />
          <Route path="/admin/action/*" element={<SuperAdminAction />} />
          <Route path="/admin/collectivity/*" element={<SuperAdminCollectivity />} />
          <Route path="/admin/indicator/*" element={<SuperAdminIndicator />} />
        </Route>
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
      <Toaster position="top-center" />
    </BrowserRouter>
  )
}

const AuthLayout = () => {
  const { user } = useStore()
  if (user) return <Navigate to="/" replace={true} />
  return (
    <Layout>
      <Outlet />
    </Layout>
  )
}

const UserLayout = () => {
  const [loading, setLoading] = useState(true)
  const { user, setUser } = useStore()

  async function fetchUser() {
    try {
      const { ok, token, user } = await api.get("/user/signin_token")
      if (!ok) {
        setUser(null)
        return
      }
      api.setToken(token)
      setUser(user)
    } catch (e) {
      console.log(e)
      setUser(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchUser()
  }, [])

  if (loading) return <Loader />

  if (!user) return <Navigate to="/auth" replace={true} />

  return (
    <Layout>
      <Outlet />
    </Layout>
  )
}
