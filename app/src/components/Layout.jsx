import React from "react";
import Logo from "@/assets/interlud.png";
import { Footer } from "@codegouvfr/react-dsfr/Footer";
import { Header } from "@codegouvfr/react-dsfr/Header";
import ademe from "@/assets/ademe.png";
import useStore from "@/services/store";
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
  const { user, setUser } = useStore();

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
        <Header
        brandTop={
            <>
            République <br />
            Française
            </>
        }
        homeLinkProps={{
            to: "/",
            title: `Accueil - Pacoupa`,
        }}
        operatorLogo={{
            alt: "Logo de l'opérateur",
            imgUrl: "/logo.svg",
            orientation: "vertical",
        }}
        serviceTitle={
            <>
            <span className="inline-block align-middle">
                <img src={Logo} alt="logo" className="h-8 object-contain" />
            </span>
            </>
        }
        navigation={[
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
        ]}
        quickAccessItems={[
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
          ].concat(
            user
              ? [
                  {
                    iconId: "fr-icon-user-line",
                    linkProps: {
                      to: "/profil",
                    },
                    text: "Mon profil",
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
              : [
                  {
                    iconId: "fr-icon-login-box-line",
                    linkProps: {
                      to: "/auth/signin",
                    },
                    text: "Se connecter",
                  },
                ]
          )}
        classes={{
            logo: "py-0",
            operator: "py-0",
        }}
        />
      </div>

      <main className="flex-1 bg-gray-50" id="main">
        {children}
      </main>

      <Footer
        id={"footer"}
        accessibility="non compliant"
        accessibilityLinkProps={{ href: "/accessibilite" }}
        contentDescription={`Pacoupa est un service développé par l'accélérateur de la transition écologique de l'ADEME.`}
        operatorLogo={{
          imgUrl: ademe,
          alt: "ADEME",
          orientation: "vertical",
        }}
        classes={{
          root: "border-t-2 border-primary shadow-none",
        }}
        className={"bg-white"}
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