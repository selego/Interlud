import React from "react"
import { Routes, Route } from "react-router-dom"

import List from "./list"
import View from "./view"
import Join from "./join"

export default function Index() {
  return (
    <Routes>
      <Route path="/" element={<List />} />
      <Route path="/:id" element={<View />} />
      <Route path="/join" element={<Join />} />
    </Routes>
  )
}
