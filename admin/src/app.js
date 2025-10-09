import React, { useEffect, useState } from "react";
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import { Toaster } from "react-hot-toast";
import * as Sentry from "@sentry/browser";

import Loader from "./components/Loader";
import Layout from "./components/Layout";

import Auth from "./scenes/auth";
import Account from "./scenes/account";
import Dasboard from "./scenes/dasboard";
import User from "./scenes/user";

import api from "./services/api";
import useStore from "./store";
import { ENVIRONMENT, SENTRY_URL } from "./config";

import "./index.css";

if (ENVIRONMENT === "production" && SENTRY_URL) Sentry.init({ dsn: SENTRY_URL, environment: "admin" });

export default function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <Routes>
        <Route element={<AuthLayout />}>
          <Route path="/auth/*" element={<Auth />} />
        </Route>

        <Route element={<UserLayout />}>
          <Route path="/" element={<Dasboard />} />
          <Route path="/user/*" element={<User />} />
          <Route path="/account" element={<Account />} />
        </Route>
        <Route path='*' element={<Navigate to='/' />} />

      </Routes>
      <Toaster position="top-center" />
    </BrowserRouter>
  );
};

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return null;
}

const AuthLayout = () => {
  const { user } = useStore()
  if (user) return <Navigate to='/' replace={true} />
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <Outlet />
    </div>
  )
}

const UserLayout = () => {
  const [loading, setLoading] = useState(true);
  const { user, setUser } = useStore()

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    try {
      const  { ok, token, user } = await api.get("/admin/user/signin_token");
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

  if (loading) return <Loader />;

  if (!user) return <Navigate to='/auth' replace={true} />

  return (
    <main className='flex flex-col min-h-dvh overflow-hidden bg-gray-50'>
      <Layout /> {/* Barre de navigation en haut */}
      <div className='flex flex-1 h-full'>
        <div className='w-48'>{/* Espace pour la barre latérale */}</div>
        <section className='flex-1 p-4'>
          <Outlet />
        </section>
      </div>
    </main>
  )
}


