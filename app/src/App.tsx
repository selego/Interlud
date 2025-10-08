import React, { useEffect } from "react";
import { BrowserRouter, Outlet, Route, useLocation, Routes } from "react-router-dom";
import { Toaster } from "react-hot-toast";

import Home from "@/scenes/home";
import Search from "@/scenes/search";
import SolutionDetail from "@/scenes/solution-detail";

import Layout from "@/components/Layout";

import { environment } from "@/config";
import { initSentry } from "./services/sentry";

const App = () => {
  if (environment === "production") initSentry();

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<UserLayout />}>
          <Route path="/" element={<Home />} />
          <Route path="/recherche" element={<Search />} />
          <Route path="/solution/:id" element={<SolutionDetail />} />
          <Route path="*" element={<Home />} />
        </Route>
      </Routes>
      <Toaster position="top-center" />
    </BrowserRouter>
  );
};

const UserLayout = () => {
  const location = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  return (
    <Layout>
      <Outlet />
    </Layout>
  );
};

export default App;
