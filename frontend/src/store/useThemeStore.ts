import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const useTheme = create<{ dark: boolean; toggle: () => void }>()(
  persist((set, get) => ({ dark: true, toggle: () => set({ dark: !get().dark }) }), { name: 'orbitalops-theme' })
);
