import { useEffect, useState } from 'react'
import {
  CheckCircle2,
  Globe,
  KeyRound,
  Loader2,
  LogIn,
  Plus,
  RefreshCw,
  Trash2,
  XCircle,
} from 'lucide-react'
import {
  buildCatalogEntry,
  catalogEntry,
  MCP_CATALOG,
  type CatalogEntry,
  type CatalogSelection,
} from '@shared/mcpCatalog'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { McpIcon } from './McpIcon'
import { AgentIcon } from '@/components/agents/AgentIcon'
import { AgentTerminal } from '@/components/agents/AgentTerminal'

/** Situação de um MCP adicionado: testando, conectado ou com erro. */
export type McpStatus =
  | { state: 'testing'; since?: number }
  | { state: 'ok'; tools: number }
  | { state: 'error'; error: string }
  /** Login feito pelo Claude Code na conversa; o Clawos não testa. */
  | { state: 'claude'; mcpId: string }
  | { state: 'idle' }

const AUTH_LABEL: Record<CatalogEntry['auth'], { label: string; icon: typeof KeyRound }> = {
  token: { label: 'token', icon: KeyRound },
  oauth: { label: 'login no navegador', icon: LogIn },
  claude: { label: 'login pelo Claude', icon: LogIn },
  none: { label: 'local, sem conta', icon: Globe },
}

/**
 * Roda um teste de conexão e devolve o status. Nunca fica "Conectando…" para sempre:
 * erro na chamada vira "Falhou", e sem resposta além do limite também.
 */
export async function runMcpTest(
  call: () => Promise<{
    ok: boolean
    tools: string[]
    error: string | null
    claudeLogin?: string
  }>,
  limitMs = 200_000,
): Promise<McpStatus> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('Sem resposta do teste de conexão.')), limitMs)
  })
  try {
    const result = await Promise.race([call(), timeout])
    if (result.claudeLogin) return { state: 'claude', mcpId: result.claudeLogin }
    return result.ok
      ? { state: 'ok', tools: result.tools.length }
      : { state: 'error', error: result.error ?? 'Falha ao conectar.' }
  } catch (error) {
    const message = (error as Error).message
    return {
      state: 'error',
      error: message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''),
    }
  } finally {
    clearTimeout(timer)
  }
}

/** "Conectando… 12s": mostra que está andando (a 1ª conexão via npx baixa o servidor). */
function Elapsed({ since }: { since: number }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])
  const seconds = Math.max(0, Math.round((now - since) / 1000))
  if (seconds < 3) return null
  return (
    <span className="text-muted-foreground/70">
      {seconds}s{seconds >= 8 && ' · a primeira conexão pode demorar (baixando o servidor)'}
    </span>
  )
}

/**
 * MCP cujo login só o Claude Code pode fazer (a Meta aprova clientes um a um). O Clawos não
 * vê esse acesso: abre o login oficial do Claude num terminal e as conversas o reutilizam.
 */
function ClaudeLogin({ mcpId }: { mcpId: string }) {
  const [open, setOpen] = useState(false)
  const [done, setDone] = useState(false)
  const name = catalogEntry(mcpId)?.name ?? mcpId
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
      <span
        className="flex items-center gap-1"
        title="A Meta só libera o login para clientes aprovados, como o Claude. As conversas com o Claude usam esse login; o Codex precisa de um token."
      >
        <AgentIcon agentId="claude" className="size-3.5" />
        {done ? 'Login feito pelo Claude' : 'Login pelo Claude'}
      </span>
      <button
        type="button"
        className="underline-offset-2 hover:text-foreground hover:underline"
        onClick={() => setOpen(true)}
      >
        {done ? 'refazer login' : 'fazer login'}
      </button>
      {open && (
        <AgentTerminal
          agentId="claude"
          agentName={name}
          action="mcp-login"
          mcpId={mcpId}
          onClose={(ok) => {
            setOpen(false)
            if (ok) setDone(true)
          }}
        />
      )}
    </span>
  )
}

/** Selo de status: ✓ Conectado, Conectando…, erro. */
export function McpStatusBadge({ status, onRetry }: { status: McpStatus; onRetry?: () => void }) {
  if (status.state === 'testing')
    return (
      <span className="flex items-center gap-1 text-xs text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" /> Conectando…
        {status.since && <Elapsed since={status.since} />}
      </span>
    )
  if (status.state === 'ok')
    return (
      <span
        className="flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400"
        title={`${status.tools} ferramentas disponíveis`}
      >
        <CheckCircle2 className="size-4" /> Conectado
      </span>
    )
  if (status.state === 'claude') return <ClaudeLogin mcpId={status.mcpId} />
  if (status.state === 'error')
    return (
      <span
        className="flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400"
        title={status.error}
      >
        <XCircle className="size-4 shrink-0" /> Falhou
        {onRetry && (
          <button type="button" className="underline-offset-2 hover:underline" onClick={onRetry}>
            tentar de novo
          </button>
        )}
      </span>
    )
  return onRetry ? (
    <button
      type="button"
      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      onClick={onRetry}
    >
      <RefreshCw className="size-3" /> Testar conexão
    </button>
  ) : null
}

