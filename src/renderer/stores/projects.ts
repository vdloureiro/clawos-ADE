import { create } from 'zustand'
import type { Project } from '@shared/types'

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
  activeId: string | null
  /** Projetos já abertos nesta execução (seus docks ficam montados). */
  visited: string[]
  load: () => Promise<void>
  select: (id: string | null) => void
  add: () => Promise<Project | null>
  update: (id: string, patch: { name?: string; color?: string }) => Promise<void>
  reorder: (ids: string[]) => Promise<void>
  remove: (id: string) => Promise<void>
}

export const useProjectsStore = create<ProjectsState>((set, get) => ({
  projects: [],
  activeId: null,
  visited: [],

  load: async () => {
    const projects = await window.clawos.invoke('projects:list')
    const saved = readActive()
    const activeId = projects.some((p) => p.id === saved) ? saved : (projects[0]?.id ?? null)
    set({ projects, activeId, visited: activeId ? [activeId] : [] })
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

  add: async () => {
    const project = await window.clawos.invoke('projects:add')
    if (!project) return null
    const projects = await window.clawos.invoke('projects:list')
    set({ projects })
    get().select(project.id)
    return project
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
