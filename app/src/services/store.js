import { create } from "zustand"

const store = create(set => ({
  user: null,
  setUser: user => set(() => ({ user })),

  organization: null,
  setOrganization: organization => set(() => ({ organization }))
}))

export default store
