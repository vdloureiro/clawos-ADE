import { create } from 'zustand'
import { applyEvent, type ChatState } from '@shared/chat'
import type { AgentId, SessionEvent, SessionMode, SessionSummary } from '@shared/types'

interface SessionsState {
  /** Chats carregados (abertos ao menos uma vez nesta execução). */
  chats: Record<string, ChatState>
  /** Conversas por projeto (inclui encerradas, do histórico). */
  summaries: Record<string, SessionSummary[]>
  /** Conversa em foco em cada projeto. */
  activeByProject: Record<string, string | null>

  loadAll: () => Promise<void>
  loadProject: (projectId: string) => Promise<void>
  create: (projectId: string, agentId?: AgentId, mode?: SessionMode) => Promise<SessionSummary>
  /** Garante o chat carregado (retomando o agente se estiver encerrado). */
  load: (sessionId: string) => Promise<void>
  apply: (sessionId: string, event: SessionEvent) => void
  rename: (sessionId: string, title: string) => Promise<void>
  /** Reinicia o processo do agente e recarrega o chat (após erro ou queda). */
  restart: (sessionId: string) => Promise<void>
  remove: (sessionId: string, projectId: string) => Promise<void>
  setActive: (projectId: string, sessionId: string | null) => void
}

export const useSessionsStore = create<SessionsState>((set, get) => ({
  chats: {},
  summaries: {},
  activeByProject: {},

  loadAll: async () => {
    const all = await window.clawos.invoke('sessions:listAll')
    const summaries: Record<string, SessionSummary[]> = {}
    for (const s of all) (summaries[s.projectId] ??= []).push(s)
    set({ summaries })
  },

  loadProject: async (projectId) => {
    const list = await window.clawos.invoke('sessions:list', projectId)
    set((s) => {
      // Títulos mudam no main (primeira mensagem, renomear); reflete nos chats abertos.
      const chats = { ...s.chats }
      for (const summary of list) {
        const chat = chats[summary.id]
        if (chat && chat.info.title !== summary.title) {
          chats[summary.id] = { ...chat, info: { ...chat.info, title: summary.title } }
        }
      }
      return { chats, summaries: { ...s.summaries, [projectId]: list } }
    })
  },

  create: async (projectId, agentId, mode) => {
    const summary = await window.clawos.invoke('session:create', projectId, agentId, mode)
    set((s) => ({
      summaries: { ...s.summaries, [projectId]: [summary, ...(s.summaries[projectId] ?? [])] },
    }))
    await get().load(summary.id)
    return summary
  },

  load: async (sessionId) => {
    if (get().chats[sessionId]) {
      // Já carregado; se o processo foi encerrado, reabrir retoma a sessão no main.
      const summary = Object.values(get().summaries)
        .flat()
        .find((s) => s.id === sessionId)
      if (!summary || summary.live) return
    }
    const chat = await window.clawos.invoke('session:open', sessionId)
    set((s) => ({ chats: { ...s.chats, [sessionId]: chat } }))
  },

  apply: (sessionId, event) =>
    set((s) => {
      const current = s.chats[sessionId]
      // Eventos de sessões ainda não abertas na UI são ignorados; o main tem o estado.
      if (!current) return s
      return { chats: { ...s.chats, [sessionId]: applyEvent(current, event) } }
    }),

  restart: async (sessionId) => {
    const chat = await window.clawos.invoke('session:restart', sessionId)
    set((s) => ({ chats: { ...s.chats, [sessionId]: chat } }))
  },

  rename: async (sessionId, title) => {
    await window.clawos.invoke('session:rename', sessionId, title)
  },

  remove: async (sessionId, projectId) => {
    await window.clawos.invoke('session:delete', sessionId)
    set((s) => {
      const chats = { ...s.chats }
      delete chats[sessionId]
      const active =
        s.activeByProject[projectId] === sessionId ? null : s.activeByProject[projectId]
      return { chats, activeByProject: { ...s.activeByProject, [projectId]: active ?? null } }
    })
  },

  setActive: (projectId, sessionId) =>
    set((s) => ({ activeByProject: { ...s.activeByProject, [projectId]: sessionId } })),
}))

/** Liga os eventos do main ao store. Chamado uma vez na inicialização. */
export function subscribeToSessionEvents(): () => void {
  const offEvent = window.clawos.on('session:event', ({ sessionId, event }) =>
    useSessionsStore.getState().apply(sessionId, event),
  )
  const offChanged = window.clawos.on('sessions:changed', ({ projectId }) => {
    void useSessionsStore.getState().loadProject(projectId)
  })
  return () => {
    offEvent()
    offChanged()
  }
}

export type ProjectActivity = 'working' | 'awaiting' | 'error' | null

/** Indicador da sidebar: ◐ aguardando aprovação > ● trabalhando > ! erro. */
export function projectActivity(summaries: SessionSummary[] | undefined): ProjectActivity {
  const live = (summaries ?? []).filter((s) => s.live)
  if (live.some((s) => s.status === 'awaiting_permission')) return 'awaiting'
  if (live.some((s) => s.status === 'working')) return 'working'
  if (live.some((s) => s.status === 'error')) return 'error'
  return null
}
