import React from "react";
import background_element from "@/assets/background_element.png";
import { Footer } from "@codegouvfr/react-dsfr/Footer";
import Header from "@/components/header";
import { createConsentManagement } from "@codegouvfr/react-dsfr/consentManagement";

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
  return (
    <div className="flex flex-col min-h-screen">
      <div className="relative z-50">
        <Header />
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