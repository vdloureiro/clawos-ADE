import { create } from 'zustand'
import type { AgentStatus } from '@shared/types'

interface AgentsState {
  statuses: AgentStatus[]
  loading: boolean
  refresh: (force?: boolean) => Promise<void>
}

export const useAgentsStore = create<AgentsState>((set) => ({
  statuses: [],
  loading: false,
  refresh: async (force = false) => {
    set({ loading: true })
    try {
      set({ statuses: await window.clawos.invoke('agents:status', force) })
    } finally {
      set({ loading: false })
    }
  },
}))
