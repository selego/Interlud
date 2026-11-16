import React, { useState, useEffect } from "react";
import { Routes, Route } from "react-router-dom";
import View from "./view";
import List from "./list";
import CompareActions from "./compare";
import ResultsHidden from "@/components/ResultsHidden";
import useStore from "@/services/store";
import { areResultsHidden } from "@/utils/results";

export default function Index() {
  const { user, collectivity } = useStore();
  return (
    <Routes>
      {/* La comparaison affiche des résultats : refusée aux acteurs économiques (API comprise) */}
      <Route path="/compare" element={areResultsHidden(user, collectivity) ? <div className="p-8"><ResultsHidden /></div> : <CompareActions />} />
      <Route path="/:id/*" element={<View />} />
      <Route path="/" element={<List />} />
    </Routes>
  );
}
