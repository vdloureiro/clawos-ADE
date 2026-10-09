import { create } from 'zustand'

export type ThemePreference = 'light' | 'dark' | 'system'
type Theme = 'light' | 'dark'

const KEY = 'clawos.theme'
const media = window.matchMedia('(prefers-color-scheme: dark)')

function readPreference(): ThemePreference {
  try {
    const value = localStorage.getItem(KEY)
    return value === 'light' || value === 'dark' ? value : 'system'
  } catch {
    return 'system'
  }
}

function resolve(preference: ThemePreference): Theme {
  if (preference === 'system') return media.matches ? 'dark' : 'light'
  return preference
}

interface ThemeState {
  preference: ThemePreference
  /** Tema efetivo (resolvido a partir da preferência e do sistema). */
  theme: Theme
  setPreference: (preference: ThemePreference) => void
  toggle: () => void
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  preference: readPreference(),
  theme: resolve(readPreference()),
  setPreference: (preference) => {
    try {
      localStorage.setItem(KEY, preference)
    } catch {
      // Sem localStorage: vale só nesta execução.
    }
    set({ preference, theme: resolve(preference) })
  },
  toggle: () => get().setPreference(get().theme === 'dark' ? 'light' : 'dark'),
}))

media.addEventListener('change', () => {
  const { preference } = useThemeStore.getState()
  if (preference === 'system') useThemeStore.setState({ theme: resolve('system') })
})
