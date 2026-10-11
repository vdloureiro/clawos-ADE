import { create } from 'zustand'
import type { AgentStatus } from '@shared/types'

interface AgentsState {
  statuses: AgentStatus[]
  loading: boolean
  /** Quando a última verificação terminou (para mostrar "verificado agora"). */
  checkedAt: number | null
  /** `force` refaz a detecção (relendo o PATH); `quiet` não mostra o indicador. */
  refresh: (force?: boolean, options?: { quiet?: boolean }) => Promise<void>
}

/** O indicador gira por pelo menos este tempo, para a pessoa ver que algo aconteceu. */
const MIN_SPIN_MS = 700

export const useAgentsStore = create<AgentsState>((set) => ({
  statuses: [],
  loading: false,
  checkedAt: null,
  refresh: async (force = false, options = {}) => {
    const started = Date.now()
    if (!options.quiet) set({ loading: true })
    try {
      const statuses = await window.clawos.invoke('agents:status', force)
      if (!options.quiet) {
        const wait = MIN_SPIN_MS - (Date.now() - started)
        if (wait > 0) await new Promise((r) => setTimeout(r, wait))
      }
      set({ statuses, checkedAt: Date.now() })
    } finally {
      if (!options.quiet) set({ loading: false })
    }
  },
}))
