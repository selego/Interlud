import React, { Fragment } from "react"
import { useNavigate } from "react-router-dom"
import { Menu, Transition } from "@headlessui/react"
import { TbLogout } from "react-icons/tb"

import useStore from "@/services/store"
import api from "@/services/api"

const TopBar = () => {
  return (
    <div className="w-full h-full flex items-center justify-end px-4">
      <ProfileMenu />
    </div>
  )
}

const ProfileMenu = () => {
  const { user, setUser } = useStore()
  const navigate = useNavigate()

  const handleLogout = async () => {
    setUser(null)
    api.removeToken()
    navigate("/auth")
  }

  return (
    <Menu as="div" className="relative flex items-center">
      <Menu.Button>
        {user.avatar ? (
          <img className="h-10 w-10 rounded-full border border-secondary object-contain" src={user.avatar} alt="" />
        ) : (
          <span className="h-10 w-10 rounded-full border border-secondary bg-white flex items-center justify-center uppercase font-bold text-gray-800 text-sm">
            {user.first_name[0]}
            {user.last_name[0]}
          </span>
        )}
      </Menu.Button>

      <Transition
        as={Fragment}
        enter="transition ease-out duration-100"
        enterFrom="transform opacity-0 scale-95"
        enterTo="transform opacity-100 scale-100"
        leave="transition ease-in duration-75"
        leaveFrom="transform opacity-100 scale-100"
        leaveTo="transform opacity-0 scale-95"
      >
        <Menu.Items className="absolute top-10 right-0 mt-2 rounded-b-md bg-white border p-2 z-10">
          <Menu.Item>
            {({ active }) => (
              <button className={`text-white w-44 flex items-center justify-between rounded-md px-4 py-2 text-sm ${active ? "bg-gray-600" : "bg-primary"}`} onClick={handleLogout}>
                Se déconnecter
                <TbLogout className="ml-2 h-5 w-5 text-white" aria-hidden="true" />
              </button>
            )}
          </Menu.Item>
        </Menu.Items>
      </Transition>
    </Menu>
  )
}

export default TopBar
