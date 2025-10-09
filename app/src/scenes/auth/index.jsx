import React from "react"
import { Route, Routes } from "react-router-dom"

import Reset from "./reset"
import Forgot from "./forgot"
import Signin from "./signin"
import Signup from "./signup"

const Auth = () => {
  return (
    <Routes>
      <Route path="/" element={<Signin />} />
      <Route path="/reset" element={<Reset />} />
      <Route path="/forgot" element={<Forgot />} />
      <Route path="/signup" element={<Signup />} />
    </Routes>
  )
}

export default Auth
