import { create } from "zustand";

interface SystemInfo {
  type: "collective" | "individual" | "";
  energy: string;
  heatingType?: string;
}

interface EnvelopeInsulation {
  walls?: boolean;
  roof?: boolean;
  floors?: boolean;
  windows?: boolean;
  none?: boolean;
}

interface PropertyConstraints {
  heatNetwork: string;
  heritage: string;
  environmental: boolean;
  atmosphereProtection?: string;
}

export interface Property {
  address: string;
  lat: number;
  lon: number;
  constructionYear: string;
  housingCount: string;
  heatedArea: string;
  exteriorSpace: "common" | "private" | "roofTerrace" | "";
  envelopeQuality: string;
  heatingSystem: SystemInfo;
  hotWaterSystem: SystemInfo;
  envelopeInsulation?: EnvelopeInsulation;
  constraints: PropertyConstraints;
}

interface PropertyState {
  property: Property;
  isModalOpen?: boolean;
  openModal: () => void;
  closeModal: () => void;
  setProperty: (updates: Partial<Property>) => void;
}

export const usePropertyStore = create<PropertyState>((set) => ({
  // État initial de la propriété
  property: {
    address: "",
    lat: 0,
    lon: 0,
    constructionYear: "",
    housingCount: "",
    heatedArea: "",
    exteriorSpace: "",
    envelopeQuality: "",
    heatingSystem: {
      type: "",
      energy: "",
      heatingType: "",
    },
    hotWaterSystem: {
      type: "",
      energy: "",
    },
    envelopeInsulation: {
      walls: false,
      roof: false,
      floors: false,
      windows: false,
      none: false,
    },
    constraints: {
      heatNetwork: "",
      heritage: "",
      environmental: false,
      atmosphereProtection: "",
    },
  },

  // State
  isModalOpen: false,

  // Actions
  openModal: () => set({ isModalOpen: true }),
  closeModal: () => set({ isModalOpen: false }),

  setProperty: (updates: Partial<Property>) =>
    set((state) => ({
      property: { ...state.property, ...updates },
    })),
}));
