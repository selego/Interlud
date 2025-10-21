import { useEffect, useState } from "react"
import { BrowserRouter, Navigate, Outlet, Route, Routes } from "react-router-dom"
import { Toaster } from "react-hot-toast"
import * as Sentry from "@sentry/browser"
import toast from "react-hot-toast"

import Auth from "@/scenes/auth"
import Home from "@/scenes/home"
import Actions from "@/scenes/actions"
// import Test from "@/scenes/test"
import AdminAction from "@/scenes/admin/action"
import AdminCollectivity from "@/scenes/admin/collectivity"
import AdminIndicator from "@/scenes/admin/indicator"

import AdminUsers from "@/scenes/admin/users"
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
          <Route path="/actions/*" element={<Actions />} />
          <Route path="/admin/users/*" element={<AdminUsers />} />
          <Route path="/recherche" element={<div>Page de recherche</div>} />
          {/* <Route path="/test" element={<Test />} /> */}
          <Route path="/a-propos" element={<div>À propos</div>} />
          <Route path="/contact" element={<div>Contact</div>} />
          <Route path="/cgu" element={<div>CGU</div>} />
          <Route path="/politique-de-confidentialite" element={<div>Politique de confidentialité</div>} />
          <Route path="/politique-des-cookies" element={<div>Politique des cookies</div>} />
          <Route path="/mentions-legales" element={<div>Mentions légales</div>} />
          <Route path="/admin/action/*" element={<AdminAction />} />
          <Route path="/admin/collectivity/*" element={<AdminCollectivity />} />
          <Route path="/admin/indicator/*" element={<AdminIndicator />} />
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
  const { user, setUser, setCollectivity } = useStore()

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

  const loadCollectivity = async () => {
    const savedCollectivityId = localStorage.getItem('selectedCollectivityId');
    if (!savedCollectivityId) return;
    try {
      const { ok, data, code } = await api.get(`/collectivity/${savedCollectivityId}`);
      if (!ok) return toast.error(code || "Erreur lors de la récupération de la collectivité");  
      setCollectivity(data);
    } catch (error) {
      toast.error(error || "Erreur lors de la récupération de la collectivité");
    }
  }

  useEffect(() => {
    loadCollectivity()
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
