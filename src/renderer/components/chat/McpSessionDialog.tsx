import { useCallback, useEffect, useState } from 'react'
import { Globe, RefreshCw, Settings2 } from 'lucide-react'
import type { McpServerConfig } from '@shared/project'
import type { AgentId } from '@shared/types'
import { McpStatusBadge, runMcpTest, type McpStatus } from '@/components/mcp/McpCatalogGrid'
import { McpIcon } from '@/components/mcp/McpIcon'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { mcpStatusOnOpen, storeMcpStatus } from '@/lib/mcpStatusCache'
import { useUiStore } from '@/stores/ui'

interface Row {
  name: string
  server: McpServerConfig | undefined
  shared: boolean
}

const isOAuth = (server: McpServerConfig | undefined) =>
  !!server && 'command' in server && (server.args ?? []).some((a) => a.startsWith('mcp-remote'))

/**
 * O `/mcp` do Clawos: os MCPs desta conversa com status, login e reconexão. No Claude Code
 * do terminal isso é a tela interativa do `/mcp`, que não existe dentro de uma conversa.
 */
export function McpSessionDialog({
  projectId,
  agentId,
  onSendToAgent,
  onRestart,
  onClose,
}: {
  projectId: string
  agentId: AgentId
  /** Manda um comando ao agente (ex.: `/mcp reconnect github` no Claude). */
  onSendToAgent: (text: string) => void
  /** Reinicia a conversa (o agente carrega os MCPs de novo). */
  onRestart: () => void
  onClose: () => void
}) {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [status, setStatus] = useState<Record<string, McpStatus>>({})

  const test = useCallback(
    async (row: Row, silent = false) => {
      if (!silent) setStatus((s) => ({ ...s, [row.name]: { state: 'testing', since: Date.now() } }))
      const next = await runMcpTest(() =>
        window.clawos.invoke('projects:testMcp', projectId, row.name),
      )
      storeMcpStatus(row.shared ? 'shared' : projectId, row.name, row.server, next)
      setStatus((s) => ({ ...s, [row.name]: next }))
    },
    [projectId],
  )

  useEffect(() => {
    void (async () => {
      const [{ config }, shared, sharedList] = await Promise.all([
        window.clawos.invoke('projects:getConfig', projectId),
        window.clawos.invoke('projects:sharedMcps', projectId),
        window.clawos.invoke('mcp:sharedList'),
      ])
      const own = Object.entries(config.mcpServers ?? {}).map(([name, server]): Row => ({
        name,
        server,
        shared: false,
      }))
      const global = shared
        .filter((m) => m.enabled && !config.mcpServers?.[m.name])
        .map((m): Row => ({ name: m.name, server: sharedList.servers[m.name], shared: true }))
      const list = [...own, ...global]
      setRows(list)
      const now = Date.now()
      for (const row of list) {
        const open = mcpStatusOnOpen(row.shared ? 'shared' : projectId, row.name, row.server, now)
        if (open.show) setStatus((s) => ({ ...s, [row.name]: open.show!.status }))
        if (open.retest) void test(row, open.silent)
      }
    })()
  }, [projectId, test])

  const reconnect = (name: string) => {
    if (agentId === 'claude') onSendToAgent(`/mcp reconnect ${name}`)
    else onRestart()
    onClose()
  }

  return (
    <Modal title="MCPs desta conversa" onClose={onClose} className="max-w-xl">
      <div className="space-y-3 overflow-y-auto p-4">
        <p className="text-xs text-muted-foreground">
          Faça login nos MCPs que pedem conta e reconecte na conversa para o agente passar a usar.
          {agentId === 'claude'
            ? ' A reconexão é feita pelo próprio Claude, sem perder o histórico.'
            : ' No Codex, reconectar reinicia o agente desta conversa (o histórico continua).'}
        </p>
        {rows === null && <p className="text-sm text-muted-foreground">Carregando…</p>}
        {rows?.length === 0 && (
          <p className="text-sm text-muted-foreground">Este projeto ainda não tem MCPs.</p>
        )}
        {rows?.map((row) => {
          const st = status[row.name] ?? { state: 'idle' }
          return (
            <div key={row.name} className="flex items-center gap-3 rounded-lg border p-3">
              <McpIcon id={row.name} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 text-sm font-medium">
                  {row.name}
                  {row.shared && (
                    <span
                      className="flex items-center gap-0.5 text-[10px] font-normal text-muted-foreground"
                      title="Ativo em todos os projetos"
                    >
                      <Globe className="size-2.5" /> todos os projetos
                    </span>
                  )}
                </div>
                <div className="mt-1">
                  <McpStatusBadge status={st} onRetry={() => void test(row)} />
                </div>
                {st.state === 'error' && (
                  <p
                    className="mt-1 line-clamp-2 text-[11px] text-muted-foreground"
                    title={st.error}
                  >
                    {st.error}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                {isOAuth(row.server) && st.state !== 'ok' && st.state !== 'testing' && (
                  <Button size="sm" className="h-7" onClick={() => void test(row)}>
                    Fazer login
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7"
                  title="O agente desta conversa carrega o MCP de novo"
                  onClick={() => reconnect(row.name)}
                >
                  <RefreshCw /> Reconectar
                </Button>
              </div>
            </div>
          )
        })}
        <div className="flex flex-wrap items-center gap-2 border-t pt-3">
          {agentId === 'claude' && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                onSendToAgent('/mcp')
                onClose()
              }}
            >
              Ver status pelo Claude
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto"
            onClick={() => {
              onClose()
              useUiStore.getState().openProjectSettings(projectId, 'mcps')
            }}
          >
            <Settings2 /> Adicionar ou configurar MCPs
          </Button>
        </div>
      </div>
    </Modal>
  )
}
