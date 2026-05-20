import React, { useState, useEffect, useRef } from "react"
import { Link, useNavigate, useLocation } from "react-router-dom"
import api from "@/services/api"
import useStore from "@/services/store"
import toast from "react-hot-toast"
import { FiChevronDown, FiCheck } from "react-icons/fi"
import Logo from "@/assets/primary_logo.png"
import Select from "@/components/Select"
import DebounceInput from "@/components/debounceInput"

function SelectSearch({ value, label, onChange }) {
  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [options, setOptions] = useState([])
  const [loading, setLoading] = useState(false)
  const selectRef = useRef(null)

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (selectRef.current && !selectRef.current.contains(event.target)) setIsOpen(false)
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])


  const fetchCollectivities = async () => {
      try {
      setLoading(true)
      const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      const { ok, data, code } = await api.post("/collectivity/search", { search: escaped, limit: 20 })
        if (!ok) return toast.error(code || "Erreur lors de la récupération des collectivités")
        setOptions(data)
      } catch (error) {
        toast.error(error.message || "Erreur lors de la récupération des collectivités")
      } finally {
        setLoading(false)
      }
    }

  useEffect(() => {
    if (!search) {
      setOptions([])
      return
    }
    fetchCollectivities()
  }, [search])

  return (
    <div ref={selectRef} className="relative" onKeyDown={(e) => e.key === "Escape" && setIsOpen(false)}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        className="input-primary w-full text-left pr-10 truncate"
      >
        <span className="block truncate">{label || "Sélectionner"}</span>
      </button>
      <div className="absolute inset-y-0 right-0 flex items-center pr-4 pointer-events-none">
        <FiChevronDown className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
      </div>
      {isOpen && (
        <div className="absolute z-50 mt-1 left-1/2 -translate-x-1/2 w-max min-w-full max-w-[28rem] bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
          <div className="sticky top-0 bg-white p-2 border-b border-gray-200">
            <DebounceInput
              debounce={300}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher..."
              className="!w-full !px-3 !py-2 !text-xs !border !border-gray-200 !rounded-md focus:!outline-none focus:!border-primary"
            />
          </div>
          {loading ? (
            <div className="px-4 py-3 text-gray-500 text-sm text-center">Chargement...</div>
          ) : options.length > 0 ? (
            options.map((option) => (
              <button
                type="button"
                key={option._id}
                onClick={() => {
                  onChange?.(option._id)
                  setIsOpen(false)
                  setSearch("")
                }}
                className={`w-full text-left px-4 py-3 cursor-pointer transition-colors hover:bg-gray-50 ${value === option._id ? "bg-primary/10 text-primary" : "text-gray-900"}`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-xs whitespace-nowrap">{option.name}</span>
                  {value === option._id && <FiCheck className="w-4 h-4 text-primary flex-shrink-0" />}
                </div>
              </button>
            ))
          ) : search ? (
            <div className="px-4 py-3 text-gray-500 text-sm text-center">Aucun résultat</div>
          ) : (
            <div className="px-4 py-3 text-gray-500 text-sm text-center">Tapez pour rechercher</div>
          )}
        </div>
      )}
    </div>
  )
}

