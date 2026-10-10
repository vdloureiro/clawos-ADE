import { create } from 'zustand'

/** Abas de arquivo com edição não salva (para o ● na aba e confirmar ao fechar). */
export const useDirtyFiles = create<{
  dirty: Record<string, true>
  set: (path: string, dirty: boolean) => void
}>((set) => ({
  dirty: {},
  set: (path, dirty) =>
    set((s) => {
      if (Boolean(s.dirty[path]) === dirty) return s
      const next = { ...s.dirty }
      if (dirty) next[path] = true
      else delete next[path]
      return { dirty: next }
    }),
}))
