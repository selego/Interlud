import React from "react";
import HeroIllustration from "@/assets/hero-illustration.png";
import Logo from "@/assets/logo.svg";
import Path from "@/assets/path.svg";
import Sun from "@/assets/Sun.svg";
import Invoice from "@/assets/Invoice.svg";
import Boiler from "@/assets/boiler.png";
import Elipse from "@/assets/Elipse.svg";
import WhatIsIt from "@/assets/pac-what-is-it.png";
import QuestionMark from "@/assets/question-mark.svg";
import FiveMinOnly from "@/assets/5min-only.png";
import Personnalise from "@/assets/Personnalisé.png";
import Comprehensible from "@/assets/Compréhensible.png";
import Categorie from "@/assets/Illu.png";
import { FaArrowUp } from "react-icons/fa6";
import Camembert47 from "@/assets/camembert-47.svg";
import Camembert18 from "@/assets/camembert-18.svg";
import CloudPacoupa from "@/assets/cloud-pacoupa.svg";
import House from "@/assets/house.svg";
import { Link } from "react-router-dom";

const Home = () => {
  return (
    <div className="w-full flex flex-col items-center space-y-16">
      <div className="relative mx-32 my-16">
        {/* Main container with border */}
        <section className="border-2 border-primary shadow-outline rounded-2xl bg-white relative overflow-visible">
          <div className="grid grid-cols-2">
            {/* Left side content */}
            <div className="p-8 flex flex-col items-start justify-center space-y-16">
              <img src={Logo} alt="logo" className="h-10 object-contain" />
              <h1 className="text-primary font-bold leading-tight text-4xl">Trouvez la meilleure solution de chauffage écologique, adaptée à votre copropriété</h1>

              <div className="mt-10 w-full">
                <label className="block text-primary font-bold mb-2">Adresse de la copropriété</label>
                <div className="flex gap-3 w-full">
                  <div className="relative w-full">
                    <input type="text" placeholder="Adresse du bâtiment" className="pr-10" />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-primary-lighter">
                      {/* Location pin icon */}
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M12 22s7-6.1 7-12a7 7 0 10-14 0c0 5.9 7 12 7 12z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                        <circle cx="12" cy="10" r="3" stroke="currentColor" strokeWidth="2" />
                      </svg>
                    </span>
                  </div>
                  <Link to="/recherche" className="button-primary text-base">
                    <span>Analyser</span>
                    <FaArrowUp />
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Illustration as a separate element positioned absolutely */}
        <img
          src={HeroIllustration}
          alt="hero-illustration"
          className="absolute bottom-0 right-0 w-[50%] max-w-screen-md translate-y-[12%] translate-x-[7%] z-10 pointer-events-none"
        />
      </div>

      <div className="w-full">
        <section className="mx-32 relative">
          <img src={Path} alt="path" className="absolute top-0 left-0 translate-x-1/4 -translate-y-1/4 w-full h-[calc(100%+10rem)] -z-10" />
          <img src={Elipse} alt="elipse" className="absolute bottom-8 left-16 -z-10" />

          <h2 className="text-primary text-3xl font-bold mb-8">On a tous une bonne raison</h2>

          <div className="flex flex-col gap-16">
            <div className="flex flex-col w-full sha">
              <div className="w-1/2 bg-white rounded-xl p-6 relative border-2 border-primary shadow-outline">
                <h3 className="text-primary text-2xl font-semibold mb-4">Chaudière en panne ?</h3>
                <p className="text-gray-700 text-base">C'est le bon moment pour vous renseigner sur les solutions durables, spécifiquement adaptées à votre immeuble</p>
                <img src={Boiler} alt="Chaudière" className="absolute h-32 -right-10 -bottom-10" />
              </div>
            </div>

            {/* Card 2 - Facture trop élevée */}
            <div className="flex flex-col w-full items-center">
              <div className="w-1/2 bg-white rounded-xl p-6 relative border-2 border-primary shadow-outline">
                <h3 className="text-primary text-2xl font-semibold mb-4">Facture trop élevée ?</h3>
                <p className="text-gray-700  text-base">Les solutions "renouvelables" sont souvent moins gourmandes, et donc moins exposées aux augmentations de prix.</p>
                <img src={Invoice} alt="Facture" className="absolute h-24 -right-10 -bottom-6" />
              </div>
            </div>

            {/* Card 3 - Envie de passer au vert */}
            <div className="flex flex-col w-full items-end">
              <div className="w-1/2 bg-white rounded-xl p-6 relative border-2 border-primary shadow-outline">
                <h3 className="text-primary text-2xl font-semibold mb-4">Envie de passer au vert ?</h3>
                <p className="text-gray-700 text-base">
                  Réseau de chaleur ? pompe à chaleur ? solaire thermique ? biomasse ? Késako ? Les solutions sont nombreuses, laissez nous vous guider pas à pas.
                </p>
                <img src={Sun} alt="Soleil" className="absolute h-20 -right-10 -bottom-6" />
              </div>
            </div>
          </div>
        </section>
      </div>

      <div className="w-full bg-gradient-to-r from-[#E2D3F4] to-[#E2D3F47D]">
        <div className="m-32 flex ">
          <img src={WhatIsIt} alt="elipse" className="-translate-x-8" />
          <div className="flex flex-col justify-between">
            <div className="flex flex-col gap-2">
              <h2 className="text-primary text-3xl font-bold">PAC, RCU : C'est quoi ?</h2>
              <p className="text-gray-700 text-lg font-medium w-[70%]">Vous hésitez entre une chaudière à gaz ou des radiateurs éléctriques ?</p>
            </div>
            <div className="flex flex-col gap-4 mb-24">
              <p className="text-gray-700 text-2xl font-bold">
                Et pourquoi pas une{" "}
                <span className="text-primary border-b-4 border-purple relative mr-4">
                  pompe à chaleur
                  <img src={QuestionMark} alt="question mark" className="absolute w-4 h-4 -top-1 -right-4" />
                </span>{" "}
                (PAC) ?
              </p>
              <p className="text-gray-700 text-2xl font-bold">
                ou un raccordement au{" "}
                <span className="text-primary border-b-4 border-purple relative mr-4">
                  réseau de chaleur urbain
                  <img src={QuestionMark} alt="question mark" className="absolute w-4 h-4 -top-1 -right-4" />
                </span>{" "}
                (RCU) ?
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="w-full">
        <div className="mx-32 my-16 flex flex-col gap-8">
          <h2 className="text-primary text-3xl font-bold">Trouvez la solution qui vous correspond en moins de 5min</h2>
          <div className="grid grid-cols-3 gap-4">
            <div className="border-2 border-primary shadow-outline rounded-2xl bg-white relative overflow-visible p-6 flex items-center">
              <img src={FiveMinOnly} alt="5 minutes" className="mr-4" />
              <div>
                <h3 className="text-black text-xl font-semibold mb-4">Simple & rapide</h3>
                <p className="text-gray-700 text-base">5min seulement</p>
              </div>
            </div>
            <div className="border-2 border-primary shadow-outline rounded-2xl bg-white relative overflow-visible p-6 flex items-center">
              <img src={Personnalise} alt="Personnalisé" className="mr-4" />
              <div>
                <h3 className="text-black text-xl font-semibold mb-4">Personnalisée</h3>
                <p className="text-gray-700 text-base">Une solution faites pour votre copropriété</p>
              </div>
            </div>
            <div className="border-2 border-primary shadow-outline rounded-2xl bg-white relative overflow-visible p-6 flex items-center">
              <img src={Comprehensible} alt="Compréhensible" className="mr-4" />
              <div>
                <h3 className="text-black text-xl font-semibold mb-4">Compréhensible</h3>
                <p className="text-gray-700 text-base">Un conseil d'experts accessibles pour tous</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="w-full">
        <div className="mx-40 my-16 flex">
          <div className="flex flex-col">
            <h3 className="text-primary text-2xl font-semibold mb-4">Laissez vous guider</h3>
            <p className="text-gray-700 text-xl font-normal mb-2">
              Ce simulateur détermine, selon les caractéristiques de votre immeuble, les différents types de chauffage et leur pertinence écologique et économique.
            </p>
            <Link to="/recherche" className="button-primary text-base w-fit">
              <span>Lancer la simulation</span>
              <FaArrowUp />
            </Link>
          </div>
          <img src={Categorie} alt="elipse" className="translate-x-8" />
        </div>
      </div>

      <div className="w-full">
        <div className="mx-32 mb-16 gap-8 flex flex-col">
          <div className="flex flex-col gap-4">
            <h2 className="text-primary text-2xl font-semibold mb-4">Décarbonons le bâtiment dès maintenant</h2>
            <p className="text-gray-700 text-xl font-normal mb-2 w-[80%]">
              Remplacer les <span className="font-bold">deux tiers</span> de notre consommation d'énergie fossile est un enjeu majeur pour la transition énergétique.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-8 mb-8">
            <div className="flex gap-4 items-center">
              <img src={Camembert47} alt="5 minutes" className="w-16 h-16" />
              <div>
                <p className="text-gray-700 text-lg">
                  <span className="text-primary font-bold">47%</span> de l'énergie consommée en France vient du secteur du bâtiment
                </p>
              </div>
            </div>
            <div className="flex gap-4 items-center">
              <img src={Camembert18} alt="5 minutes" className="w-16 h-16" />
              <div>
                <p className="text-gray-700 text-lg">
                  <span className="text-primary font-bold">18%</span> des émissions de gaz à effet de serre (GES) proviennent de ce même secteur
                </p>
              </div>
            </div>
          </div>
          <div className="flex items-start gap-8">
            <div className="flex flex-col gap-4">
              <h3 className="text-primary text-2xl font-semibold mb-4">Pourquoi est-ce important ?</h3>
              <p className="text-gray-700 text-xl mb-6">
                Nos maisons et bâtiments dépendent encore beaucoup d'énergies fossiles comme le fioul et le gaz. Ces énergies polluantes et limitées représentent{" "}
                <span className="font-bold">plus de la moitié</span> de nos besoins en chauffage et en eau chaude.
              </p>
              <h3 className="text-primary text-2xl font-semibold mb-4">La solution : Passer aux énergies propres</h3>
              <p className="text-gray-700 text-xl mb-6">
                Utiliser des <span className="font-bold">alternatives décarbonées</span>, comme les pompes à chaleur ou l'électricité verte, peut réduire rapidement les émissions
                de CO2. C'est une étape cruciale pour protéger notre planète.
              </p>
            </div>
            <img src={CloudPacoupa} alt="Cloud Pacoupa" className="w-54" />
          </div>
          <div className="flex items-start gap-8">
            <img src={House} alt="Maison" className="w-54" />
            <div className="flex flex-col gap-4 w-[60%]">
              <h3 className="text-primary text-2xl font-semibold mb-4">Mais ce n'est pas tout..</h3>
              <p className="text-gray-700 text-xl mb-6">
                Chaque bâtiment est unique. La transition énergétique nécessite aussi une bonne isolation et une consommation plus raisonnée. Il n'y a pas de solution unique, mais
                chaque amélioration compte.
              </p>
              <h3 className="text-primary text-2xl font-semibold mb-4">Passons à l'action</h3>
              <p className="text-gray-700 text-xl mb-6">
                Chez Pacoupa, nous vous guidons pour faire les bons choix. Un avenir durable est possible, à condition d'agir dès maintenant.
              </p>

              <Link to="/recherche" className="button-primary text-base w-fit">
                <span>Lancer la simulation</span>
                <FaArrowUp />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Home;
