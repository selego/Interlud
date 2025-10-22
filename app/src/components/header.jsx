import React, { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import api from "@/services/api";
import useStore from "@/services/store";
import toast from "react-hot-toast";
import { FiChevronDown } from "react-icons/fi";
import Logo from "@/assets/primary_logo.png";

export default function Header() {
  const [openDropdown, setOpenDropdown] = useState(null);
  const [openQuickAccessDropdown, setOpenQuickAccessDropdown] = useState(null);
  const { user, collectivity, setCollectivity, setUser } = useStore();
  const navigate = useNavigate(); 
  const location = useLocation();
  
  const handleCollectivityChange = async (collectivityId) => {
    if (!collectivityId) {
      setCollectivity(null);
      localStorage.removeItem('selectedCollectivityId');
      return;
    }
    try {
      const { ok, data, code } = await api.get(`/collectivity/${collectivityId}`);
      if (!ok) return toast.error(code || "Erreur lors de la récupération de la collectivité");
      setCollectivity(data);
      localStorage.setItem('selectedCollectivityId', collectivityId);
      navigate(`/`);
      console.log(data);
    } catch (error) {
      console.error("Error fetching collectivity:", error);
      toast.error("Erreur lors de la récupération de la collectivité");
    }
  };

  async function handleLogout() {
    try {
      console.log("Déconnexion");
      await api.post(`/user/logout`);
      api.removeToken();
      setUser(null);
      setCollectivity(null);
      navigate("/auth");
    } catch (error) {
      console.log(error);
    }
  }

  // Navigation items - only shown when user is logged in
  const navigation = user ? [
    {
      text: "Accueil",
      linkProps: { to: "/" },
    },
    {
      text: "Admin",
      menuLinks: [
        {
          text: "Collectivités",
          linkProps: { to: "/admin/collectivity" },
        },
        {
          text: "Actions",
          linkProps: { to: "/admin/action" },
        },
        {
          text: "Indicateurs",
          linkProps: { to: "/admin/indicator" },
        },
        {
          text: "Utilisateurs",
          linkProps: { to: "/admin/users" },
        },
      ],
    },
  ] : [];

  // Quick access items - only shown when user is logged in
  const quickAccessItems = user ? [
    {
      iconId: "fr-icon-leaf-line",
      linkProps: {
        to: "/collectivites",
      },
      text: "Collectivités",
    },
    {
      iconId: "fr-icon-question-line",
      linkProps: {
        to: "/aide",
      },
      text: "Aide",
    },
    {
      iconId: "fr-icon-account-circle-line",
      text: user?.name || "Mon compte",
      menuItems: [
        {
          iconId: "fr-icon-settings-5-line",
          linkProps: {
            to: "/parametres",
          },
          text: "Paramètres",
        },
        {
          iconId: "fr-icon-logout-box-r-line",
          text: "Se déconnecter",
          buttonProps: {
            onClick: (e) => {
              e.preventDefault();
              handleLogout();
            },
          },
        },
      ],
    },
  ] : [];

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
                  {quickAccessItems.map((item, index) => (
                    <li key={index} className="relative">
                      {item.menuItems ? (
                        <>
                          <button
                            className="fr-btn fr-btn--tertiary-no-outline mt-0 ml-2"
                            onClick={() => setOpenQuickAccessDropdown(openQuickAccessDropdown === index ? null : index)}
                          >
                            <span className={item.iconId} aria-hidden="true"></span>
                            <span className="ml-2 text-primary-green text-0.875rem">{item.text}</span>
                            <FiChevronDown className={`ml-1 inline transition-transform ${openQuickAccessDropdown === index ? 'rotate-180' : ''}`} />
                          </button>
                          {openQuickAccessDropdown === index && (
                            <>
                              <div
                                className="fixed inset-0 z-40"
                                onClick={() => setOpenQuickAccessDropdown(null)}
                              />
                              <div className="absolute right-0 mt-2 w-48 bg-white border border-gray-200 rounded-md shadow-lg z-50">
                                <ul className="py-1">
                                  {item.menuItems.map((subItem, subIndex) => (
                                    <li key={subIndex}>
                                      {subItem.buttonProps ? (
                                        <button
                                          {...subItem.buttonProps}
                                          className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center"
                                        >
                                          {subItem.iconId && <span className={`${subItem.iconId} mr-2`} aria-hidden="true"></span>}
                                          {subItem.text}
                                        </button>
                                      ) : (
                                        <Link
                                          {...subItem.linkProps}
                                          className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center"
                                        >
                                          {subItem.iconId && <span className={`${subItem.iconId} mr-2`} aria-hidden="true"></span>}
                                          {subItem.text}
                                        </Link>
                                      )}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            </>
                          )}
                        </>
                      ) : item.buttonProps ? (
                        <button
                          className="fr-btn fr-btn--tertiary-no-outline"
                          {...item.buttonProps}
                        >
                          <span className={item.iconId} aria-hidden="true"></span>
                          <span className="ml-2 text-primary-green text-0.875rem">{item.text}</span>
                        </button>
                      ) : (
                        <Link
                          {...item.linkProps}
                          className="fr-btn fr-btn--tertiary-no-outline"
                        >
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

      {/* Navigation wrapper is always rendered to satisfy DSFR expectations */}
      <div className="fr-header__menu">
        <div className="fr-container">
          <div className="flex items-center justify-between">
            {navigation.length > 0 && (
              <nav className="fr-nav" role="navigation" aria-label="Menu principal">
                <ul className="fr-nav__list">
                  {navigation.map((item, index) => {
                    const isActive = item.menuLinks 
                      ? item.menuLinks?.some(subItem => subItem.linkProps?.to && (location.pathname === subItem.linkProps.to || location.pathname.startsWith(subItem.linkProps.to + '/')))
                      : item.linkProps?.to && (location.pathname === item.linkProps.to || location.pathname.startsWith(item.linkProps.to + '/'));
                    
                    return (
                      <li key={index} className="fr-nav__item m-0 text-base">
                        {item.menuLinks ? (
                          <>
                            <button
                              className={`fr-nav__btn p-4 ${isActive ? 'border-b-2 !border-primary-green !text-primary-green' : ''}`}
                              aria-expanded={openDropdown === index}
                              aria-controls={`menu-${index}`}
                              onClick={() => setOpenDropdown(openDropdown === index ? null : index) }
                            >
                              {item.text}
                            </button>
                            <div
                              className={`fr-collapse fr-menu ${openDropdown === index ? "fr-collapse--expanded" : ""}`}
                              id={`menu-${index}`}
                            >
                              <ul className="fr-menu__list w-48">
                                {item.menuLinks.map((subItem, subIndex) => {
                                  const isSubActive = subItem.linkProps?.to && (location.pathname === subItem.linkProps.to || location.pathname.startsWith(subItem.linkProps.to + '/'));
                                  return (
                                    <li key={subIndex}>
                                      <Link 
                                        {...subItem.linkProps} 
                                        className={`fr-nav__link text-base ${isSubActive ? 'bg-gray-100' : ''}`}
                                      >
                                        {subItem.text}
                                      </Link>
                                    </li>
                                  );
                                })}
                              </ul>
                            </div>
                          </>
                        ) : (
                          <Link 
                            {...item.linkProps} 
                            className={`fr-nav__link text-base p-4 ${isActive ? 'border-b-2 !border-primary-green !text-primary-green' : ''}`}
                          >
                            {item.text}
                          </Link>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </nav>
            )}
            
            {user?.collectivities && user.collectivities.length > 0 && (
              <div className="">
                <select 
                  className="cursor-pointer text-lg font-semibold pr-6 appearance-auto"
                  style={{  boxShadow: 'none' }}
                  value={collectivity?._id || ""}
                  onChange={(e) => handleCollectivityChange(e.target.value)}
                >
                  <option value="" disabled>Collectivité</option>
                  {user.collectivities.map((collectivity) => (
                    <option key={collectivity.id} value={collectivity.id}>
                      #{collectivity.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
          {/* Target for DSFR header links cloning */}
          <div className="fr-header__menu-links"></div>
        </div>
      </div>
    </header>
  );
}