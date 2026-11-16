import React, { useState, useEffect } from "react";
import { Routes, Route } from "react-router-dom";
import View from "./view";
import List from "./list";
import CompareActions from "./compare";
import ResultsHidden from "@/components/ResultsHidden";
import useStore from "@/services/store";

export default function Index() {
  const { user } = useStore();
  return (
    <Routes>
      {/* La comparaison affiche des résultats : refusée aux acteurs économiques (API comprise) */}
      <Route path="/compare" element={user.role === "economic_actor" ? <div className="p-8"><ResultsHidden /></div> : <CompareActions />} />
      <Route path="/:id/*" element={<View />} />
      <Route path="/" element={<List />} />
    </Routes>
  );
}
