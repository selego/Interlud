import React from "react";
import { RiBuilding4Line, RiClipboardLine, RiEditLine, RiFireLine, RiInformationLine } from "react-icons/ri";
import { usePropertyStore, Property } from "@/services/store";
import GeoCodeImage from "@/components/GeoCodeImage";

const Sidebar = () => {
  const { property, openModal } = usePropertyStore();

  return (
    <div className="w-full max-w-sm bg-white border-r-2 border-primary p-6 flex flex-col">
      {/* Système de chauffage */}

      {/* Votre copropriété */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <RiBuilding4Line className="text-primary-light text-lg" />
            <h3 className="text-primary-light font-medium">Votre copropriété</h3>
          </div>
          <button
            onClick={openModal}
            className="rounded-primary border border-primary shadow-outline text-primary px-4 py-1 font-bold text-sm hover:bg-gray-100 flex items-center gap-2 focus:-ml-1"
          >
            Modifier
            <RiEditLine />
          </button>
        </div>

        <div className="ml-7">
          <GeoCodeImage width={300} height={150} zoom={14} />

          <div className="my-4">
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">ADRESSE</div>
            <div className="text-primary-light font-bold">{property.address}</div>
          </div>

          <div className="my-4">
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">ANNÉE DE CONSTRUCTION</div>
            <div className="text-primary-light font-bold">{property.constructionYear || "Non renseigné"}</div>
          </div>

          <div className="my-4">
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">NOMBRE DE LOGEMENT</div>
            <div className="text-primary-light font-bold">{property.housingCount || "Non renseigné"}</div>
          </div>

          <div className="my-4">
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">SURFACE CHAUFFÉE</div>
            <div className="text-primary-light font-bold">{property.heatedArea ? `${property.heatedArea} m²` : "Non renseigné"}</div>
          </div>

          <div className="mb-4">
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-2">QUALITÉ DE L'ENVELOPPE ÉNERGÉTIQUE</div>
            <div className="relative">
              <div className="w-full h-3 bg-white border border-primary rounded-sm">
                <div className="h-full bg-primary-bright rounded-sm" style={{ width: "75%" }}></div>
              </div>
              <div className="text-right font-bold text-sm text-primary mt-1">{property.envelopeQuality || "Non évaluée"}</div>
            </div>
          </div>

          <button onClick={openModal} className="text-purple-medium text-sm underline">
            Voir plus d'informations
          </button>
        </div>
      </div>

      <div className="mb-8">
        <div className="flex items-center gap-2 mb-4">
          <RiFireLine className="text-primary-light text-lg" />

          <h3 className="text-primary-light font-bold">Système de chauffage</h3>
        </div>

        <div className="space-y-8 ml-7">
          <div>
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-2">CHAUFFAGE</div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {property.heatingSystem.type && (
                  <span className="bg-purple-light text-purple-dark px-2 py-1 rounded text-xs font-bold">
                    {property.heatingSystem.type === "collective" ? "SOLUTION COLLECTIVE" : "SOLUTION INDIVIDUELLE"}
                  </span>
                )}
                <span className="text-primary">{property.heatingSystem.energy || "Non renseigné"}</span>
              </div>
              <RiInformationLine className="text-primary-lighter" />
            </div>
            {property.heatingSystem.heatingType && (
              <div className="mt-2 text-primary-light">
                <span className="text-xs">Type: </span>
                <span className="font-medium">{property.heatingSystem.heatingType}</span>
              </div>
            )}
          </div>

          <div>
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-2">EAU CHAUDE SANITAIRE</div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {property.hotWaterSystem.type && (
                  <span className="bg-purple-light text-purple-dark px-2 py-1 rounded text-xs font-bold">
                    {property.hotWaterSystem.type === "collective" ? "SOLUTION COLLECTIVE" : "SOLUTION INDIVIDUELLE"}
                  </span>
                )}
                <span className="text-primary">{property.hotWaterSystem.energy || "Non renseigné"}</span>
              </div>
              <RiInformationLine className="text-primary-lighter" />
            </div>
          </div>

          <button onClick={openModal} className="text-purple-medium text-sm underline">
            Voir plus d'informations
          </button>
        </div>
      </div>

      {/* Contraintes particulières */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-4">
          <RiClipboardLine className="text-primary-light text-lg" />
          <h3 className="text-primary-light font-bold">Contraintes particulières</h3>
        </div>

        <div className="space-y-8 ml-7">
          <div>
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">RÉSEAU DE CHALEUR</div>
            <div className="flex items-center justify-between">
              <span className="text-primary">
                {property.constraints.heatNetwork === "priority"
                  ? "Zone de déploiement prioritaire"
                  : property.constraints.heatNetwork === "nonPriority"
                  ? "Zone non prioritaire"
                  : "Non renseigné"}
              </span>
              <RiInformationLine className="text-primary-lighter" />
            </div>
          </div>

          <div>
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">PROTECTION PATRIMONIALE</div>
            <div className="flex items-center justify-between">
              <span className="text-primary">
                {property.constraints.heritage === "historic" ? "Monument historique" : property.constraints.heritage === "none" ? "Aucune" : "Non renseigné"}
              </span>
              <RiInformationLine className="text-primary-lighter" />
            </div>
          </div>

          <div>
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">PROTECTION ENVIRONNEMENTALE</div>
            <div className="flex items-center justify-between">
              <span className="text-primary">
                {property.constraints.environmental === true ? "Site classé" : property.constraints.environmental === false ? "Aucune" : "Non renseigné"}
              </span>
              <RiInformationLine className="text-primary-lighter" />
            </div>
          </div>

          <div>
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">PROTECTION DE L'ATMOSPHÈRE</div>
            <div className="flex items-center justify-between">
              <span className="text-primary">
                {typeof property.constraints.atmosphereProtection === "string"
                  ? property.constraints.atmosphereProtection
                  : typeof property.constraints.environmental === "boolean"
                  ? property.constraints.environmental
                    ? "Oui"
                    : "Non"
                  : "Non renseigné"}
              </span>
              <RiInformationLine className="text-primary-lighter" />
            </div>
          </div>

          <button onClick={openModal} className="text-purple-medium text-sm underline">
            Voir plus d'informations
          </button>
        </div>
      </div>
    </div>
  );
};

export default Sidebar;
