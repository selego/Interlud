import React, { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";

// @ts-ignore
import { FaArrowUp } from "react-icons/fa6";
import { Footer } from "@codegouvfr/react-dsfr/Footer";
import { Header } from "@codegouvfr/react-dsfr/Header";
import { createConsentManagement } from "@codegouvfr/react-dsfr/consentManagement";

export const { ConsentBannerAndConsentManagement, FooterConsentManagementItem, FooterPersonalDataPolicyItem, useConsent } = createConsentManagement({
  finalityDescription: {
    matomo: {
      title: "Matomo",
      description: "Outil d’analyse comportementale des utilisateurs.",
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

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  return (
    <>
      <div className="relative z-50">
        <div className="relative z-10 border-b-2 border-primary">
          <Header
            brandTop={
              <>
                République <br />
                Française
              </>
            }
            homeLinkProps={{
              // @ts-ignore
              to: "/",
              title: `Accueil - Pacoupa`,
            }}
            operatorLogo={{
              alt: "Logo de l'opérateur",
              imgUrl: "/ademe.svg",
              orientation: "vertical",
            }}
            classes={{
              logo: "py-0",
              operator: "py-0",
            }}
            quickAccessItems={[<HeaderButton />]}
          />
        </div>
      </div>

      <main className="h-full" id="main">
        {children}
      </main>

      <Footer
        id={"footer"}
        accessibility="non compliant"
        accessibilityLinkProps={{ href: "/accessibilite" }}
        contentDescription={`Pacoupa est un service développé par l'accélérateur de la transition écologique de l'ADEME.`}
        operatorLogo={{
          imgUrl: "/ademe.svg",
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
          // <FooterConsentManagementItem key="FooterConsentManagementItem" />,
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
    </>
  );
}

const HeaderButton = () => {
  const location = useLocation();
  const isHomePage = location.pathname === "/";
  console.log(isHomePage);
  if (!isHomePage) return null;

  return (
    <Link
      to="/recherche"
      className="button-primary 
      text-base"
    >
      <span>Analyser ma copropriété</span>
      <FaArrowUp />
    </Link>
  );
};
