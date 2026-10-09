import { create } from 'zustand'
import type { AgentId, SessionEvent } from '@shared/types'
import { applyEvent, createChatState, type ChatState } from '@/lib/chat'

interface SessionsState {
  sessions: Record<string, ChatState>
  create: (agentId: AgentId, cwd: string) => Promise<string>
  apply: (sessionId: string, event: SessionEvent) => void
  close: (sessionId: string) => Promise<void>
}

export const useSessionsStore = create<SessionsState>((set) => ({
  sessions: {},

  create: async (agentId, cwd) => {
    const info = await window.clawos.invoke('session:create', agentId, cwd)
    set((s) => {
      // Eventos podem ter chegado antes da resposta do invoke.
      const existing = s.sessions[info.id]
      const state = existing ? { ...existing, info } : createChatState(info)
      return { sessions: { ...s.sessions, [info.id]: state } }
    })
    return info.id
  },

  apply: (sessionId, event) =>
    set((s) => {
      const current =
        s.sessions[sessionId] ?? createChatState({ id: sessionId, agentId: 'claude', cwd: '' })
      return { sessions: { ...s.sessions, [sessionId]: applyEvent(current, event) } }
    }),

  close: async (sessionId) => {
    await window.clawos.invoke('session:close', sessionId)
    set((s) => {
      const sessions = { ...s.sessions }
      delete sessions[sessionId]
      return { sessions }
    })
  },
}))

/** Liga os eventos do main ao store. Chamado uma vez na inicialização. */
export function subscribeToSessionEvents(): () => void {
  return window.clawos.on('session:event', ({ sessionId, event }) =>
    useSessionsStore.getState().apply(sessionId, event),
  )
}
