import React, { Fragment, useState } from "react";
import { Dialog, Menu, Transition } from "@headlessui/react";
import { NavLink, Link, useNavigate } from "react-router-dom";
import { IoClose } from "react-icons/io5";
import { FaBars, FaUser, FaStackExchange } from "react-icons/fa6";
import { FaUserAlt } from "react-icons/fa";
import { PiSignOutBold } from "react-icons/pi";
import { toast } from "react-hot-toast";

import useStore from "../store";
import api from "../services/api";

function classNames(...classes) {
  return classes.filter(Boolean).join(" ");
}

export default function Layout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { setUser } = useStore();

  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      const {ok} = await api.post(`/admin/user/logout`);
      if (!ok) throw new Error("Something went wrong");

      setUser(null);
      navigate("/auth");
    } catch (error) {
      toast.error(error.message);
    }
  };

  return (
    <>
      <div>
        <Transition.Root show={sidebarOpen} as={Fragment}>
          <Dialog as="div" className="relative z-50 lg:hidden" onClose={setSidebarOpen}>
            <Transition.Child
              as={Fragment}
              enter="transition-opacity ease-linear duration-300"
              enterFrom="opacity-0"
              enterTo="opacity-100"
              leave="transition-opacity ease-linear duration-300"
              leaveFrom="opacity-100"
              leaveTo="opacity-0"
            >
              <div className="fixed inset-0 bg-gray-900/80" />
            </Transition.Child>

            <div className="fixed inset-0 flex">
              <Transition.Child
                as={Fragment}
                enter="transition ease-in-out duration-300 transform"
                enterFrom="-translate-x-full"
                enterTo="translate-x-0"
                leave="transition ease-in-out duration-300 transform"
                leaveFrom="translate-x-0"
                leaveTo="-translate-x-full"
              >
                <Dialog.Panel className="relative mr-16 flex w-full max-w-xs flex-1">
                  <Transition.Child
                    as={Fragment}
                    enter="ease-in-out duration-300"
                    enterFrom="opacity-0"
                    enterTo="opacity-100"
                    leave="ease-in-out duration-300"
                    leaveFrom="opacity-100"
                    leaveTo="opacity-0"
                  >
                    <div className="absolute left-full top-0 flex w-16 justify-center pt-5">
                      <button type="button" className="-m-2.5 p-2.5" onClick={() => setSidebarOpen(false)}>
                        <IoClose className="w-6 h-6" />
                      </button>
                    </div>
                  </Transition.Child>
                  <div className="flex grow flex-col gap-y-5 overflow-y-auto p-4 bg-white">
                    <div className="flex shrink-0 flex-col items-center mx-auto gap-1 font-semibold font-mono mt-5 text-xl">
                      Talent R
                      <p className="text-gray-700 font-medium text-xs">Admin Platform</p>
                    </div>
                    <nav className="flex flex-1 flex-col mt-5">
                      <ul role="list" className="flex flex-1 flex-col gap-y-2">
                        <NavLink
                          to="/"
                          end
                          className={({ isActive }) =>
                            classNames(
                              isActive ? "bg-black bg-opacity-10 !text-black font-medium" : "",
                              "group flex items-center gap-x-2 rounded-md py-3 px-4 text-[#6E7581] text-xs font-semibold transition-colors"
                            )
                          }
                        >
                          <FaStackExchange className={classNames("h-4 w-4 shrink-0")} />
                          Dashboard
                        </NavLink>
                        <NavLink
                          to="/user"
                          className={({ isActive }) =>
                            classNames(
                              isActive ? "bg-black bg-opacity-10 !text-black font-medium" : "",
                              "group flex items-center gap-x-2 rounded-md py-3 px-4 text-[#6E7581] text-xs font-semibold transition-colors"
                            )
                          }
                        >
                          <FaUser className={classNames("h-4 w-4 shrink-0")} />
                          Users
                        </NavLink>
                      </ul>
                    </nav>
                  </div>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </Dialog>
        </Transition.Root>

        <div className="hidden z-50 lg:fixed lg:inset-y-0 lg:flex lg:w-48 lg:flex-col shadow-sidebar">
          <div className="flex grow flex-col overflow-y-auto bg-white p-4 border-r border-[#E8E8E8]">
            <div className="flex shrink-0 flex-col items-center mx-auto gap-1 font-semibold font-mono text-xl">
              Talent R
              <p className="text-gray-700 font-medium text-xs">Admin Platform</p>
            </div>
            <nav className="flex flex-1 flex-col mt-10">
              <ul role="list" className="flex flex-1 flex-col gap-y-2">
                <NavLink
                  to="/"
                  end
                  className={({ isActive }) =>
                    classNames(
                      isActive ? "bg-black bg-opacity-10 !text-black font-medium" : "",
                      "group flex items-center gap-x-2 rounded-md py-3 px-4 text-[#6E7581] text-xs font-semibold transition-colors"
                    )
                  }
                >
                  <FaStackExchange className={classNames("h-4 w-4 shrink-0")} />
                  Dashboard
                </NavLink>
                <NavLink
                  to="/user"
                  className={({ isActive }) =>
                    classNames(
                      isActive ? "bg-black bg-opacity-10 !text-black font-medium" : "",
                      "group flex items-center gap-x-2 rounded-md py-3 px-4 text-[#6E7581] text-xs font-semibold transition-colors"
                    )
                  }
                >
                  <FaUser className={classNames("h-4 w-4 shrink-0")} />
                  Users
                </NavLink>
              </ul>
            </nav>
          </div>
        </div>

        <div className="lg:pl-48">
          <div className="sticky top-0 z-50 lg:px-6 border-b border-[#E8E8E8] bg-white">
            <div className="flex py-2 items-center gap-x-4 px-4 shadow-sm sm:gap-x-6 sm:px-6 lg:px-0 lg:shadow-none">
              <button type="button" className="-m-2.5 p-2.5 text-gray-700 lg:hidden" onClick={() => setSidebarOpen(true)}>
                <FaBars className="w-6 h-6" />
              </button>

              <div className="h-6 w-px bg-gray-200 lg:hidden" aria-hidden="true" />

              <div className="flex flex-1 gap-x-4 self-stretch lg:gap-x-6 justify-end items-center">
                <div className="flex items-center gap-x-4 lg:gap-x-6">
                  <Menu as="div" className="relative">
                    <Menu.Button className="p-2.5 bg-white shadow-input rounded-full border border-gray-200 hover:bg-gray-50 ">
                      <FaUserAlt className="w-4 h-4 text-gray-400" />
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
                      <Menu.Items className="absolute right-0 z-10 mt-1 w-40 origin-top-right rounded-md bg-white py-2 shadow ring-1 ring-gray-900/5 focus:outline-none">
                        <Menu.Item>
                          {({ active }) => (
                            <Link to="/account" className={classNames(active ? "bg-gray-100" : "", "w-full flex gap-3 px-3 py-1 items-center text-sm leading-6 text-gray-700")}>
                              <FaUserAlt className="text-xs" />
                              My Account
                            </Link>
                          )}
                        </Menu.Item>
                        <Menu.Item>
                          {({ active }) => (
                            <button
                              onClick={handleLogout}
                              className={classNames(active ? "bg-gray-100" : "", "w-full flex gap-3 px-3 py-1 items-center text-sm leading-6 text-gray-700")}
                            >
                              <PiSignOutBold />
                              Sign Out
                            </button>
                          )}
                        </Menu.Item>
                      </Menu.Items>
                    </Transition>
                  </Menu>
                </div>
              </div>
            </div>
          </div>
          <main className="p-6 h-full">{children}</main>
        </div>
      </div>
    </>
  );
}
