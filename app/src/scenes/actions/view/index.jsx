import React, { useState, useEffect } from "react";
import { Routes, Route, useParams } from "react-router-dom";
import api from "@/services/api";
import toast from "react-hot-toast";

import Dashboard from "./dashboard";
import ParentDashboard from "./parent-dashboard";
import Completion from "./completion/index";
import Settings from "./settings";
import ResultsHidden from "@/components/ResultsHidden";
import useStore from "@/services/store";
import { areResultsHidden } from "@/utils/results";

export default function Index() {
  const { id } = useParams();
  const { user } = useStore();
  const [action, setAction] = useState(null);
  const fetchAction = async () => {
    try {
      const { ok, data, code } = await api.get(`/action/${id}`);
      if (!ok) return toast.error(code || "Une erreur est survenue");
      setAction(data);
  } catch (error) {
      toast.error("Une erreur est survenue");
    }
  };
  useEffect(() => {
    fetchAction();
  }, [id]);

  if (!action) return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-lg text-gray-600">Chargement...</div>
    </div>
  );

  return (
    <Routes>
      <Route path="/dashboard" element={<Dashboard action={action} />} />
      {/* Le tableau de bord de l'action parente affiche des résultats : refusé aux acteurs économiques (API comprise) */}
      <Route path="/parent-dashboard" element={areResultsHidden(user, action.collectivity_id) ? <div className="p-8"><ResultsHidden /></div> : <ParentDashboard action={action} />} />
      <Route path="/completion" element={<Completion action={action} onSave={fetchAction} />} />
      <Route path="/settings" element={<Settings action={action}  onSave={fetchAction}/>} />
    </Routes>
  );
}
