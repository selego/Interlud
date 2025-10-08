import React, { useState, useEffect, useRef } from "react";
import { RiDownloadLine } from "react-icons/ri";

import Sidebar from "./sidebar";
import PropertyEditPanel from "./PropertyEditPanel";
import { usePropertyStore } from "@/services/store";

import Icon from "@/assets/icon.svg";
import Heat from "@/assets/heat.svg";
import Alert from "@/components/Alert";

type TabType = "recommended" | "not-recommended";

export default function Search() {
  const [activeTab, setActiveTab] = useState<TabType>("recommended");
  const { isModalOpen } = usePropertyStore((state: any) => ({
    isModalOpen: state.isModalOpen,
  }));

  return (
    <div className="w-full relative flex items-stretch min-h-screen">
      <Sidebar />
      <PropertyEditPanel />
      <div className={`flex-1 mx-auto p-10 ${isModalOpen ? "min-h-[1847px]" : "min-h-screen"}`}>
        <div className="flex items-center justify-between mb-6">
          <div className="flex gap-2">
            <TabItem
              tab={{ id: "recommended", label: "Solution recommandées", count: recommendedSolutions.length }}
              isActive={activeTab === "recommended"}
              onTabChange={(tabId: TabType) => setActiveTab(tabId)}
            />
            <TabItem
              tab={{ id: "not-recommended", label: "Solution non-recommandées", count: nonRecommendedSolutions.length }}
              isActive={activeTab === "not-recommended"}
              onTabChange={(tabId: TabType) => setActiveTab(tabId)}
            />
          </div>

          <button className="flex items-start gap-x-2 text-sm text-primary border-b border-primary pb-1">
            <RiDownloadLine className="text-base" />
            <span className="font-medium">Télécharger le récapitulatif</span>
          </button>
        </div>

        {/* Tab Content */}
        <div className="space-y-10">
          {(activeTab === "recommended" ? recommendedSolutions : nonRecommendedSolutions).map((solution, index) => (
            <SolutionCard key={index} data={solution} />
          ))}
        </div>
      </div>
    </div>
  );
}

interface Solution {
  title: string;
  category: string;
  description: string;
  performance: string;
  content: string;
  materialCost: string;
  maintenanceCost: string;
  maintenanceNote: string;
  performanceGain: string;
  co2Emission: string;
}

interface SolutionCardProps {
  data: Solution;
}

function SolutionCard({ data }: SolutionCardProps) {
  const { title, category, description, content, materialCost, maintenanceCost, maintenanceNote, performanceGain } = data;

  return (
    <div className="bg-white border border-primary-light rounded-lg shadow-outline">
      <div className="grid grid-cols-3">
        <div className="col-span-2 p-4">
          <div className="flex items-start gap-4 mb-4">
            <div className="w-8 h-8 flex-shrink-0 mt-1">
              <img src={Heat} alt="heat" className="w-8 h-8" />
            </div>

            <div className="flex-1">
              <div className="flex items-start gap-3 mb-4">
                <div className="flex-1 flex items-start justify-between">
                  <div className="gap-2 mb-1">
                    <h3 className="font-bold text-primary">
                      <a href={`/solution/${title}`} target="_blank" rel="noopener noreferrer" className="" onClick={(e) => e.stopPropagation()}>
                        {title}
                      </a>
                    </h3>
                    <p className="text-sm text-gray-600 italic">-- {description}</p>
                  </div>
                  <span className="bg-purple-light text-purple-dark px-2 py-1 rounded text-xs font-bold">{category}</span>
                </div>
              </div>

              <div className="text-sm text-primary-light mb-3 flex items-start gap-2">
                <img src={Icon} alt="icon" className="w-4 h-4" />
                <p>{content}</p>
              </div>

              <Alert type="warning" title="Condition non-remplie :" items={["10 à 20 m² d'espace extérieur", "Accès à l'eau à proximité", "Orientation sud recommandée"]} />

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">COÛT DU MATÉRIEL</div>
                  <div className="font-bold text-primary">{materialCost}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">COÛT DE MAINTENANCE</div>
                  <div className="font-bold text-primary">{maintenanceCost}</div>
                  <div className="text-xs text-gray-500 mt-1">{maintenanceNote}</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="border-l border-primary-light bg-light rounded-r-lg p-4 flex-1">
          <div className="text-primary font-bold tracking-wide mb-5">🌿 performance</div>
          <div className="space-y-4">
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
                <span className="font-bold text-primary">{performanceGain}</span>
              </div>
            </div>
            <div className="">
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
      </div>
    </div>
  );
}

