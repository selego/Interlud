import React from "react";
import { Routes, Route } from "react-router-dom";

import List from "./list";
import View from "./view";

export default function Index() {
  return (
    <Routes>
      <Route path="/" element={<List />} />
      <Route path="/:id" element={<View />} />
    </Routes>
  );
}
