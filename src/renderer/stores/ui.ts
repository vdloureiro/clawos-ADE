import { create } from 'zustand'

/** O que a área principal mostra: os painéis de chat do projeto ou uma lista de tarefas. */
export type MainView = { kind: 'chat' } | { kind: 'tasks'; projectId: string | null }

/** Estado de navegação/overlays da interface. */
interface UiState {
  view: MainView
  setView: (view: MainView) => void
  paletteOpen: boolean
  settingsProjectId: string | null
  globalSettingsOpen: boolean
  newProjectOpen: boolean
  /** Assistente de primeiro acesso (instalar agentes, entrar, criar projeto). */
  onboardingOpen: boolean
  /** Celular: arquivo aberto em tela cheia (no desktop ele abre numa aba do dock). */
  mobileFile: { path: string; line?: number; nonce: number } | null
  setMobileFile: (file: { path: string; line?: number; nonce: number } | null) => void
  setOnboardingOpen: (open: boolean) => void
  setPaletteOpen: (open: boolean) => void
  openProjectSettings: (projectId: string | null) => void
  setGlobalSettingsOpen: (open: boolean) => void
  setNewProjectOpen: (open: boolean) => void
}

export const useUiStore = create<UiState>((set) => ({
  view: { kind: 'chat' },
  setView: (view) => set({ view }),
  paletteOpen: false,
  settingsProjectId: null,
  globalSettingsOpen: false,
  newProjectOpen: false,
  onboardingOpen: false,
  mobileFile: null,
  setMobileFile: (mobileFile) => set({ mobileFile }),
  setOnboardingOpen: (onboardingOpen) => set({ onboardingOpen }),
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
  openProjectSettings: (settingsProjectId) => set({ settingsProjectId }),
  setGlobalSettingsOpen: (globalSettingsOpen) => set({ globalSettingsOpen }),
  setNewProjectOpen: (newProjectOpen) => set({ newProjectOpen }),
}))
