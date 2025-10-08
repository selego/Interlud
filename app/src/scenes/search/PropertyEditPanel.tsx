import React, { ChangeEvent } from "react";
import { BiSolidInfoSquare } from "react-icons/bi";
import { usePropertyStore } from "@/services/store";
import AutocompleteBan from "@/components/AutocompleteBan";
import { FaRegCheckCircle, FaRegBuilding, FaAngleDown } from "react-icons/fa";
import { RiFireLine, RiSurveyLine, RiTempColdLine } from "react-icons/ri";
import { LuThermometerSnowflake } from "react-icons/lu";
import HeaderSideShadow from "@/assets/header-side-shadow.svg";
import Logo from "@/assets/icon.svg";

// Import des images pour les espaces extérieurs
import espaceCommun from "@/assets/espace commun.png";
import espacePrivee from "@/assets/espace privée.png";
import toitTerrasse from "@/assets/Toit terrasse.png";
import { FaArrowLeft, FaArrowUp } from "react-icons/fa6";
import { Property } from "@/services/store";

const PropertyEditPanel = () => {
  const { isModalOpen, closeModal, property, setProperty } = usePropertyStore((state: any) => ({
    isModalOpen: state.isModalOpen,
    closeModal: state.closeModal,
    property: state.property as Property,
    setProperty: state.setProperty,
  }));

  if (!isModalOpen) return null;

  return (
    <div className="absolute top-0 left-0 right-0 h-full z-30 flex">
      {/* Main panel - 70% width */}
      <div className="w-[70%] bg-white shadow-xl border-r-2 border-primary">
        <div className="p-6 mx-8">
          <div className="flex items-start gap-2 p-2 mb-4 bg-blue-light rounded">
            <div className="pt-0.5">
              <div className="w-4 h-4 relative">
                <BiSolidInfoSquare className="w-4 h-4 absolute left-0.5 top-0.5 text-blue" />
              </div>
            </div>
            <div className="flex-1 flex flex-col gap-2">
              <p className="text-blue text-sm font-normal font-['Marianne']">
                Nous avons pu récupérer un certains nombres d'informations sur cette copropriété. Vérifiez et complétez les informations ci-dessous
              </p>
              <div className="py-0.5 border-b border-purple-secondaryDarker w-fit">
                <span className="text-sm font-semibold text-purple-secondaryDarker">3 informations manquantes</span>
              </div>
            </div>
          </div>

          {/* Section Copropriété */}
          <div className="flex justify-between items-center mb-6">
            <div className="relative flex items-center gap-2">
              <FaRegBuilding className="w-5 h-5 absolute -left-8 top-1/2 -translate-y-1/2" />

              <h2 className="text-xl font-bold text-primary">Votre copropriété</h2>
              <span className="text-sm font-medium text-purple-600 underline">1 informations manquantes</span>
            </div>
          </div>

          <div className="space-y-8">
            <div>
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">ADRESSE</div>
              <AutocompleteBan />
            </div>

            <div>
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">ANNÉE DE CONSTRUCTION</div>
              <input
                type="text"
                name="constructionYear"
                className="text-primary-light font-bold border-2 border-green-800 rounded p-2 w-1/4 focus:border-purple-secondaryDarker"
                value={property.constructionYear}
                placeholder="1978"
                onChange={(e) => {
                  setProperty({ constructionYear: e.target.value });
                }}
              />
            </div>

            <div>
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">NOMBRE DE LOGEMENT</div>
              <input
                type="text"
                name="housingCount"
                className="text-primary-light font-bold border-2 border-green-800 rounded p-2 w-1/4 focus:border-purple-secondaryDarker"
                placeholder="10"
                value={property.housingCount}
                onChange={(e) => {
                  setProperty({ housingCount: e.target.value });
                }}
              />
            </div>

            <div>
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">SURFACE CHAUFFÉE</div>
              <div className="flex items-center border-2 border-green-800 rounded w-1/4 focus-within:border-purple-secondaryDarker">
                <input
                  type="text"
                  name="heatedArea"
                  placeholder="100"
                  className="text-primary-light font-bold p-2 flex-1 border-none focus:outline-none w-1/4"
                  value={property.heatedArea}
                  onChange={(e) => {
                    setProperty({ heatedArea: e.target.value });
                  }}
                />
                <span className="px-2 py-2">m²</span>
              </div>
            </div>

            <div>
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">TYPE D'ESPACE EXTÉRIEUR DISPONIBLE</div>
              <div className="grid grid-cols-3 gap-4 mt-2 w-2/3">
                <div
                  className={`relative border-2 border-green-800 rounded-lg p-4 text-center flex flex-col items-center cursor-pointer hover:bg-gray-50 ${
                    property.exteriorSpace === "common" ? "bg-gray-50" : ""
                  }`}
                  onClick={() => setProperty({ exteriorSpace: "common" })}
                >
                  <div className="h-12 flex items-center justify-center mb-3">
                    <img src={espaceCommun} alt="Espace commun" className="h-12 w-auto" />
                  </div>
                  <div className="text-xs font-medium mb-1">Extérieur commun</div>
                  <div className="text-xs text-gray-500">Proche chaufferie</div>
                  {property.exteriorSpace === "common" && <FaRegCheckCircle className="w-5 h-5 text-green-800 bg-green-100 rounded-full absolute top-2 right-2" />}
                </div>
                <div
                  className={`relative border-2 border-green-800 rounded-lg p-4 text-center flex flex-col items-center cursor-pointer hover:bg-gray-50 ${
                    property.exteriorSpace === "private" ? "bg-gray-50" : ""
                  }`}
                  onClick={() => setProperty({ exteriorSpace: "private" })}
                >
                  <div className="h-12 flex items-center justify-center mb-3">
                    <img src={espacePrivee} alt="Espace privé" className="h-12 w-auto" />
                  </div>
                  <div className="text-xs font-medium mb-1">Extérieur privé</div>
                  <div className="text-xs text-gray-500 mb-2">Balcon, cours, jardin...</div>
                  {property.exteriorSpace === "private" && <FaRegCheckCircle className="w-5 h-5 text-green-800 bg-green-100 rounded-full absolute top-2 right-2" />}
                </div>
                <div
                  className={`relative border-2 border-green-800 rounded-lg p-4 text-center flex flex-col items-center cursor-pointer hover:bg-gray-50 ${
                    property.exteriorSpace === "roofTerrace" ? "bg-gray-50" : ""
                  }`}
                  onClick={() => setProperty({ exteriorSpace: "roofTerrace" })}
                >
                  <div className="h-12 flex items-center justify-center mb-3">
                    <img src={toitTerrasse} alt="Toit terrasse" className="h-12 w-auto" />
                  </div>
                  <div className="text-xs font-medium mb-1">Toit terrasse</div>
                  <div className="text-xs text-gray-500">Commun</div>
                  {property.exteriorSpace === "roofTerrace" && <FaRegCheckCircle className="w-5 h-5 text-green-800 bg-green-100 rounded-full absolute top-2 right-2" />}
                </div>
              </div>
            </div>

            {/* Section: Système de chauffage */}
            <div className="mt-12">
              <div className="flex justify-between items-center mb-6">
                <div className="relative flex items-center gap-2">
                  <RiFireLine className="w-6 h-6 absolute -left-8 top-1/2 -translate-y-1/2 text-primary" />
                  <h2 className="text-xl font-bold text-primary">Système de chauffage</h2>
                  <span className="text-sm font-medium text-purple-600 underline">1 informations manquantes</span>
                </div>
              </div>

              <div className="flex flex-col gap-4">
                <div className="flex flex-wrap gap-4">
                  <div>
                    <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">CHAUFFAGE</div>
                    <div className="relative">
                      <select
                        className="w-full text-primary-light font-bold appearance-none bg-transparent focus:outline-none border-2 border-green-800 rounded p-2 pr-20 relative focus:border-purple-secondaryDarker"
                        value={property.heatingSystem?.type || ""}
                        onChange={(e) => setProperty({ heatingSystem: { ...property.heatingSystem, type: e.target.value } })}
                      >
                        <option value="" disabled>
                          Sélectionner
                        </option>
                        <option value="collective">Solution collective</option>
                        <option value="individual">Solution individuelle</option>
                      </select>
                      <FaAngleDown className="w-4 h-4 absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400" />
                    </div>
                  </div>

                  <div>
                    <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">ÉNERGIE</div>
                    <div className="relative">
                      <select
                        className="w-full text-primary-light font-bold appearance-none bg-transparent focus:outline-none border-2 border-green-800 rounded p-2 pr-12 relative focus:border-purple-secondaryDarker"
                        value={property.heatingSystem?.energy || ""}
                        onChange={(e) => setProperty({ heatingSystem: { ...property.heatingSystem, energy: e.target.value } })}
                      >
                        <option value="" disabled>
                          Sélectionner
                        </option>
                        <option value="Fioul">Fioul</option>
                        <option value="Gaz">Gaz</option>
                        <option value="Électrique">Électrique</option>
                        <option value="Bois">Bois</option>
                      </select>
                      <FaAngleDown className="w-4 h-4 absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400" />
                    </div>
                  </div>

                  <div>
                    <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">TYPE</div>
                    <div className="relative">
                      <select
                        className="w-full text-primary-light font-bold appearance-none bg-transparent focus:outline-none border-2 border-green-800 rounded p-2 pr-16 relative focus:border-purple-secondaryDarker"
                        value={property.heatingSystem?.heatingType || ""}
                        onChange={(e) => setProperty({ heatingSystem: { ...property.heatingSystem, heatingType: e.target.value } })}
                      >
                        <option value="" disabled>
                          Sélectionner
                        </option>
                        <option value="Plancher chauffant">Plancher chauffant</option>
                        <option value="Radiateurs">Radiateurs</option>
                        <option value="Convecteurs">Convecteurs</option>
                      </select>
                      <FaAngleDown className="w-4 h-4 absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400" />
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-4">
                  <div>
                    <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">EAU CHAUDE SANITAIRE</div>
                    <div className="relative">
                      <select
                        className="w-full text-primary-light font-bold appearance-none bg-transparent focus:outline-none border-2 border-green-800 rounded p-2 pr-20 relative focus:border-purple-secondaryDarker"
                        value={property.hotWaterSystem?.type || ""}
                        onChange={(e) => setProperty({ hotWaterSystem: { ...property.hotWaterSystem, type: e.target.value } })}
                      >
                        <option value="" disabled>
                          Sélectionner
                        </option>
                        <option value="collective">Solution collective</option>
                        <option value="individual">Solution individuelle</option>
                      </select>
                      <FaAngleDown className="w-4 h-4 absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400" />
                    </div>
                  </div>

                  <div>
                    <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">ÉNERGIE</div>
                    <div className="relative">
                      <select
                        className="w-full text-primary-light font-bold appearance-none bg-transparent focus:outline-none border-2 border-green-800 rounded p-2 pr-12 relative focus:border-purple-secondaryDarker"
                        value={property.hotWaterSystem?.energy || ""}
                        onChange={(e) => setProperty({ hotWaterSystem: { ...property.hotWaterSystem, energy: e.target.value } })}
                      >
                        <option value="" disabled>
                          Sélectionner
                        </option>
                        <option value="Fioul">Fioul</option>
                        <option value="Gaz">Gaz</option>
                        <option value="Électrique">Électrique</option>
                        <option value="Bois">Bois</option>
                      </select>
                      <FaAngleDown className="w-4 h-4 absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400" />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Section: Enveloppe énergétique */}
            <div className="mt-12">
              <div className="flex justify-between items-center mb-6">
                <div className="relative flex items-center gap-2">
                  <LuThermometerSnowflake className="w-6 h-6 absolute -left-8 top-1/2 -translate-y-1/2 text-primary" />
                  <h2 className="text-xl font-bold text-primary">Enveloppe énergétique</h2>
                  <span className="text-sm font-medium text-purple-600 underline">1 informations manquantes</span>
                </div>
                <button className="p-2 rounded-full hover:bg-gray-100">
                  <FaAngleDown className="w-4 h-4" />
                </button>
              </div>

              <div>
                <div className="flex justify-between items-center gap-4 w-full">
                  <div className="space-y-4 w-1/2">
                    <div className="text-sm font-normal mb-4">GESTES D'ISOLATION EFFECTUÉS IL Y A MOINS DE 15 ANS</div>
                    <div className="flex items-center">
                      <div className="relative mr-3">
                        <input
                          type="checkbox"
                          id="isolation-walls"
                          className="w-5 h-5 border-2 border-green-800 rounded opacity-0 absolute z-10 cursor-pointer"
                          checked={property.envelopeInsulation?.walls}
                          onChange={(e) => setProperty({ envelopeInsulation: { ...property.envelopeInsulation, walls: e.target.checked } })}
                        />
                        <div
                          className={`w-5 h-5 border-2 rounded ${
                            property.envelopeInsulation?.walls ? "bg-purple-secondaryDarker border-purple-secondaryDarker" : "bg-white border-green-800"
                          }`}
                        >
                          {property.envelopeInsulation?.walls && (
                            <svg className="w-3 h-3 mx-auto mt-0.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path>
                            </svg>
                          )}
                        </div>
                      </div>
                      <label htmlFor="isolation-walls" className="text-base">
                        Isolation des murs
                      </label>
                    </div>

                    <div className="flex items-center">
                      <div className="relative mr-3">
                        <input
                          type="checkbox"
                          id="isolation-roof"
                          className="w-5 h-5 border-2 border-green-800 rounded opacity-0 absolute z-10 cursor-pointer"
                          checked={property.envelopeInsulation?.roof}
                          onChange={(e) => setProperty({ envelopeInsulation: { ...property.envelopeInsulation, roof: e.target.checked } })}
                        />
                        <div
                          className={`w-5 h-5 border-2 rounded ${
                            property.envelopeInsulation?.roof ? "bg-purple-secondaryDarker border-purple-secondaryDarker" : "bg-white border-green-800"
                          }`}
                        >
                          {property.envelopeInsulation?.roof && (
                            <svg className="w-3 h-3 mx-auto mt-0.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path>
                            </svg>
                          )}
                        </div>
                      </div>
                      <label htmlFor="isolation-roof" className="text-base">
                        Isolation du toit
                      </label>
                    </div>

                    <div className="flex items-center">
                      <div className="relative mr-3">
                        <input
                          type="checkbox"
                          id="isolation-floors"
                          className="w-5 h-5 border-2 border-green-800 rounded opacity-0 absolute z-10 cursor-pointer"
                          checked={property.envelopeInsulation?.floors}
                          onChange={(e) => setProperty({ envelopeInsulation: { ...property.envelopeInsulation, floors: e.target.checked } })}
                        />
                        <div
                          className={`w-5 h-5 border-2 rounded ${
                            property.envelopeInsulation?.floors ? "bg-purple-secondaryDarker border-purple-secondaryDarker" : "bg-white border-green-800"
                          }`}
                        >
                          {property.envelopeInsulation?.floors && (
                            <svg className="w-3 h-3 mx-auto mt-0.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path>
                            </svg>
                          )}
                        </div>
                      </div>
                      <label htmlFor="isolation-floors" className="text-base">
                        Isolation des sols
                      </label>
                    </div>

                    <div className="flex items-center">
                      <div className="relative mr-3">
                        <input
                          type="checkbox"
                          id="isolation-windows"
                          className="w-5 h-5 border-2 border-green-800 rounded opacity-0 absolute z-10 cursor-pointer"
                          checked={property.envelopeInsulation?.windows}
                          onChange={(e) => setProperty({ envelopeInsulation: { ...property.envelopeInsulation, windows: e.target.checked } })}
                        />
                        <div
                          className={`w-5 h-5 border-2 rounded ${
                            property.envelopeInsulation?.windows ? "bg-purple-secondaryDarker border-purple-secondaryDarker" : "bg-white border-green-800"
                          }`}
                        >
                          {property.envelopeInsulation?.windows && (
                            <svg className="w-3 h-3 mx-auto mt-0.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path>
                            </svg>
                          )}
                        </div>
                      </div>
                      <label htmlFor="isolation-windows" className="text-base">
                        Changement des huisseries
                      </label>
                    </div>

                    <div className="flex items-center mb-6">
                      <div className="relative mr-3">
                        <input
                          type="checkbox"
                          id="isolation-none"
                          className="w-5 h-5 border-2 border-green-800 rounded opacity-0 absolute z-10 cursor-pointer"
                          checked={property.envelopeInsulation?.none}
                          onChange={(e) => setProperty({ envelopeInsulation: { ...property.envelopeInsulation, none: e.target.checked } })}
                        />
                        <div
                          className={`w-5 h-5 border-2 rounded ${
                            property.envelopeInsulation?.none ? "bg-purple-secondaryDarker border-purple-secondaryDarker" : "bg-white border-green-800"
                          }`}
                        >
                          {property.envelopeInsulation?.none && (
                            <svg className="w-3 h-3 mx-auto mt-0.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path>
                            </svg>
                          )}
                        </div>
                      </div>
                      <label htmlFor="isolation-none" className="text-base">
                        Aucun
                      </label>
                    </div>
                  </div>

                  <div className="bg-green-50 p-4 pl-12 rounded-md flex flex-col items-start w-1/2 gap-12">
                    <div className="relative">
                      <img src={Logo} className="w-5 absolute -left-8 top-0 text-primary" />
                      <p className="text-sm text-green-800">
                        Nous calculons la qualité de l’enveloppe à partir des données public de votre bâtiment et des potentiel travaux d’isolation réalisés
                      </p>
                    </div>

                    <div className="flex flex-col items-start gap-2">
                      <div className="text-sm font-light">ESTIMATION DE LA QUALITÉ DE L'ENVELOPPE ÉNERGÉTIQUE</div>
                      <div className="text-sm font-medium text-green-700 bg-green-200 rounded-full w-fit p-2">BONNE</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Section: Contraintes particulières */}
            <div className="mt-12">
              <div className="flex justify-between items-center mb-6">
                <div className="relative flex items-center gap-2">
                  <RiSurveyLine className="w-6 h-6 absolute -left-8 top-1/2 -translate-y-1/2 text-primary" />
                  <h2 className="text-xl font-bold text-primary">Contraintes particulières</h2>
                </div>
                <button className="p-2 rounded-full hover:bg-gray-100">
                  <FaAngleDown className="w-4 h-4" />
                </button>
              </div>

              <div className="flex flex-col gap-4">
                <div className="mb-4">
                  <div className="text-base font-medium mb-2">RÉSEAU DE CHALEUR</div>
                  <div className="relative w-fit">
                    <select className="text-primary-light font-bold appearance-none bg-transparent focus:outline-none border-2 border-green-800 rounded p-2 pr-20 relative focus:border-purple-secondaryDarker">
                      <option value="priority">Zone de déploiement prioritaire</option>
                      <option value="nonPriority">Zone non prioritaire</option>
                    </select>
                    <FaAngleDown className="w-4 h-4 absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400" />
                  </div>
                </div>

                <div className="mb-4">
                  <div className="text-base font-medium mb-2">PROTECTION PATRIMONIALE</div>
                  <div className="relative w-fit">
                    <select className="text-primary-light font-bold appearance-none bg-transparent focus:outline-none border-2 border-green-800 rounded p-2 pr-20 relative focus:border-purple-secondaryDarker">
                      <option value="historic">Monument historique</option>
                      <option value="none">Aucune</option>
                    </select>
                    <FaAngleDown className="w-4 h-4 absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400" />
                  </div>
                </div>

                <div className="mb-4">
                  <div className="text-base font-medium mb-2">PROTECTION ENVIRONNEMENTALE</div>
                  <div className="relative w-fit">
                    <select className="text-primary-light font-bold appearance-none bg-transparent focus:outline-none border-2 border-green-800 rounded p-2 pr-20 relative focus:border-purple-secondaryDarker">
                      <option value="classified">Site classé</option>
                      <option value="none">Aucune</option>
                    </select>
                    <FaAngleDown className="w-4 h-4 absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400" />
                  </div>
                </div>

                <div className="mb-4">
                  <div className="text-base font-medium mb-2">PROTECTION DE L'ATMOSPHÈRE</div>
                  <div className="flex w-52">
                    <button
                      className={`p-2 border-2 border-r-0 rounded-l-md text-primary-light font-bold focus:outline-none focus:ring-0 w-full transition-colors duration-300 ${
                        property.constraints?.environmental === true
                          ? "bg-purple-secondaryDarker border-purple-secondaryDarker text-white hover:bg-purple-secondaryDarker"
                          : "border-green-800 hover:bg-gray-50"
                      }`}
                      onClick={() => setProperty({ constraints: { ...property.constraints, environmental: true } })}
                    >
                      Oui
                    </button>
                    <button
                      className={`p-2 border-2 border-l-0 rounded-r-md text-primary-light font-bold focus:outline-none focus:ring-0 w-full transition-colors duration-300 ${
                        property.constraints?.environmental === false
                          ? "bg-purple-secondaryDarker border-purple-secondaryDarker text-white hover:bg-purple-secondaryDarker"
                          : "border-green-800 hover:bg-gray-50"
                      }`}
                      onClick={() => setProperty({ constraints: { ...property.constraints, environmental: false } })}
                    >
                      Non
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Save/Cancel buttons with shadow effect */}
          </div>
        </div>

        {/* Footer with buttons */}
        <div className="bg-white border-t-2 border-primary">
          <div className="relative z-50">
            <div className="relative z-10 flex items-center gap-8 p-4 px-8">
              <button onClick={closeModal} className="button-primary font-light">
                <span>Enregistrer</span>
                <FaArrowUp />
              </button>
              <button onClick={closeModal} className="button-secondary">
                <FaArrowLeft />
                <span>Annuler</span>
              </button>
            </div>
            <img src={HeaderSideShadow} alt="side-shadow" className="absolute top-0 right-0 h-full z-20" />
          </div>
        </div>
      </div>

      {/* Dark overlay - 30% width */}
      <div className="w-[30%] bg-black/30" onClick={closeModal}></div>
    </div>
  );
};

export default PropertyEditPanel;
