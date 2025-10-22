import React, { useState, useEffect } from "react";
import { Routes, Route } from "react-router-dom";
import View from "./view";
import List from "./list";

export default function Index() {
  return (
    <Routes>
      <Route path="/:id/*" element={<View />} />
      <Route path="/" element={<List />} />
    </Routes>
  );
}
