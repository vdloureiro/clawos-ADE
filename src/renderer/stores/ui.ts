import { create } from 'zustand'

/** Estado de navegação/overlays da interface. */
interface UiState {
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
  paletteOpen: false,
  settingsProjectId: null,
  globalSettingsOpen: false,
  newProjectOpen: false,
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
  openProjectSettings: (settingsProjectId) => set({ settingsProjectId }),
  setGlobalSettingsOpen: (globalSettingsOpen) => set({ globalSettingsOpen }),
  setNewProjectOpen: (newProjectOpen) => set({ newProjectOpen }),
}))
