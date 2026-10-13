import { create } from 'zustand'
import type { PermissionDefault, Project, ProjectFolder, SidebarArrangement } from '@shared/types'
import { useUiStore } from './ui'

const ACTIVE_KEY = 'clawos.activeProject'

function readActive(): string | null {
  try {
    return localStorage.getItem(ACTIVE_KEY)
  } catch {
    return null
  }
}

interface ProjectsState {
  projects: Project[]
  folders: ProjectFolder[]
  activeId: string | null
  /** Projetos já abertos nesta execução (seus docks ficam montados). */
  visited: string[]
  load: () => Promise<void>
  select: (id: string | null) => void
  /** Abre o assistente de novo projeto. */
  add: () => void
  /** Recarrega a lista após o assistente criar um projeto e o seleciona. */
  created: (project: Project) => Promise<void>
  update: (
    id: string,
    patch: { name?: string; color?: string; permissionDefault?: PermissionDefault | null },
  ) => Promise<void>
  reorder: (ids: string[]) => Promise<void>
  /** Grava a nova ordem da barra lateral (já atualiza a tela antes do disco). */
  arrange: (items: SidebarArrangement) => Promise<void>
  createFolder: (name: string) => Promise<ProjectFolder>
  updateFolder: (id: string, patch: { name?: string; collapsed?: boolean }) => Promise<void>
  deleteFolder: (id: string) => Promise<void>
  remove: (id: string) => Promise<void>
}

export const useProjectsStore = create<ProjectsState>((set, get) => ({
  projects: [],
  folders: [],
  activeId: null,
  visited: [],

  load: async () => {
    const [projects, folders] = await Promise.all([
      window.clawos.invoke('projects:list'),
      window.clawos.invoke('folders:list'),
    ])
    const saved = readActive()
    const activeId = projects.some((p) => p.id === saved) ? saved : (projects[0]?.id ?? null)
    set({ projects, folders, activeId, visited: activeId ? [activeId] : [] })
  },

  select: (id) => {
    set((s) => ({
      activeId: id,
      visited: id && !s.visited.includes(id) ? [...s.visited, id] : s.visited,
    }))
    try {
      if (id) localStorage.setItem(ACTIVE_KEY, id)
    } catch {
      // localStorage indisponível: só não lembra o último projeto.
    }
  },

  add: () => useUiStore.getState().setNewProjectOpen(true),

  created: async (project) => {
    const projects = await window.clawos.invoke('projects:list')
    set({ projects })
    get().select(project.id)
  },

  update: async (id, patch) => {
    const updated = await window.clawos.invoke('projects:update', id, patch)
    set((s) => ({ projects: s.projects.map((p) => (p.id === id ? updated : p)) }))
  },

  reorder: async (ids) => {
    set((s) => ({
      projects: ids.map((id) => s.projects.find((p) => p.id === id)!).filter(Boolean),
    }))
    await window.clawos.invoke('projects:reorder', ids)
  },

  arrange: async (items) => {
    // Aplica na hora (a tela não "pisca" ao soltar) e depois grava.
    set((s) => {
      const projects = s.projects.map((p) => ({ ...p }))
      const folders = s.folders.map((f) => ({ ...f }))
      items.forEach((item, index) => {
        if (item.type === 'project') {
          const p = projects.find((x) => x.id === item.id)
          if (p) Object.assign(p, { folderId: null, sortOrder: index })
          return
        }
        const f = folders.find((x) => x.id === item.id)
        if (f) f.sortOrder = index
        item.projectIds.forEach((pid, i) => {
          const p = projects.find((x) => x.id === pid)
          if (p) Object.assign(p, { folderId: item.id, sortOrder: i })
        })
      })
      return { projects, folders }
    })
    await window.clawos.invoke('projects:arrange', items)
  },

  createFolder: async (name) => {
    const folder = await window.clawos.invoke('folders:create', name)
    set((s) => ({ folders: [...s.folders, folder] }))
    return folder
  },

  updateFolder: async (id, patch) => {
    set((s) => ({ folders: s.folders.map((f) => (f.id === id ? { ...f, ...patch } : f)) }))
    const updated = await window.clawos.invoke('folders:update', id, patch)
    set((s) => ({ folders: s.folders.map((f) => (f.id === id ? updated : f)) }))
  },

  deleteFolder: async (id) => {
    await window.clawos.invoke('folders:delete', id)
    const [projects, folders] = await Promise.all([
      window.clawos.invoke('projects:list'),
      window.clawos.invoke('folders:list'),
    ])
    set({ projects, folders })
  },

  remove: async (id) => {
    await window.clawos.invoke('projects:remove', id)
    const projects = await window.clawos.invoke('projects:list')
    set({ projects })
    if (get().activeId === id) get().select(projects[0]?.id ?? null)
  },
}))

export function useActiveProject(): Project | null {
  return useProjectsStore((s) => s.projects.find((p) => p.id === s.activeId) ?? null)
}