export default function Header() {
  const [openDropdown, setOpenDropdown] = useState(null)
  const [openQuickAccessDropdown, setOpenQuickAccessDropdown] = useState(null)
  const quickAccessRef = useRef(null)
  const { user, collectivity, setCollectivity, setUser, setActionRights, setEconomicActor } = useStore()
  const [unreadCount, setUnreadCount] = useState(0)
  const navigate = useNavigate()
  const location = useLocation()

  const fetchUnreadNotifications = async () => {
    if (!user) return
    try {
      const { ok, total, code } = await api.post("/notification/search", { user_id: user._id, read_at: null, limit: 0 })
      if (!ok) return toast.error(code || "Erreur lors de la récupération des notifications")
      setUnreadCount(total)
    } catch (error) {
      toast.error(error.message || "Erreur lors de la récupération des notifications")
    }
  }

  useEffect(() => {
    fetchUnreadNotifications()
  }, [user])

  useEffect(() => {
    function handleClickOutside(event) {
      if (quickAccessRef.current && !quickAccessRef.current.contains(event.target)) {
        setOpenQuickAccessDropdown(null)
      }
    }

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        setOpenQuickAccessDropdown(null)
        setOpenDropdown(null)
      }
    }

    if (openQuickAccessDropdown !== null || openDropdown !== null) {
      document.addEventListener("mousedown", handleClickOutside)
      document.addEventListener("keydown", handleKeyDown)
      return () => {
        document.removeEventListener("mousedown", handleClickOutside)
        document.removeEventListener("keydown", handleKeyDown)
      }
    }
  }, [openQuickAccessDropdown, openDropdown])

  const handleCollectivityChange = async (collectivityId) => {
    if (!collectivityId) {
      setCollectivity(null)
      localStorage.removeItem("selectedCollectivityId")
      return
    }
    try {
      const { ok, data, code } = await api.get(`/collectivity/${collectivityId}`)
      if (!ok) return toast.error(code || "Erreur lors de la récupération de la collectivité")
      setCollectivity(data)
      localStorage.setItem("selectedCollectivityId", collectivityId)
      navigate(`/`)
    } catch (error) {
      console.error("Error fetching collectivity:", error)
      toast.error("Erreur lors de la récupération de la collectivité")
    }
  }

  async function handleLogout() {
    try {
      await api.post(`/user/logout`)
      api.removeToken()
      setUser(null)
      setCollectivity(null)
      setEconomicActor(null)
      setActionRights([])
      localStorage.removeItem("selectedCollectivityId")
      navigate("/auth")
    } catch (error) {
      console.log(error)
    }
  }

  const navigation =
    user?.role === "admin" || user?.collectivities?.find((c) => c.status === "approved")
      ? [
          {
            text: "Accueil",
            linkProps: { to: "/" }
          },
          (user.role === "admin" || user.collectivities?.find((c) => c.id === collectivity?._id)?.role === "admin") && {
            text: "Gérer ma collectivité",
            linkProps: { to: "/collectivity" }
          },
          {
            text: "Mes Actions",
            linkProps: { to: "/actions" }
          },
          {
            text: "Mes Données générales",
            linkProps: { to: "/general-data" }
          }
        ]
      : []

  const quickAccessItems = user
    ? [
        user.role === "admin" && {
          iconId: "fr-icon-settings-5-line",
          text: "Gestion Administrateur",
          menuItems: [
            {
              linkProps: { to: "/admin/collectivity" },
              text: "Collectivités"
            },
            {
              linkProps: { to: "/admin/action" },
              text: "Actions"
            },
            {
              linkProps: { to: "/admin/indicator" },
              text: "Indicateurs"
            },
            {
              linkProps: { to: "/admin/users" },
              text: "Utilisateurs"
            },
            {
              linkProps: { to: "/admin/economic-actors" },
              text: "Acteurs économiques"
            }
          ]
        },
        {
          iconId: "fr-icon-account-circle-line",
          text: "Mon compte",
          menuItems: [
            {
              iconId: "fr-icon-settings-5-line",
              linkProps: {
                to: "/settings"
              },
              text: "Paramètres"
            },
            {
              iconId: "fr-icon-message-2-line",
              linkProps: {
                to: "/notifications"
              },
              text: "Notifications"
            },
            {
              iconId: "fr-icon-logout-box-r-line",
              text: "Se déconnecter",
              buttonProps: {
                onClick: (e) => {
                  e.preventDefault()
                  handleLogout()
                }
              }
            }
          ]
        }
      ]
    : []

  return (
    <header role="banner" className="fr-header">
      <div className="fr-header__body">
        <div className="fr-container">
          <div className="fr-header__body-row">
            <div className="fr-header__brand fr-enlarge-link">
              <div className="fr-header__brand-top">
                <div className="fr-header__logo md:max-xl:p-2 md:max-xl:!mr-0 p-1.5">
                  <p className="fr-logo">
                    République <br />
                    Française
                  </p>
                </div>
                <div className="fr-header__operator">
                  <Link to="/" title="Accueil - InTerLUD" className="flex items-center">
                    <span className="inline-block align-middle">
                      <img src={Logo} alt="logo" className="h-8 object-contain" />
                    </span>
                  </Link>
                </div>
              </div>
            </div>

            <div className="fr-header__tools">
              <div className="fr-header__tools-links">
                <ul className="fr-btns-group">
                  {quickAccessItems.filter(Boolean).map((item, index) => (
                    <li key={index} className="relative" ref={index === openQuickAccessDropdown ? quickAccessRef : null}>
                      {item.menuItems ? (
                        <>
                          <button
                            className="fr-btn mt-0 ml-2 px-2 rounded hover:bg-primary-green/10 transition-colors"
                            aria-haspopup="menu"
                            aria-expanded={openQuickAccessDropdown === index}
                            onClick={() => setOpenQuickAccessDropdown(openQuickAccessDropdown === index ? null : index)}
                          >
                            <span className={`${item.iconId} relative`} aria-hidden="true">
                              {item.text === "Mon compte" && unreadCount > 0 && (
                                <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                                  {unreadCount > 99 ? "99+" : unreadCount}
                                </span>
                              )}
                            </span>
                            <span className="ml-2 text-primary-green text-0.875rem">{item.text}</span>
                            <FiChevronDown className={`ml-1 inline transition-transform ${openQuickAccessDropdown === index ? "rotate-180" : ""}`} />
                          </button>
                          {openQuickAccessDropdown === index && (
                            <div className="absolute top-9 right-0 w-48 bg-white border border-gray-200 rounded-md shadow-lg z-50">
                              <ul className="py-1">
                                {item.menuItems.map((subItem, subIndex) => (
                                  <li key={subIndex}>
                                    {subItem.buttonProps ? (
                                      <button {...subItem.buttonProps} className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center">
                                        {subItem.iconId && <span className={`${subItem.iconId} mr-2`} aria-hidden="true"></span>}
                                        {subItem.text}
                                      </button>
                                    ) : (
                                      <Link
                                        {...subItem.linkProps}
                                        className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center"
                                        onClick={() => setOpenQuickAccessDropdown(null)}
                                      >
                                        {subItem.iconId && <span className={`${subItem.iconId} mr-2`} aria-hidden="true"></span>}
                                        {subItem.text}
                                      </Link>
                                    )}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </>
                      ) : item.buttonProps ? (
                        <button className="fr-btn fr-btn--tertiary-no-outline" {...item.buttonProps}>
                          <span className={item.iconId} aria-hidden="true"></span>
                          <span className="ml-2 text-primary-green text-0.875rem">{item.text}</span>
                        </button>
                      ) : (
                        <Link {...item.linkProps} className="fr-btn fr-btn--tertiary-no-outline">
                          <span className={item.iconId} aria-hidden="true"></span>
                          <span className="ml-2 text-primary-green text-0.875rem">{item.text}</span>
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="border-t border-gray-200">
        <div className="fr-container">
          <div className="flex items-center justify-between">
            {navigation.filter(Boolean).length > 0 && (
              <nav className="fr-nav" role="navigation" aria-label="Menu principal">
                <ul className="fr-nav__list">
                  {navigation.filter(Boolean).map((item, index) => {
                    const isActive = item.menuLinks
                      ? item.menuLinks?.some(
                          (subItem) => subItem.linkProps?.to && (location.pathname === subItem.linkProps.to || location.pathname.startsWith(subItem.linkProps.to + "/"))
                        )
                      : item.linkProps?.to && (location.pathname === item.linkProps.to || location.pathname.startsWith(item.linkProps.to + "/"))

                    return (
                      <li key={index} className="fr-nav__item m-0 text-base">
                        {item.menuLinks ? (
                          <>
                            <button
                              className={`fr-nav__btn p-4 ${isActive ? "border-b-2 !border-primary-green !text-primary-green" : ""}`}
                              aria-expanded={openDropdown === index}
                              aria-controls={`menu-${index}`}
                              onClick={() => setOpenDropdown(openDropdown === index ? null : index)}
                            >
                              {item.text}
                            </button>
                            <div className={`fr-collapse fr-menu ${openDropdown === index ? "fr-collapse--expanded" : ""}`} id={`menu-${index}`}>
                              <ul className="fr-menu__list w-48">
                                {item.menuLinks.map((subItem, subIndex) => {
                                  const isSubActive =
                                    subItem.linkProps?.to && (location.pathname === subItem.linkProps.to || location.pathname.startsWith(subItem.linkProps.to + "/"))
                                  return (
                                    <li key={subIndex}>
                                      <Link {...subItem.linkProps} className={`fr-nav__link text-base ${isSubActive ? "bg-gray-100" : ""}`}>
                                        {subItem.text}
                                      </Link>
                                    </li>
                                  )
                                })}
                              </ul>
                            </div>
                          </>
                        ) : (
                          <Link
                            {...item.linkProps}
                            className={`p-4 text-base ${
                              isActive ? "border-b-2 border-primary-green text-primary-green" : "hover:bg-gray-100/50 hover:border-gray-200 hover:border-b-2"
                            }`}
                          >
                            {item.text}
                          </Link>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </nav>
            )}

            {(user?.role === "admin" || (user?.collectivities && user.collectivities.filter((c) => c.status === "approved").length > 0)) && (
              <div className="flex items-center gap-3">
                <div className="w-52">
                  {user.role === "admin" ? (
                    <SelectSearch value={collectivity?._id || ""} label={collectivity?.name || ""} onChange={handleCollectivityChange} />
                  ) : (
                    <Select
                      value={collectivity?._id || ""}
                      onChange={handleCollectivityChange}
                      constrained={true}
                      options={user.collectivities
                        .filter((c) => c.status === "approved")
                        .map((c) => ({ value: c.id, label: c.name }))}
                      className="truncate"
                    />
                  )}
                </div>
              </div>
            )}
          </div>
          <div className="fr-header__menu-links"></div>
        </div>
      </div>
    </header>
  )
}

const COLLECTIVITY_ROLES = {
  admin: "Administrateur",
  user: "Utilisateur",
  economic_actor: "acteur économique"
}
