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
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
  openProjectSettings: (settingsProjectId) => set({ settingsProjectId }),
  setGlobalSettingsOpen: (globalSettingsOpen) => set({ globalSettingsOpen }),
  setNewProjectOpen: (newProjectOpen) => set({ newProjectOpen }),
}))
