import { useEffect, useState } from "react"
import { BrowserRouter, Navigate, Outlet, Route, Routes, useNavigate, useSearchParams } from "react-router-dom"
import { Toaster } from "react-hot-toast"
import * as Sentry from "@sentry/browser"
import toast from "react-hot-toast"

import Auth from "@/scenes/auth"
import Home from "@/scenes/home"
import Actions from "@/scenes/actions"
import AdminAction from "@/scenes/admin/action"
import AdminCollectivity from "@/scenes/admin/collectivity"
import AdminIndicator from "@/scenes/admin/indicator"
import Collectivity from "@/scenes/collectivity"
import Settings from "@/scenes/settings"
import Notification from "@/scenes/notification"

import AdminUsers from "@/scenes/admin/users"
import AdminEconomicActors from "@/scenes/admin/economic-actors"
import NotFound from "@/scenes/not-found"
import Conditions from "@/scenes/confidentiality/conditions"
import Politique from "@/scenes/confidentiality/politique"
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
        <Route element={<PublicLayout />}>
          <Route path="/conditions" element={<Conditions />} />
          <Route path="/politique" element={<Politique />} />
          <Route path="/cgu" element={<Conditions />} />
          <Route path="/politique-de-confidentialite" element={<Politique />} />
        </Route>
        <Route element={<UserLayout />}>
          <Route path="/" element={<Home />} />
          <Route path="/actions/*" element={<Actions />} />
          <Route path="/notifications" element={<Notification />} />
          <Route path="/admin/users/*" element={<AdminUsers />} />
          <Route path="/recherche" element={<div>Page de recherche</div>} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/collectivity/*" element={<Collectivity />} />
          <Route path="/a-propos" element={<div>À propos</div>} />
          <Route path="/contact" element={<div>Contact</div>} />
          <Route path="/admin/action/*" element={<AdminAction />} />
          <Route path="/admin/collectivity/*" element={<AdminCollectivity />} />
          <Route path="/admin/indicator/*" element={<AdminIndicator />} />
          <Route path="/admin/economic-actors/*" element={<AdminEconomicActors />} />
        </Route>
        <Route path="*" element={<NotFound />} />
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

const PublicLayout = () => {
  return (
    <Layout>
      <Outlet />
    </Layout>
  )
}

const UserLayout = () => {
  const [loading, setLoading] = useState(true)
  const [searchParams, setSearchParams] = useSearchParams()
  const { user, setUser, setCollectivity, setEconomicActor } = useStore()
  
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
    if (!user) return
    const collectivityIdFromUrl = searchParams.get("collectivityId")
    const savedCollectivityId = localStorage.getItem("selectedCollectivityId")
    const collectivityId = collectivityIdFromUrl || savedCollectivityId
    
    if (!collectivityId) {
      const approvedCollectivities = user.collectivities?.filter((c) => c.status === "approved") || []
      if (approvedCollectivities.length > 0) {
        const firstCollectivityId = approvedCollectivities[0].id
        try {
          const { ok, data } = await api.get(`/collectivity/${firstCollectivityId}`)
          if (ok) {
            localStorage.setItem("selectedCollectivityId", firstCollectivityId)
            setCollectivity(data)
          }
        } catch (error) {
          console.error("Erreur lors de l'auto-sélection de la collectivité", error)
        }
      }
      return
    }
    
    try {
      const { ok, data, code } = await api.get(`/collectivity/${collectivityId}`)
      if (!ok) return toast.error(code || "Erreur lors de la récupération de la collectivité")
      
      if (collectivityIdFromUrl) {
        localStorage.setItem("selectedCollectivityId", collectivityIdFromUrl)
        setSearchParams({})
      }
      
      setCollectivity(data)
    } catch (error) {
      toast.error(error || "Erreur lors de la récupération de la collectivité")
    }
  }

  const loadEconomicActor = async () => {
    if (!user) return
    try {
      const { ok, data, code } = await api.get(`/economic_actor/${user.economic_actor_id}`)
      if (!ok) return toast.error(code || "Erreur lors de la récupération de l'acteur économique")
      setEconomicActor(data)
    } catch (error) {
      toast.error(error || "Erreur lors de la récupération de l'acteur économique")
    }
  }

  useEffect(() => {
    fetchUser()
  }, [])

  useEffect(() => {
    loadCollectivity()
    if (user && user?.role === "economic_actor") loadEconomicActor()
  }, [user, searchParams])

  if (loading) return <Loader />

  if (!user) return <Navigate to="/auth" replace={true} />

  return (
    <Layout>
      <Outlet />
    </Layout>
  )
}
