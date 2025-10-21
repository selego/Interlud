import React, { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import api from "@/services/api";
import useStore from "@/services/store";
import toast from "react-hot-toast";
import { FiChevronDown } from "react-icons/fi";

export default function CustomHeader({
  brandTop,
  homeLinkProps,
  serviceTitle,
  navigation = [],
  quickAccessItems = [],
  classes = {},
  collectivityInfo = null,
  collectivities = [],
}) {
  const [openDropdown, setOpenDropdown] = useState(null);
  const [openQuickAccessDropdown, setOpenQuickAccessDropdown] = useState(null);
  const { setCollectivity } = useStore();
  const navigate = useNavigate();
  const location = useLocation();
  
  const toggleDropdown = (index) => {
    setOpenDropdown(openDropdown === index ? null : index);
  };

  const toggleQuickAccessDropdown = (index) => {
    setOpenQuickAccessDropdown(openQuickAccessDropdown === index ? null : index);
  };

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

  // Fonction pour vérifier si un lien est actif
  const isActiveLink = (linkTo) => {
    if (!linkTo) return false;
    return location.pathname === linkTo || location.pathname.startsWith(linkTo + '/');
  };

  // Fonction pour vérifier si un menu déroulant a un sous-lien actif
  const hasActiveSubLink = (menuLinks) => {
    return menuLinks?.some(subItem => isActiveLink(subItem.linkProps?.to));
  };

  return (
    <header role="banner" className="fr-header">
      <div className="fr-header__body">
        <div className="fr-container">
          <div className="fr-header__body-row">
            <div className={`fr-header__brand fr-enlarge-link ${classes.logo || ""}`}>
              <div className="fr-header__brand-top">
                <div className="fr-header__logo md:max-xl:p-2 md:max-xl:!mr-0 p-1.5">
                  <p className="fr-logo">{brandTop}</p>
                </div>
                <div className={`fr-header__operator ${classes.operator || ""}`}>
                  <Link {...homeLinkProps} className="flex items-center">
                    {serviceTitle}
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
                            onClick={() => toggleQuickAccessDropdown(index)}
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

      {/* Navigation */}
      {navigation.length > 0 && (
        <div className="fr-header__menu">
          <div className="fr-container">
            <div className="flex items-center justify-between">
              <nav className="fr-nav" role="navigation" aria-label="Menu principal">
                <ul className="fr-nav__list">
                  {navigation.map((item, index) => {
                    const isActive = item.menuLinks 
                      ? hasActiveSubLink(item.menuLinks) 
                      : isActiveLink(item.linkProps?.to);
                    
                    return (
                      <li key={index} className="fr-nav__item m-0 text-base">
                        {item.menuLinks ? (
                          <>
                            <button
                              className={`fr-nav__btn p-4 ${isActive ? 'border-b-2 !border-primary-green !text-primary-green' : ''}`}
                              aria-expanded={openDropdown === index}
                              aria-controls={`menu-${index}`}
                              onClick={() => toggleDropdown(index)}
                            >
                              {item.text}
                            </button>
                            <div
                              className={`fr-collapse fr-menu ${openDropdown === index ? "fr-collapse--expanded" : ""}`}
                              id={`menu-${index}`}
                            >
                              <ul className="fr-menu__list">
                                {item.menuLinks.map((subItem, subIndex) => {
                                  const isSubActive = isActiveLink(subItem.linkProps?.to);
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
              
              {collectivities.length > 0 && (
                <div className="">
                  <select 
                    className="cursor-pointer text-lg font-semibold pr-6 appearance-auto"
                    style={{  boxShadow: 'none' }}
                    value={collectivityInfo || ""}
                    onChange={(e) => handleCollectivityChange(e.target.value)}
                  >
                    <option value="" disabled>Collectivité</option>
                    {collectivities.map((collectivity) => (
                      <option key={collectivity.id} value={collectivity.id}>
                        #{collectivity.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}