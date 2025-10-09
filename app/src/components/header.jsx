import React, { Fragment } from "react"
import { Link } from "react-router-dom"
import { Menu, Transition } from "@headlessui/react"
import { RxAvatar } from "react-icons/rx"

import api from "@/services/api"
import useStore from "@/services/store"

const Header = ({}) => {
  const { user, setUser } = useStore()

  const handleLogout = async () => {
    try {
      const res = await api.post(`/user/logout`)
      if (!res.ok) throw new Error("Something went wrong")
      setUser(null)
    } catch (error) {
      console.log(error)
    }
  }

  return (
    <div className="relative">
      <div className="fixed top-0 left-0 z-20 flex items-center justify-between w-full h-16 px-4 py-4 bg-white border-b md:px-6 md:py-2">
        <h1 className="m-0 text-2xl font-bold md:text-3xl text-primary">
          <Link to="/">Tifo</Link>
        </h1>
        <Menu as="div" className="relative">
          <Menu.Button className="flex items-center gap-x-1 md:gap-x-2">
            <RxAvatar className="object-cover w-5 h-5 rounded-full cursor-pointer md:w-9 md:h-9 text-primary" />
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
            <Menu.Items className="absolute shadow-lg right-0 z-10 mt-2.5 w-32 origin-top-right rounded-md bg-white py-2 shadow-sidebar ring-1 ring-gray-900/5 focus:outline-none">
              <Menu.Item>
                {({ active }) => (
                  <Link to="/account" className={`block px-3 py-1 text-sm leading-6 text-gray-900 ${active ? "bg-gray-50" : ""} hover:bg-gray-50`}>
                    My account
                  </Link>
                )}
              </Menu.Item>
              <Menu.Item>
                {({ active }) => (
                  <button onClick={handleLogout} className={`block px-3 py-1 text-sm leading-6 text-gray-900 ${active ? "bg-gray-50" : ""} hover:bg-gray-50`}>
                    Sign out
                  </button>
                )}
              </Menu.Item>
            </Menu.Items>
          </Transition>
        </Menu>
      </div>
    </div>
  )
}

export default Header
