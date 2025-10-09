import { useEffect, useState } from "react"
import { BrowserRouter, Navigate, Outlet, Route, Routes } from "react-router-dom"
import { Toaster } from "react-hot-toast"
import * as Sentry from "@sentry/browser"

import Auth from "@/scenes/auth"
import Home from "@/scenes/home"

import Navbar from "@/components/NavBar"
import TopBar from "@/components/TopBar"
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
    <div className="flex flex-col justify-center items-center gap-8 w-screen h-screen">
      <h1 className="text-3xl font-bold">Boilerplate</h1>
      <Outlet />
    </div>
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
    <div className="flex flex-col h-screen overflow-hidden lg:flex-row">
      <nav className="w-56 absolute left-0 top-0">
        <Navbar />
      </nav>
      <main className="ml-56 h-full w-full overflow-auto bg-gray-50">
        <div className="h-14 border-b border-secondary bg-white">
          <TopBar />
        </div>
        <Outlet />
      </main>
    </div>
  )
}
