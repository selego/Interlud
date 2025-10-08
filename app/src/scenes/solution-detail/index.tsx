import React from "react";
import { useNavigate } from "react-router-dom";
import { IoArrowBack } from "react-icons/io5";
import { RiDownloadLine } from "react-icons/ri";
import { FaPhone, FaRegCheckCircle, FaShare } from "react-icons/fa";

import CalciVert from "@/assets/calcivert.png";
import IlluPac from "@/assets/Illu-PAC.png";
import icon from "@/assets/icon.svg";
import France from "@/assets/france.png";
import PLU from "@/assets/PLU.png";
import Accoustique from "@/assets/accoustique.png";
import Electricite from "@/assets/electricite.png";
import PompeAChaleur from "@/assets/Pompe-a-chaleur-air.png";

// Assets
import { BiSolidInfoSquare } from "react-icons/bi";
import { FaRegCircleXmark } from "react-icons/fa6";
import { MdOutlineInfo } from "react-icons/md";

export default function SolutionDetail() {
  const navigate = useNavigate();

  return (
    <div className="mr-10 ml-14 p-6">
      {/* Header avec navigation */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex flex-col items-start gap-2 relative">
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-bold text-gray-800">Pompe à chaleur air/eau</h1>
            <div className="px-1 py-0.5 bg-violet-100 rounded flex justify-start items-center gap-1">
              <div className="justify-start text-purple-900 text-xs font-bold">SOLUTION COLLECTIVE</div>
            </div>
          </div>
          <p className="text-gray-600">Solution de chauffage et d'eau chaude</p>
          <button onClick={() => navigate("/")} className="flex items-center gap-2 text-gray-700 absolute -left-6 top-2">
            <IoArrowBack className="text-lg" />
          </button>
        </div>

        <div className="flex items-center gap-4">
          <button className="flex items-center gap-x-2 text-sm text-gray-700">
            <RiDownloadLine className="text-base" />
            <span>Télécharger la fiche solution</span>
          </button>
          <button className="flex items-center gap-x-2 text-sm text-gray-700">
            <FaShare className="text-base" />
            <span>Partager</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-8">
        <div className="col-span-5 flex flex-col gap-16">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col justify-start items-start gap-2 relative">
              <div className="justify-start text-primary text-sm font-normal">
                La pompe à chaleur air/eau chauffe l’eau pour les radiateurs en utilisant l’air extérieur (via une unité à installer à l’extérieur). <br />
                Cette solution ne propose que le chauffage; il faut donc prévoir (ou garder) un autre système pour l’eau chaude sanitaire...
              </div>
              <div className="justify-start text-purple-secondaryDarker text-sm font-medium underline">Lire la description complête</div>
              <img src={icon} alt="icon" className="absolute -left-6 top-1" />
            </div>
            <div className="flex justify-center items-center">
              <img src={IlluPac} alt="illu-pac" className="w-3/5 h-auto pr-16" />
              <div className="w-2/5">
                <div className="px-2 flex flex-col justify-start items-start gap-4">
                  <div className="flex flex-col justify-start items-start gap-1">
                    <div className="justify-start text-base font-bold ">🔊 Nuissance sonore</div>
                    <div className=" justify-start">
                      <span className="text-sm font-normal ">De </span>
                      <span className="text-sm font-bold ">45</span>
                      <span className="text-sm font-normal "> à </span>
                      <span className="text-sm font-bold ">65db</span>
                      <span className="text-sm font-normal "> pour chaque unité (extérieur/intérieur). Une étude </span>
                      <span className="text-sm font-bold ">acoustique</span>
                      <span className="text-sm font-normal "> est nécessaire pour valider l’implantation</span>
                    </div>
                  </div>
                  <div className=" flex flex-col justify-start items-start gap-1">
                    <div className=" justify-start text-base font-bold ">👷‍♂️ Impact des travaux</div>
                    <div className=" justify-start text-sm font-normal ">Travaux rapides dans les parties communes peu fréquentées</div>
                  </div>
                  <div className=" flex flex-col justify-start items-start gap-1">
                    <div className="justify-start text-base font-bold flex items-center gap-1">
                      📈 Coût du MWh
                      <MdOutlineInfo className="w-5 h-5 text-gray-400" />
                    </div>
                    <div className=" justify-start">
                      <span className="text-sm font-normal ">Entre </span>
                      <span className="text-sm font-bold ">87</span>
                      <span className="text-sm font-normal "> et </span>
                      <span className="text-sm font-bold ">143€</span>
                      <span className="text-sm font-normal "> HT/MWh</span>
                    </div>
                  </div>
                  <div className=" flex flex-col justify-start items-start gap-1">
                    <div className="justify-start text-base font-bold ">❄️ Production de froid</div>
                    <div className=" justify-start text-sm font-normal ">
                      Oui, le rafraichissement est gratuit si les émetteurs sont adaptés (avec un plancher ou ventilo-convecteur)
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-4">
            <div className="text-primary font-bold text-xl tracking-wide">Exemple d'application</div>
            <div className="p-4 bg-white rounded-2xl shadow-outline flex gap-4 w-3/5">
              <img src={France} alt="icon" className="w-14 h-14" />
              <div className="flex flex-col gap-4 w-full">
                <div className="flex flex-col gap-1">
                  <div className="text-neutral-900 font-bold ">Résidence Hermann Sabran</div>
                  <div className="text-neutral-700 font-normal">Lyon (Rhône)</div>
                </div>
                <div className="w-full flex justify-end">
                  <div className="py-1 border-b border-primary w-fit flex items-center gap-1">
                    <div className="font-normal ">Voir l'exemple</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="flex flex-col justify-start items-start gap-4">
            <div className="flex flex-col justify-center items-start gap-1">
              <div className="justify-start text-xl font-bold">Condition d'installation</div>
              <div className="justify-start text-sm font-normal">Ces conditions doivent être impérativement remplies pour permettre l'installation de la solution</div>
            </div>
            <div className="flex flex-col justify-start items-start gap-8">
              <div className="relative rounded flex flex-col justify-center items-start gap-1">
                <div className="relative px-1 py-0.5 rounded text-green-700 bg-green-100 text-xs font-bold uppercase">
                  Bâtiment isolé ou plancher chauffant
                  <FaRegCheckCircle className="w-4 h-4 text-green-700 bg-green-100 rounded-full absolute -left-6 top-0.5" />
                </div>
                <div className="flex justify-start items-start gap-0.5">
                  <div className="flex-1 justify-start text-sm font-normal">
                    Solution efficace lorsque la température de l'eau pour le chauffage est basse : pour des bâtiments bien isolés ou équipés de planchers chauffants{" "}
                  </div>
                </div>
              </div>
              <div className="flex flex-col justify-center items-start gap-1">
                <div className="relative px-1 py-0.5 rounded text-green-700 bg-green-100 text-xs font-bold uppercase">
                  <span>8 à 16m</span>
                  <sup>2</sup>
                  <span> d'espace extérieur disponible</span>

                  <FaRegCheckCircle className="w-4 h-4 text-green-700 bg-green-100 rounded-full absolute -left-6 top-0.5" />
                </div>
                <div className="flex justify-start items-start gap-0.5">
                  <div className="flex-1 justify-start text-sm font-normal">
                    Pour une copropriété de taille moyenne (10 à 30 logements). L'espace extérieure doit être plat, ventilé, stable, accessible et suffisament grand (cour, toiture,
                    jardin ou terrasse)
                  </div>
                </div>
              </div>
              <div className="flex flex-col justify-center items-start gap-1">
                <div className="relative px-1 py-0.5 rounded text-red-700 bg-red-100 text-xs font-bold uppercase">
                  <span>6 à 12m</span>
                  <sup>2</sup>
                  <span> d'espace intérieur disponible</span>

                  <FaRegCircleXmark className="w-4 h-4 text-red-700 bg-red-100 rounded-full absolute -left-6 top-0.5" />
                </div>
                <div className="flex justify-start items-start gap-0.5">
                  <div className="flex-1 justify-start text-sm font-normal">
                    Pour une copropriété de taille moyenne (10 à 30 logements). L'espace intérieur doit être plat, ventilé, stable, accessible et suffisament grand (cour, toiture,
                    jardin ou terrasse)
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-4">
            <div className="text-primary font-bold text-xl tracking-wide">Autre conditions à vérifier</div>
            <div className="grid grid-cols-3 gap-4 mt-2">
              <div className={`relative border-2 border-green-800 rounded-lg px-4 py-8 text-center flex flex-col items-center`}>
                <div className="h-12 flex items-center justify-center mb-3">
                  <img src={PLU} alt="Espace commun" className="h-12 w-auto" />
                </div>
                <div className="text-sm font-medium mb-1">PLU</div>
                <div className="text-sm text-gray-500 mb-2">L’installation de PAC doit être compatible avec le PLU</div>
                <MdOutlineInfo className="w-5 h-5 text-gray-400" />
              </div>
              <div className={`relative border-2 border-green-800 rounded-lg px-4 py-8 text-center flex flex-col items-center`}>
                <div className="h-12 flex items-center justify-center mb-3">
                  <img src={Accoustique} alt="Espace privé" className="h-12 w-auto" />
                </div>
                <div className="text-sm font-medium mb-1">Règlementation acoustique</div>
                <div className="text-sm text-gray-500 mb-2">Le bruit de l’unité extérieur ne doit pas dépasser le seuil autorisé</div>
                <MdOutlineInfo className="w-5 h-5 text-gray-400" />
              </div>
              <div className={`relative border-2 border-green-800 rounded-lg px-4 py-8 text-center flex flex-col items-center`}>
                <div className="h-12 flex items-center justify-center mb-3">
                  <img src={Electricite} alt="Toit terrasse" className="h-12 w-auto" />
                </div>
                <div className="text-sm font-medium mb-1">Raccordement électrique</div>
                <div className="text-sm text-gray-500 mb-2">L’alimentation doit être adaptée à la puissance de l’équipement</div>
                <MdOutlineInfo className="w-5 h-5 text-gray-400" />
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-4">
            <div className="text-primary font-bold text-xl tracking-wide">Bon à savoir</div>
            <div className="flex flex-col justify-start items-start gap-2 relative">
              <div className="text-neutral-900 font-bold ">Qualité du réseau de distribution</div>
              <div className="justify-start text-primary text-sm font-normal">
                Lors de l’installation d’une pompe à chaleur air/eau collective en copropriété, la vérification de la qualité du réseaui de distribution de chaleur existant est une
                étpae essentielle pour garantir la performance globale du système. En effet, un réseau mal dimensionné, vétuste ou mal équilibré peut fortement dégrader le
                rendement de la PAC, Même si celle-ci est performante
              </div>
            </div>
            <div className="flex flex-col justify-start items-start gap-2 relative">
              <div className="text-neutral-900 font-bold ">Installation dans un bâtiment historique</div>
              <div className="justify-start text-primary text-sm font-normal">
                L’installation d’une pompe à chaleur air/eau collective dans un bâtiment classé ou inscrit monument historique nécessite une autorisation préalable du service des
                patrimoines. Cette autorisation est accordée après étude et examen technique détaillé.
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-4">
            <div className="text-primary font-bold text-xl tracking-wide">Bon à savoir</div>
            <div className="grid grid-cols-3 gap-4 mt-2">
              <div className="bg-white border-2 border-primary shadow-outline rounded-2xl flex flex-col justify-start items-start gap-4 overflow-hidden">
                <img className="w-full" src={PompeAChaleur} />
                <div className="px-4 pb-4 flex flex-col justify-end items-end gap-4">
                  <div className="flex flex-col justify-start items-start gap-1">
                    <div className="justify-start text-neutral-900 text-sm font-bold">Comment choisir la bonne PAC ?</div>
                    <div className="justify-start text-neutral-700 text-sm">Vous êtes décidé à installer une PAC mais vous ne savez pas laquelle ?</div>
                  </div>
                  <div className="py-1 border-b flex justify-start items-center gap-1">
                    <div className="justify-start text-sm">Lire l’article</div>
                  </div>
                </div>
              </div>
              <div className="bg-white border-2 border-primary shadow-outline rounded-2xl flex flex-col justify-start items-start gap-4 overflow-hidden">
                <img className="w-full" src={PompeAChaleur} />
                <div className="px-4 pb-4 flex flex-col justify-end items-end gap-4">
                  <div className="flex flex-col justify-start items-start gap-1">
                    <div className="justify-start text-neutral-900 text-sm font-bold">Comment choisir la bonne PAC ?</div>
                    <div className="justify-start text-neutral-700 text-sm">Vous êtes décidé à installer une PAC mais vous ne savez pas laquelle ?</div>
                  </div>
                  <div className="py-1 border-b flex justify-start items-center gap-1">
                    <div className="justify-start text-sm">Lire l’article</div>
                  </div>
                </div>
              </div>
              <div className="bg-white border-2 border-primary shadow-outline rounded-2xl flex flex-col justify-start items-start gap-4 overflow-hidden">
                <img className="w-full" src={PompeAChaleur} />
                <div className="px-4 pb-4 flex flex-col justify-end items-end gap-4">
                  <div className="flex flex-col justify-start items-start gap-1">
                    <div className="justify-start text-neutral-900 text-sm font-bold">Comment choisir la bonne PAC ?</div>
                    <div className="justify-start text-neutral-700 text-sm">Vous êtes décidé à installer une PAC mais vous ne savez pas laquelle ?</div>
                  </div>
                  <div className="py-1 border-b flex justify-start items-center gap-1">
                    <div className="justify-start text-sm">Lire l’article</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="col-span-2 flex flex-col gap-6">
          <div className="flex flex-col gap-6 p-8 border-2 border-primary rounded-3xl">
            <div className="flex flex-col gap-4">
              <div className="text-primary font-bold tracking-wide">🌿 performance énergétique</div>
              <div>
                <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">ÉVOLUTION DE LA PERFORMANCE</div>
                <div className="flex items-center gap-2">
                  <div className="relative min-w-8 w-8 h-8 flex items-center">
                    <svg width="32" height="32" viewBox="0 0 32 32" className="absolute left-0 top-0">
                      <path
                        d="M2 6 C2 3.8 3.8 2 6 2 L20 2 C21.1 2 22.1 2.6 22.6 3.6 L28 14 C28.4 14.8 28.4 17.2 28 18 L22.6 28.4 C22.1 29.4 21.1 30 20 30 L6 30 C3.8 30 2 28.2 2 26 Z"
                        fill="#FEF3C7"
                        stroke="#D97706"
                        strokeWidth="2"
                      />
                    </svg>
                    <span className="absolute left-[44%] -translate-x-1/2 z-10 text-yellow-800 font-bold text-sm">3</span>
                  </div>
                  <span className="font-bold text-primary">Gain de 3 lettres DPE</span>
                </div>
              </div>
              <div className="">
                <div>
                  <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">ÉMISSION DE CO2 (en kgCO2 /an)</div>
                  <div className="w-full h-3 bg-white border border-primary rounded-sm">
                    <div className="h-full bg-primary-bright rounded-sm" style={{ width: "75%" }}></div>
                  </div>
                  <div className="flex items-center justify-between text-primary-lighter">
                    <span className="text-sm">52</span>
                    <span className="text-sm">09</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-4">
              <div className="text-primary font-bold tracking-wide">💰 Côut</div>
              <div className="space-y-4">
                <div>
                  <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">coût du matériel</div>
                  <div className="font-bold text-primary">De 2 500€ à 4 000€</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">coût de maintenance</div>
                  <div className="font-bold text-primary">De 0€ à 100€ /an</div>
                  <div className="text-xs text-gray-500 mt-1">inclu dans le contrat de fourniture de chaleur</div>
                </div>
              </div>
            </div>
          </div>
          <div data-state="primary" className=" p-6 bg-green-100 rounded-2xl flex flex-col justify-start items-center gap-1">
            <div className="flex flex-col justify-center items-center gap-4">
              <img src={CalciVert} alt="icon-vert" className="w-16 h-16" />
              <div className="flex flex-col justify-start items-center gap-1">
                <div className="text-base font-bold">Cette solution vous intéresse ?</div>
                <div className="text-center text-xs font-normal">Retrouvez le contact des professionnels qui peuvent vous aider : conseiller, professionnels RGE, ...</div>
              </div>
              <button className="button-primary text-base">
                <span>Contacter un professionnel</span>
                <FaPhone />
              </button>
            </div>
          </div>
          <div className=" p-2 bg-yellow-50 rounded flex justify-start items-start gap-2">
            <div className="pt-0.5 flex justify-start items-start gap-2">
              <BiSolidInfoSquare className="w-4 h-4 mt-0.5 text-yellow-600" />
            </div>
            <div className="flex flex-col justify-start items-start gap-2">
              <div className="justify-center">
                <span className="text-sm font-bold">Ce sont des estimations ! </span>
                <span className="text-sm font-normal">Tous les chiffres des solutions sont des estimations, ils sont approximatif et ne peuvent pas servir de devis.</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
