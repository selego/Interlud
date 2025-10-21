import React from "react";
import Logo from "@/assets/primary_logo.png";
import background_element from "@/assets/background_element.png";
import { Footer } from "@codegouvfr/react-dsfr/Footer";
import { Header } from "@codegouvfr/react-dsfr/Header";
import useStore from "@/services/store";
import CustomHeader from "./CustomHeader";
import { createConsentManagement } from "@codegouvfr/react-dsfr/consentManagement";
import { useNavigate } from "react-router-dom";
import api from "@/services/api";

export const { ConsentBannerAndConsentManagement, FooterConsentManagementItem, FooterPersonalDataPolicyItem, useConsent } = createConsentManagement({
    finalityDescription: {
      matomo: {
        title: "Matomo",
        description: "Outil d'analyse comportementale des utilisateurs.",
      },
      tally: {
        title: "Tally",
        description: "Hébergement de formulaires.",
      },
    },
    personalDataPolicyLinkProps: {
      href: "/politique-de-confidentialite#cookies",
    },
  });

export default function Layout({ children }) {
  const navigate = useNavigate();
  const { user, collectivity } = useStore();

  async function handleLogout() {
    try {
      console.log("Déconnexion");
      await api.post(`/user/logout`);
      api.removeToken();
      navigate("/auth");
    } catch (error) {
      console.log(error);
    }
  }
  return (
    <div className="flex flex-col min-h-screen">
      <div className="relative z-50">
        <CustomHeader
        brandTop={
            <>
            République <br />
            Française
            </>
        }
        homeLinkProps={{
            to: "/",
            title: `Accueil - InTerLUD`,
        }}
        serviceTitle={
            <>
            <span className="inline-block align-middle">
                <img src={Logo} alt="logo" className="h-8 object-contain" />
            </span>
            </>
        }

        collectivityInfo={collectivity?._id}
        collectivities={user?.collectivities || []}

        {...(user && {
        navigation: [
            {
            text: "Accueil",
            linkProps: { to: "/" },
            },
            {
            text: "À propos",
            linkProps: { to: "/about" },
            },
            {
            text: "Contact",
            linkProps: { to: "/contact" },
            },
            {        text: "Admin",
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
        ],

        quickAccessItems: [
                  {
                    iconId: "fr-icon-account-circle-line",
                    linkProps: {
                      to: "#",
                    },
                    text: user?.name || "Mon compte",
                    buttonProps: {
                      onClick: (e) => {
                        e.preventDefault();
                      },
                    },
                  },
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
                ]
          })}
        />
      </div>

      <main className="flex-1 bg-white relative" id="main">
        <div className="fixed w-1/2 h-3/5 pointer-events-none z-0" style={{ right: '-200px', top: '-100px' }}>
          <img src={background_element} alt="" className="w-full h-full object-contain" />
        </div>

        <div className="fixed bottom-[150px] w-1/3 h-1/3 pointer-events-none z-0" style={{ left: '-200px' }}>
          <img src={background_element} alt="" className="w-full h-full object-contain transform rotate-180" />
        </div>

        <div className="fixed w-1/3 h-1/3 right-[180px] pointer-events-none z-0" style={{ bottom: '-250px' }}>
          <img src={background_element} alt="" className="w-full h-full object-contain transform rotate-180" />
        </div>

        <div className="relative z-10">
          {children}
        </div>
      </main>

      <Footer
        id={"footer"}
        brandTop={
          <>
            République <br />
            Française
          </>
        }
        homeLinkProps={{
          to: "/",
          title: `Accueil - InTerLUD`,
        }}
        accessibility="non compliant"
        accessibilityLinkProps={{ href: "/accessibilite" }}
        contentDescription={`InTerLUD est un service développé par l'accélérateur de la transition écologique de l'ADEME.`}
        classes={{
          root: "border-t-2 border-primary shadow-none",
        }}
        className={"bg-white relative"}
        bottomItems={[
          {
            text: "CGU",
            linkProps: { href: "/cgu" },
          },
          <FooterPersonalDataPolicyItem key="FooterPersonalDataPolicyItem" />,
          {
            text: "Politique des cookies",
            linkProps: { href: "/politique-des-cookies" },
          },
        ]}
        termsLinkProps={{ href: "/mentions-legales" }}
        license={
          <span className="pb-2 block">
            Sauf mention contraire, tous les contenus de ce site sont sous{" "}
            <a href={`https://github.com/ademe-dev/pacoupa/blob/main/LICENSE`} target="_blank" rel="noreferrer">
              licence Apache 2.0
            </a>
          </span>
        }
      />
    </div>
  );
}