interface Tab {
  id: TabType;
  label: string;
  count: number;
}

interface TabItemProps {
  tab: Tab;
  isActive: boolean;
  onTabChange: (tabId: TabType) => void;
}

function TabItem({ tab, isActive, onTabChange }: TabItemProps) {
  return (
    <button
      onClick={() => onTabChange(tab.id)}
      className={`px-4 py-2 rounded text-sm font-medium transition-colors ${isActive ? "bg-primary-bright text-primary" : "text-primary-light hover:text-primary"}`}
    >
      {tab.label} {tab.count && `(${tab.count})`}
    </button>
  );
}

// Data arrays for solutions
const recommendedSolutions = [
  {
    title: "Réseau de chaleur",
    category: "SOLUTION COLLECTIVE",
    description: "Chauffage et eau chaude",
    performance: "Performance énergétique",
    content: "Réseau de canalisations souterraines qui achemine la chaleur, c'est la solution à privilégier pour un chauffage collectif",
    materialCost: "De 2 500€ à 4 000€",
    maintenanceCost: "De 0€ à 100€ /an",
    maintenanceNote: "Inclus dans le contrat de fourniture de chaleur",
    performanceGain: "Gain de 1 lettres DPE",
    co2Emission: "-",
  },
  {
    title: "Pompe à chaleur",
    category: "SOLUTION INDIVIDUELLE",
    description: "Chauffage et eau chaude",
    performance: "Performance énergétique",
    content: "Système de chauffage utilisant les calories de l'air extérieur pour chauffer votre logement",
    materialCost: "De 8 000€ à 15 000€",
    maintenanceCost: "De 200€ à 400€ /an",
    maintenanceNote: "Entretien annuel obligatoire",
    performanceGain: "Gain de 2 lettres DPE",
    co2Emission: "- 1 200 kgCO2/an",
  },
  {
    title: "Isolation thermique",
    category: "SOLUTION INDIVIDUELLE",
    description: "Isolation",
    performance: "Performance énergétique",
    content: "Amélioration de l'isolation des murs, toiture et fenêtres pour réduire les déperditions thermiques",
    materialCost: "De 3 000€ à 8 000€",
    maintenanceCost: "De 0€ à 50€ /an",
    maintenanceNote: "Maintenance minimale",
    performanceGain: "Gain de 1 à 2 lettres DPE",
    co2Emission: "- 800 kgCO2/an",
  },
];

const nonRecommendedSolutions = [
  {
    title: "Chaudière gaz",
    category: "SOLUTION INDIVIDUELLE",
    description: "Chauffage et eau chaude",
    performance: "Performance limitée",
    content: "Système de chauffage au gaz naturel, moins performant que les solutions renouvelables",
    materialCost: "De 2 000€ à 4 000€",
    maintenanceCost: "De 150€ à 300€ /an",
    maintenanceNote: "Entretien annuel obligatoire",
    performanceGain: "Gain de 0 à 1 lettre DPE",
    co2Emission: "+ 1 500 kgCO2/an",
  },
  {
    title: "Chauffage électrique",
    category: "SOLUTION INDIVIDUELLE",
    description: "Chauffage",
    performance: "Performance limitée",
    content: "Système de chauffage électrique, coûteux à l'usage et peu performant énergétiquement",
    materialCost: "De 1 500€ à 3 000€",
    maintenanceCost: "De 100€ à 200€ /an",
    maintenanceNote: "Maintenance simple",
    performanceGain: "Gain de 0 lettre DPE",
    co2Emission: "+ 2 000 kgCO2/an",
  },
  {
    title: "Chauffage au fioul",
    category: "SOLUTION INDIVIDUELLE",
    description: "Chauffage et eau chaude",
    performance: "Performance limitée",
    content: "Système de chauffage au fioul, énergie fossile non renouvelable",
    materialCost: "De 3 000€ à 6 000€",
    maintenanceCost: "De 200€ à 400€ /an",
    maintenanceNote: "Entretien annuel obligatoire",
    performanceGain: "Gain de 0 lettre DPE",
    co2Emission: "+ 2 500 kgCO2/an",
  },
];
