import { create } from "zustand";

const store = create((set) => ({
  user: null,
  setUser: (user) => set(() => ({ user })),
}));

export default store;
