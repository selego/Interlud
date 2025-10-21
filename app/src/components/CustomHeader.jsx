import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "@/services/api";
import useStore from "@/services/store";
import toast from "react-hot-toast";

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
            <div className="fr-header__menu-wrapper">
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
                <div className="fr-header__collectivity-info">
                  <select 
                    className="fr-header__collectivity-select"
                    value={collectivityInfo || ""}
                    onChange={(e) => handleCollectivityChange(e.target.value)}
                  >
                    <option value="">Sélectionner une collectivité</option>
                    {collectivities.map((collectivity) => (
                      <option key={collectivity.id} value={collectivity.id}>
                        {collectivity.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .fr-header {
          box-shadow: inset 0 -1px 0 0 var(--border-default-grey);
          background-color: #fff;
        }

        .fr-header__body {
          position: relative;
        }

        .fr-header__body-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 0;
        }

        .fr-header__brand {
          display: flex;
          align-items: center;
        }

        .fr-header__brand-top {
          display: flex;
          align-items: center;
          gap: 1rem;
        }

        .fr-logo {
          font-size: 0.75rem;
          font-weight: 700;
          line-height: 1.25rem;
          text-transform: uppercase;
          margin: 0;
          color: #000091;
        }

        .fr-header__operator img {
          height: 2rem;
        }

        .fr-header__tools {
          display: flex;
          gap: 1rem;
        }

        .fr-btns-group {
          display: flex;
          gap: 0.5rem;
          list-style: none;
          margin: 0;
          padding: 0;
        }

        .fr-btn {
          display: inline-flex;
          align-items: center;
          padding: 0.5rem 1rem;
          font-size: 0.8rem;
          font-weight: 300;
          text-decoration: none;
          border: none;
          background: transparent;
          cursor: pointer;
          color: #161616;
          transition: background-color 0.2s;
        }

        .fr-btn:hover {
          background-color: #f6f6f6;
        }

        /* Navigation */
        .fr-header__menu {
          border-top: 1px solid #e5e5e5;
        }

        .fr-header__menu-wrapper {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .fr-nav__list {
          display: flex;
          list-style: none;
          margin: 0;
          padding: 0;
          gap: 0;
        }

        .fr-nav__item {
          position: relative;
        }

        .fr-nav__link,
        .fr-nav__btn {
          display: block;
          padding: 1rem 1.5rem;
          font-size: 0.90rem;
          font-weight: 500;
          text-decoration: none;
          color: #161616;
          border: none;
          background: transparent;
          cursor: pointer;
          transition: background-color 0.2s;
          width: 100%;
          text-align: left;
        }

        .fr-nav__link:hover,
        .fr-nav__btn:hover {
          background-color: #f6f6f6;
        }

        .fr-nav__btn::after {
          content: "";
          display: inline-block;
          margin-left: 0.5rem;
          width: 0;
          height: 0;
          border-left: 0.25rem solid transparent;
          border-right: 0.25rem solid transparent;
          border-top: 0.3rem solid currentColor;
        }

        .fr-collapse {
          display: none;
          position: absolute;
          top: 100%;
          left: 0;
          background: white;
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
          min-width: 200px;
          z-index: 1000;
        }

        .fr-collapse--expanded {
          display: block;
        }

        .fr-menu__list {
          list-style: none;
          margin: 0;
          padding: 0;
        }

        .fr-menu__list .fr-nav__link {
          border-top: 1px solid #f6f6f6;
        }

        /* Icon styles */
        [class^="fr-icon-"],
        [class*=" fr-icon-"] {
          display: inline-block;
          font-size: 1.25rem;
        }

        /* Collectivity Info */
        .fr-header__collectivity-info {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.5rem 0;
        }

        .fr-header__collectivity-select {
          font-size: 0.90rem;
          font-weight: 600;
          color: #161616;
          border: 1px solid #e5e5e5;
          border-radius: 0.25rem;
          padding: 0.5rem 1rem;
          background-color: white;
          cursor: pointer;
          transition: border-color 0.2s;
        }

        .fr-header__collectivity-select:hover {
          border-color: #000091;
        }

        .fr-header__collectivity-select:focus {
          outline: none;
          border-color: #000091;
          box-shadow: 0 0 0 2px rgba(0, 0, 145, 0.1);
        }

        .fr-header__collectivity-name {
          font-size: 0.90rem;
          font-weight: 600;
          color: #161616;
        }

        .fr-header__edition-badge {
          background-color: #000091;
          color: white;
          font-size: 0.75rem;
          font-weight: 700;
          padding: 0.25rem 0.75rem;
          border-radius: 0.25rem;
          text-transform: uppercase;
        }
      `}</style>
    </header>
  );
}