import React from "react"
import { Routes, Route } from "react-router-dom"

import List from "./list"
import View from "./view"
import Answers from "./answers"

export default function Index() {
  return (
    <Routes>
      <Route path="/" element={<List />} />
      <Route path="/answers" element={<Answers />} />
      <Route path="/:id" element={<View />} />
    </Routes>
  )
}
