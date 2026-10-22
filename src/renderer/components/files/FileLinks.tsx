import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { openFileInDock } from '@/lib/dock'
import { looksLikePath, splitLine } from '@/lib/filePanels'
import { cn } from '@/lib/utils'

/**
 * Links para arquivos no chat (como no VS Code): caminhos citados pelo agente abrem
 * numa aba do dock. Caminhos relativos são resolvidos a partir de `cwd`.
 */
interface FileLinkContextValue {
  projectId: string
  cwd: string
  /** Painel de onde veio o clique (a aba abre ao lado dele). */
  panelId?: string
}

const FileLinkContext = createContext<FileLinkContextValue | null>(null)

export function FileLinkProvider({
  value,
  children,
}: {
  value: FileLinkContextValue
  children: ReactNode
}) {
  return <FileLinkContext.Provider value={value}>{children}</FileLinkContext.Provider>
}

/** Projeto e pasta da conversa onde o componente está (null fora do chat). */
export function useChatContext(): FileLinkContextValue | null {
  return useContext(FileLinkContext)
}

const cache = new Map<string, Promise<string | null>>()

function resolveFile(path: string, cwd: string): Promise<string | null> {
  const key = `${cwd}\0${path}`
  let found = cache.get(key)
  if (!found) {
    found = window.clawos
      .invoke('files:resolve', [path], cwd)
      .then((r) => r[0] ?? null)
      .catch(() => null)
    cache.set(key, found)
    // Arquivos aparecem durante a conversa: não guarda "não existe" para sempre.
    void found.then((r) => r === null && setTimeout(() => cache.delete(key), 3000))
  }
  return found
}

/** Função que abre um caminho citado; null fora de uma conversa. */
export function useOpenFile(): ((ref: string) => Promise<boolean>) | null {
  const ctx = useContext(FileLinkContext)
  if (!ctx) return null
  return async (ref) => {
    const { path, line } = splitLine(ref)
    const absolute = await resolveFile(path, ctx.cwd)
    if (!absolute) return false
    openFileInDock(ctx.projectId, absolute, ctx.panelId, line)
    return true
  }
}

/** Link explícito para um arquivo (anexos, cartões de ferramenta, links do Markdown). */
export function FileLink({
  path,
  children,
  className,
  title,
}: {
  path: string
  children: ReactNode
  className?: string
  title?: string
}) {
  const open = useOpenFile()
  const [missing, setMissing] = useState(false)
  if (!open) return <span className={className}>{children}</span>
  return (
    <button
      type="button"
      title={missing ? 'Arquivo não encontrado' : (title ?? `Abrir ${path}`)}
      className={cn(
        'cursor-pointer text-left hover:underline',
        missing && 'cursor-not-allowed line-through opacity-60',
        className,
      )}
      onClick={(e) => {
        e.stopPropagation()
        void open(path).then((ok) => setMissing(!ok))
      }}
    >
      {children}
    </button>
  )
}

/**
 * Código inline do Markdown: se for um caminho que existe, vira link para a aba do
 * arquivo; senão continua código comum.
 */
export function InlineCode({ children }: { children: ReactNode }) {
  const ctx = useContext(FileLinkContext)
  const text = typeof children === 'string' ? children : String(children ?? '')
  const candidate = ctx && looksLikePath(text)
  const [resolved, setResolved] = useState<{ key: string; exists: boolean } | null>(null)
  const key = ctx ? `${ctx.cwd}\0${text}` : ''

  useEffect(() => {
    if (!candidate || !ctx) return
    let alive = true
    void resolveFile(splitLine(text).path, ctx.cwd).then((r) => {
      if (alive) setResolved({ key, exists: r !== null })
    })
    return () => {
      alive = false
    }
  }, [candidate, ctx, text, key])

  const base = 'rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]'
  if (!candidate || resolved?.key !== key || !resolved.exists)
    return <code className={base}>{children}</code>
  return (
    <FileLink path={text} className={cn(base, 'text-blue-600 dark:text-blue-400')}>
      {children}
    </FileLink>
  )
}
