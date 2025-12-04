import React from "react"
import { Link } from "react-router-dom"

import ReactDOM from "react-dom/client"
import App from "./App"
import { startReactDsfr } from "@codegouvfr/react-dsfr/spa"
import "./index.css"

startReactDsfr({
  // defaultColorScheme: "system",
  defaultColorScheme: "light",
  Link
})

ReactDOM.createRoot(document.getElementById("root")).render(<App />)
