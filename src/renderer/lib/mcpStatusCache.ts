import type { McpTestResult } from '@shared/ipc'
import type { McpServerConfig } from '@shared/project'
import type { McpStatus } from '@/components/mcp/McpCatalogGrid'

/**
 * Último resultado do teste de cada MCP, para as configurações abrirem já com o
 * "✓ Conectado" em vez de testar tudo de novo. Fica no armazenamento do app (sobrevive a
 * reiniciar) e vale só para a mesma configuração do servidor.
 */
interface Entry {
  sig: string
  at: number
  status: McpStatus
  result?: McpTestResult
}

const STORAGE_KEY = 'clawos.mcpStatus'
/** Depois disso o teste roda de novo, em segundo plano (sem mostrar "Conectando…"). */
export const MCP_STATUS_FRESH_MS = 30 * 60_000

let entries: Record<string, Entry> | null = null

function load(): Record<string, Entry> {
  if (entries) return entries
  try {
    entries = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Record<string, Entry>
  } catch {
    entries = {}
  }
  return entries
}

function persist(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries ?? {}))
  } catch {
    // Sem armazenamento: o cache vale só enquanto o app estiver aberto.
  }
}

const signature = (server: McpServerConfig | undefined) => JSON.stringify(server ?? null)

/** Resultado guardado para este MCP com esta mesma configuração (ou null). */
export function cachedMcpStatus(
  scope: string,
  name: string,
  server: McpServerConfig | undefined,
): Entry | null {
  const entry = load()[`${scope}:${name}`]
  return entry && entry.sig === signature(server) ? entry : null
}

export function storeMcpStatus(
  scope: string,
  name: string,
  server: McpServerConfig | undefined,
  status: McpStatus,
  result?: McpTestResult,
): void {
  if (status.state === 'testing' || status.state === 'idle') return
  load()[`${scope}:${name}`] = { sig: signature(server), at: Date.now(), status, result }
  persist()
}

/**
 * O que fazer ao abrir a tela: `show` é o status a exibir já; `retest` diz se testa de
 * novo e `silent` se o teste roda sem trocar o selo por "Conectando…".
 */
export function mcpStatusOnOpen(
  scope: string,
  name: string,
  server: McpServerConfig | undefined,
  now: number,
): { show: Entry | null; retest: boolean; silent: boolean } {
  const entry = cachedMcpStatus(scope, name, server)
  if (!entry) return { show: null, retest: true, silent: false }
  // Conectado recentemente: confia. Conectado há mais tempo: confere em segundo plano.
  if (entry.status.state === 'ok')
    return { show: entry, retest: now - entry.at > MCP_STATUS_FRESH_MS, silent: true }
  // Login pelo Claude: o Clawos não testa mesmo.
  if (entry.status.state === 'claude') return { show: entry, retest: false, silent: true }
  // Falhou da última vez: testa de novo, mostrando o progresso.
  return { show: entry, retest: true, silent: false }
}
