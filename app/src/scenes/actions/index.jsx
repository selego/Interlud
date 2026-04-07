import React, { useState, useEffect } from "react";
import { Routes, Route } from "react-router-dom";
import View from "./view";
import List from "./list";
import CompareActions from "./compare";

export default function Index() {
  return (
    <Routes>
      <Route path="/compare" element={<CompareActions />} />
      <Route path="/:id/*" element={<View />} />
      <Route path="/" element={<List />} />
    </Routes>
  );
}
