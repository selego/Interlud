import React, { useState, useEffect } from "react";
import { Routes, Route } from "react-router-dom";
import View from "./view";
import List from "./list";
import CompareActions from "./compare";
import ResultsHidden from "@/components/ResultsHidden";
import Loader from "@/components/loader";
import useStore from "@/services/store";
import { areResultsHidden } from "@/utils/results";

export default function Index() {
  const { user, collectivity } = useStore();
  // Tant que la collectivité du store n'est pas chargée, on ne sait pas si l'utilisateur y est acteur économique :
  // loader plutôt que le message « résultats masqués » (un acteur économique global reste masqué d'emblée)
  const compareElement = !collectivity && user?.role !== "economic_actor" ? <Loader /> : areResultsHidden(user, collectivity) ? <div className="p-8"><ResultsHidden /></div> : <CompareActions />;
  return (
    <Routes>
      {/* La comparaison affiche des résultats : refusée aux acteurs économiques (API comprise) */}
      <Route path="/compare" element={compareElement} />
      <Route path="/:id/*" element={<View />} />
      <Route path="/" element={<List />} />
    </Routes>
  );
}
