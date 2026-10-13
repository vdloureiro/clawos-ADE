import { useCallback, useEffect, useState } from 'react'
import { McpCatalogGrid, type McpStatus } from './McpCatalogGrid'

/**
 * MCPs ativos em todos os projetos (ex.: GitHub): configurados uma vez aqui e
 * oferecidos a toda conversa. Cada projeto pode desligar um deles nas configurações dele.
 */
export function SharedMcpSettings() {
  const [names, setNames] = useState<string[]>([])
  const [status, setStatus] = useState<Record<string, McpStatus>>({})
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(
    () =>
      window.clawos
        .invoke('mcp:sharedList')
        .then((r) => setNames(Object.keys(r.servers)))
        .catch((e: Error) => setError(e.message)),
    [],
  )

  const test = useCallback(async (name: string) => {
    setStatus((s) => ({ ...s, [name]: { state: 'testing' } }))
    const result = await window.clawos
      .invoke('mcp:sharedTest', name)
      .catch((e: Error) => ({ ok: false, tools: [], error: e.message }))
    setStatus((s) => ({
      ...s,
      [name]: result.ok
        ? { state: 'ok', tools: result.tools.length }
        : { state: 'error', error: result.error ?? 'Falha ao conectar.' },
    }))
  }, [])

  // Ao abrir, confere a conexão dos que já estão configurados.
  useEffect(() => {
    void window.clawos.invoke('mcp:sharedList').then((r) => {
      const list = Object.keys(r.servers)
      setNames(list)
      for (const name of list) void test(name)
    })
  }, [test])

  return (
    <div className="space-y-2 px-3">
      <div>
        <div className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          MCPs em todos os projetos
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Conecte uma vez e use em todos os projetos — bom para serviços como o GitHub. Cada projeto
          pode desligar um MCP global nas configurações dele.
        </p>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <McpCatalogGrid
        added={new Set(names)}
        statusOf={(id) => status[id] ?? { state: 'idle' }}
        onAdd={async (selection) => {
          try {
            await window.clawos.invoke(
              'mcp:sharedSave',
              selection.name,
              selection.server,
              selection.secrets,
            )
            await load()
            await test(selection.name)
          } catch (e) {
            setError((e as Error).message)
          }
        }}
        onRemove={(id) => {
          if (!confirm(`Remover "${id}" de todos os projetos?`)) return
          void window.clawos.invoke('mcp:sharedRemove', id).then(load)
        }}
        onRetry={(id) => void test(id)}
      />
    </div>
  )
}
