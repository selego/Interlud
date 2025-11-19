import { create } from "zustand"

const store = create(set => ({
  user: null,
  setUser: user => set(() => ({ user })),

  collectivity: null,
  setCollectivity: collectivity => set(() => ({ collectivity })),

  userActionRights: [],
  setActionRights: userActionRights => set(() => ({ userActionRights })),

  userIndicatorRights: [],
  setIndicatorRights: userIndicatorRights => set(() => ({ userIndicatorRights }))
}))

export default store
