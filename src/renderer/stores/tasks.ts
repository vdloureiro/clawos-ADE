import { create } from 'zustand'
import type { AgentId, NewTaskInput, SessionMode, Task, TaskPatch } from '@shared/types'

interface TasksState {
  /** Tarefas carregadas por projeto. */
  byProject: Record<string, Task[]>
  /** Tarefas abertas por projeto (barra lateral). */
  counts: Record<string, number>
  loadProject: (projectId: string) => Promise<void>
  loadAll: () => Promise<void>
  loadCounts: () => Promise<void>
  create: (input: NewTaskInput) => Promise<Task>
  update: (id: string, patch: TaskPatch) => Promise<Task>
  remove: (id: string) => Promise<void>
  reorder: (projectId: string, ids: string[]) => Promise<void>
  delegate: (
    id: string,
    agentId: AgentId,
    mode: SessionMode,
  ) => Promise<{ task: Task; sessionId: string }>
}

export const useTasksStore = create<TasksState>((set, get) => ({
  byProject: {},
  counts: {},

  loadProject: async (projectId) => {
    const tasks = await window.clawos.invoke('tasks:list', projectId)
    set((s) => ({ byProject: { ...s.byProject, [projectId]: tasks } }))
  },

  loadAll: async () => {
    const tasks = await window.clawos.invoke('tasks:list', null)
    const byProject: Record<string, Task[]> = {}
    for (const t of tasks) (byProject[t.projectId] ??= []).push(t)
    set({ byProject })
  },

  loadCounts: async () => set({ counts: await window.clawos.invoke('tasks:counts') }),

  create: (input) => window.clawos.invoke('tasks:create', input),
  update: (id, patch) => window.clawos.invoke('tasks:update', id, patch),
  remove: (id) => window.clawos.invoke('tasks:delete', id),

  reorder: async (projectId, ids) => {
    // Atualiza na hora para o arraste não "pular".
    const current = get().byProject[projectId] ?? []
    const ordered = ids
      .map((id) => current.find((t) => t.id === id))
      .filter((t): t is Task => Boolean(t))
    const rest = current.filter((t) => !ids.includes(t.id))
    set((s) => ({ byProject: { ...s.byProject, [projectId]: [...ordered, ...rest] } }))
    await window.clawos.invoke('tasks:reorder', ids)
  },

  delegate: async (id, agentId, mode) => {
    const { task, session } = await window.clawos.invoke('tasks:delegate', id, agentId, mode)
    return { task, sessionId: session.id }
  },
}))

/** Mantém o store em dia com mudanças feitas no main (ou em outra tela). */
export function subscribeToTaskEvents(): () => void {
  void useTasksStore.getState().loadCounts()
  return window.clawos.on('tasks:changed', ({ projectId }) => {
    const state = useTasksStore.getState()
    void state.loadProject(projectId)
    void state.loadCounts()
  })
}
