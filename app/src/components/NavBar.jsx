import React, { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { AiOutlineHome } from "react-icons/ai"

import Logo from "@/assets/logo.svg"

const MENU = [{ title: "Home", to: "/home", logo: <AiOutlineHome className="h-6 w-6" /> }]

const Navbar = () => {
  const [selected, setSelected] = useState(0)

  useEffect(() => {
    const index = MENU.findIndex(e => location.pathname.includes(e.to))
    setSelected(index)
  }, [location])

  return (
    <div className="h-screen bg-primary">
      <div className="flex flex-col gap-5 justify-between p-2 pl-4">
        <img className="w-3/4 mt-5 mb-16 mr-5" alt="logo" src={Logo} />
        <div>
          {MENU.map((menu, index) => (
            <Link
              to={menu.to}
              key={menu.title}
              className={`w-full mb-3 px-3 py-3 rounded flex items-center ${selected === index ? "bg-white text-primary" : "text-white hover:bg-secondary hover:text-primary"}`}
              onClick={() => setSelected(index)}
            >
              {menu.logo}
              <p className="text-sm font-semibold text-center ml-3">{menu.title}</p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}

export default Navbar
