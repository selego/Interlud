import { create } from "zustand"

const store = create(set => ({
  user: null,
  setUser: user => set(() => ({ user })),

  collectivity: null,
  setCollectivity: collectivity => set(() => ({ collectivity }))
}))

export default store
