import React, { useState, useEffect, useRef } from "react";
import { Routes, Route, useParams } from "react-router-dom";
import api from "@/services/api";
import toast from "react-hot-toast";

import Dashboard from "./dashboard";
import ParentDashboard from "./parent-dashboard";
import Completion from "./completion/index";
import Settings from "./settings";
import ResultsHidden from "@/components/ResultsHidden";
import SirenMissingAlert from "@/components/SirenMissingAlert";
import useStore from "@/services/store";
import { areActionResultsHidden } from "@/utils/results";

export default function Index() {
  const { id } = useParams();
  const { user, collectivity } = useStore();
  const [action, setAction] = useState(null);
  const [errorCode, setErrorCode] = useState(null);
  // Numéro de visite : une réponse arrivée après un changement d'action (même un retour à la même action) est ignorée
  // L'identifiant est aussi vérifié : un rafraîchissement lancé par un écran de l'action précédente ne s'applique pas
  const visit = useRef({ id, count: 0 });
  const fetchAction = async () => {
    const requestVisit = visit.current;
    if (requestVisit.id !== id) return;
    try {
      const { ok, data, code } = await api.get(`/action/${id}`);
      if (visit.current !== requestVisit) return;
      if (!ok) {
        setErrorCode(code || "une erreur est survenue");
        return toast.error(code || "Une erreur est survenue");
      }
      setAction(data);
  } catch (error) {
      if (visit.current !== requestVisit) return;
      setErrorCode("une erreur est survenue");
      toast.error("Une erreur est survenue");
    }
  };
  useEffect(() => {
    visit.current = { id, count: visit.current.count + 1 };
    setAction(null);
    setErrorCode(null);
    fetchAction();
  }, [id]);

  // Action refusée ou introuvable : un message plutôt qu'un chargement sans fin
  if (!action && errorCode) return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-lg text-gray-600">
        Impossible d'ouvrir cette action : {errorCode}
      </div>
    </div>
  );

  if (!action) return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-lg text-gray-600">Chargement...</div>
    </div>
  );

  return (
    <>
    <SirenMissingAlert action={action} className="max-w-7xl mt-8 mx-8 xl:mx-auto" />
    <Routes>
      <Route path="/dashboard" element={<Dashboard action={action} />} />
      {/* Le tableau de bord de l'action parente affiche des résultats : un acteur économique n'y voit que ses propres remplissages (API comprise) */}
      {/* Une fiche du catalogue n'a pas de collectivité : on se base alors sur celle du store (celle que cible ParentDashboard) */}
      <Route
        path="/parent-dashboard"
        element={
          !action.collectivity_id && !collectivity && user?.role !== "economic_actor" ? (
            <div className="flex items-center justify-center min-h-screen">
              <div className="text-lg text-gray-600">Chargement...</div>
            </div>
          ) : areActionResultsHidden(user, action, action.collectivity_id || collectivity) ? (
            <div className="p-8">
              <ResultsHidden />
            </div>
          ) : (
            <ParentDashboard action={action} />
          )
        }
      />
      <Route path="/completion" element={<Completion action={action} onSave={fetchAction} />} />
      <Route path="/settings" element={<Settings action={action}  onSave={fetchAction}/>} />
    </Routes>
    </>
  );
}