/**
 * Catálogo de MCPs com logos. Quem usa decide o que "adicionar" faz (projeto novo,
 * configurações do projeto ou MCPs de todos os projetos) e informa o status de cada um.
 */
export function McpCatalogGrid({
  added,
  statusOf,
  globalNames = [],
  onAdd,
  onRemove,
  onRetry,
}: {
  /** Ids/nomes já adicionados aqui. */
  added: Set<string>
  statusOf: (id: string) => McpStatus
  /** MCPs já ativos em todos os projetos (mostrados como tal). */
  globalNames?: string[]
  onAdd: (selection: CatalogSelection, entry: CatalogEntry) => void | Promise<void>
  onRemove?: (id: string) => void
  onRetry?: (id: string) => void
}) {
  const [configuring, setConfiguring] = useState<string | null>(null)
  const [values, setValues] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)

  const add = async (entry: CatalogEntry, vals: Record<string, string>) => {
    try {
      const selection = buildCatalogEntry(entry, vals)
      setError(null)
      setConfiguring(null)
      await onAdd(selection, entry)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {MCP_CATALOG.map((entry) => {
        const isAdded = added.has(entry.id)
        const isGlobal = globalNames.includes(entry.id) && !isAdded
        const open = configuring === entry.id
        const Auth = AUTH_LABEL[entry.auth]
        return (
          <div
            key={entry.id}
            className={cn(
              'rounded-lg border p-3 transition-colors',
              isAdded &&
                statusOf(entry.id).state === 'ok' &&
                'border-emerald-500/40 bg-emerald-500/[0.04]',
              open && 'sm:col-span-2',
            )}
          >
            <div className="flex items-start gap-3">
              <McpIcon id={entry.id} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span className="text-sm font-medium">{entry.name}</span>
                  <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    <Auth.icon className="size-2.5" /> {Auth.label}
                  </span>
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">{entry.description}</div>
                <div className="mt-2 flex items-center gap-2">
                  {isGlobal ? (
                    <span className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                      <Globe className="size-3.5" /> Ativo em todos os projetos
                    </span>
                  ) : isAdded ? (
                    <>
                      <McpStatusBadge
                        status={statusOf(entry.id)}
                        onRetry={onRetry ? () => onRetry(entry.id) : undefined}
                      />
                      {onRemove && (
                        <button
                          type="button"
                          className="ml-auto rounded p-1 text-muted-foreground hover:bg-accent hover:text-red-500"
                          title="Remover"
                          onClick={() => onRemove(entry.id)}
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      )}
                    </>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7"
                      onClick={() => {
                        setError(null)
                        if (entry.fields.length === 0) void add(entry, {})
                        else {
                          setConfiguring(open ? null : entry.id)
                          setValues(
                            entry.fields.some((f) => f.key === 'readOnly')
                              ? { readOnly: 'sim' }
                              : {},
                          )
                        }
                      }}
                    >
                      {entry.auth === 'oauth' ? <LogIn /> : <Plus />}
                      {entry.auth === 'oauth' ? `Conectar` : 'Adicionar'}
                    </Button>
                  )}
                </div>
              </div>
            </div>

            {open && (
              <div className="mt-3 space-y-3 border-t pt-3">
                {entry.fields.map((field) =>
                  field.key === 'readOnly' ? (
                    <label key={field.key} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={values['readOnly'] !== 'não'}
                        onChange={(e) =>
                          setValues((v) => ({ ...v, readOnly: e.target.checked ? 'sim' : 'não' }))
                        }
                      />
                      {field.label}
                    </label>
                  ) : (
                    <div key={field.key} className="space-y-1">
                      <Label>
                        {field.label}
                        {field.optional && (
                          <span className="text-muted-foreground"> (opcional)</span>
                        )}
                      </Label>
                      <Input
                        type={field.secret ? 'password' : 'text'}
                        placeholder={field.placeholder}
                        value={values[field.key] ?? ''}
                        onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))}
                      />
                      {field.help && (
                        <p className="text-[11px] text-muted-foreground">
                          {field.help}
                          {field.secret && ' Fica no cofre do sistema, nunca em arquivo.'}
                        </p>
                      )}
                    </div>
                  ),
                )}
                {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => void add(entry, values)}>
                    <Plus /> Adicionar e conectar
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setConfiguring(null)}>
                    Cancelar
                  </Button>
                  <a
                    href={entry.docsUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="ml-auto self-center text-[11px] text-muted-foreground hover:underline"
                  >
                    Documentação
                  </a>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
