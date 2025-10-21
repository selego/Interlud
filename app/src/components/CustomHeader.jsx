import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
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
  const { setCollectivity } = useStore();
  const navigate = useNavigate();
  const toggleDropdown = (index) => {
    setOpenDropdown(openDropdown === index ? null : index);
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

  return (
    <header role="banner" className="fr-header">
      <div className="fr-header__body">
        <div className="fr-container">
          <div className="fr-header__body-row">
            <div className={`fr-header__brand fr-enlarge-link ${classes.logo || ""}`}>
              <div className="fr-header__brand-top">
                <div className="fr-header__logo">
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
                    <li key={index}>
                      {item.buttonProps ? (
                        <button
                          className="fr-btn fr-btn--tertiary-no-outline"
                          {...item.buttonProps}
                        >
                          <span className={item.iconId} aria-hidden="true"></span>
                          <span className="ml-2">{item.text}</span>
                        </button>
                      ) : (
                        <Link
                          {...item.linkProps}
                          className="fr-btn fr-btn--tertiary-no-outline"
                        >
                          <span className={item.iconId} aria-hidden="true"></span>
                          <span className="ml-2">{item.text}</span>
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
                  {navigation.map((item, index) => (
                    <li key={index} className="fr-nav__item">
                      {item.menuLinks ? (
                        // Dropdown menu
                        <>
                          <button
                            className="fr-nav__btn"
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
                              {item.menuLinks.map((subItem, subIndex) => (
                                <li key={subIndex}>
                                  <Link {...subItem.linkProps} className="fr-nav__link">
                                    {subItem.text}
                                  </Link>
                                </li>
                              ))}
                            </ul>
                          </div>
                        </>
                      ) : (
                        <Link {...item.linkProps} className="fr-nav__link">
                          {item.text}
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              </nav>
              
              {collectivities.length > 0 && (
                <div className="">
                  <select 
                    className="cursor-pointer text-lg font-semibold pr-6 appearance-auto "
                    style={{  boxShadow: 'none' }}
                    value={collectivityInfo || ""}
                    onChange={(e) => handleCollectivityChange(e.target.value)}
                  >
                    <option value="">Sélectionner une collectivité</option>
                    {collectivities.map((collectivity) => (
                      <option key={collectivity.id} value={collectivity.id}>
                    # { collectivity.name} <FiChevronDown className="w-5 h-5" />
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