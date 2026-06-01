import React from "react"
import { Routes, Route } from "react-router-dom"

import List from "./list"

export default function Index() {
  return (
    <Routes>
      <Route path="/" element={<List />} />
    </Routes>
  )
}
