import { create } from "zustand"

const store = create((set) => ({
  user: null,
  setUser: (user) => set(() => ({ user })),

  collectivity: null,
  setCollectivity: (collectivity) => set(() => ({ collectivity })),

  economicActor: null,
  setEconomicActor: (economicActor) => set(() => ({ economicActor })),

  userActionRights: [],
  setActionRights: (userActionRights) => set(() => ({ userActionRights }))
}))

export default store
