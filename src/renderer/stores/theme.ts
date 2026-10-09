import { create } from 'zustand'

type Theme = 'light' | 'dark'

interface ThemeState {
  theme: Theme
  toggle: () => void
}

const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches

export const useThemeStore = create<ThemeState>((set) => ({
  theme: prefersDark ? 'dark' : 'light',
  toggle: () => set((s) => ({ theme: s.theme === 'dark' ? 'light' : 'dark' })),
}))
