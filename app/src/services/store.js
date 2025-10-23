import { create } from "zustand"

const store = create(set => ({
  user: null,
  setUser: user => set(() => ({ user })),

  collectivity: null,
  setCollectivity: collectivity => set(() => ({ collectivity })),

  userActionRights: [],
  setActionRights: userActionRights => set(() => ({ userActionRights }))
}))

export default store
