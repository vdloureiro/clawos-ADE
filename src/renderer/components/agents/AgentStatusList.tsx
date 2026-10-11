import { useEffect, useState } from 'react'
import { Check, Download, LogIn, RefreshCw } from 'lucide-react'
import type { AgentId, AgentStatus } from '@shared/types'
import { Button } from '@/components/ui/button'
import { CopyCommand } from '@/components/ui/copy-button'
import { cn } from '@/lib/utils'
import { useAgentsStore } from '@/stores/agents'
import { AgentIcon } from './AgentIcon'
import { AgentTerminal } from './AgentTerminal'

/** Fabricante de cada agente, para quem nunca usou os CLIs. */
export const AGENT_MAKER: Record<AgentId, string> = {
  claude: 'Anthropic · Claude Code',
  codex: 'OpenAI · Codex CLI',
  gemini: 'Google · Gemini CLI',
}

export function StatusBadge({ status }: { status: AgentStatus }) {
  const [label, tone] = !status.installed
    ? ['Não instalado', 'bg-muted text-muted-foreground']
    : status.loggedIn === false
      ? ['Falta entrar', 'bg-amber-500/15 text-amber-600 dark:text-amber-400']
      : status.loggedIn
        ? ['Pronto', 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400']
        : ['Instalado', 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400']
  return (
    <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium', tone)}>
      {label}
    </span>
  )
}

/** Botão "verificar novamente" que gira e confirma ("verificado agora"). */
export function RecheckButton({ className }: { className?: string }) {
  const { loading, checkedAt, refresh } = useAgentsStore()
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 5000)
    return () => clearInterval(timer)
  }, [])
  const ago = checkedAt ? Math.max(0, Math.round((now - checkedAt) / 1000)) : null
  return (
    <div className={cn('flex items-center gap-2', className)}>
      {!loading && ago !== null && (
        <span className="text-[11px] text-muted-foreground">
          {ago < 10 ? (
            <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
              <Check className="size-3" /> verificado agora
            </span>
          ) : ago < 60 ? (
            `verificado há ${ago}s`
          ) : (
            `verificado há ${Math.round(ago / 60)} min`
          )}
        </span>
      )}
      <Button
        variant="outline"
        size="sm"
        className="h-7"
        disabled={loading}
        onClick={() => {
          setNow(Date.now())
          void refresh(true)
        }}
      >
        <RefreshCw className={cn('size-3.5', loading && 'animate-spin')} />
        {loading ? 'Verificando…' : 'Verificar novamente'}
      </Button>
    </div>
  )
}

/**
 * Cartão de um agente: instala (instalador oficial num terminal do app, ou o comando
 * para copiar) e entra na conta. Atualiza o status sozinho ao terminar.
 */
export function AgentCard({
  status,
  show = 'all',
}: {
  status: AgentStatus
  /** No assistente, cada etapa mostra só a sua ação. */
  show?: 'install' | 'login' | 'all'
}) {
  const refresh = useAgentsStore((s) => s.refresh)
  const [terminal, setTerminal] = useState<'install' | 'login' | null>(null)
  const needsInstall = !status.installed
  const needsLogin = status.installed && status.loggedIn !== true

  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex items-center gap-3">
        <AgentIcon agentId={status.id} className="size-8" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-sm font-medium">
            {status.name}
            {status.version && (
              <span className="text-[11px] font-normal text-muted-foreground">
                v{status.version}
              </span>
            )}
          </div>
          <div className="truncate text-xs text-muted-foreground">
            {status.installed && status.loggedIn && status.detail
              ? status.detail
              : AGENT_MAKER[status.id]}
          </div>
        </div>
        <StatusBadge status={status} />
      </div>

      {needsInstall && show !== 'login' && (
        <div className="mt-3 space-y-2">
          <Button size="sm" className="w-full" onClick={() => setTerminal('install')}>
            <Download /> Instalar o {status.name}
          </Button>
          <div className="text-[11px] text-muted-foreground">
            Ou, se preferir, rode no Terminal:
          </div>
          <CopyCommand command={status.installHint} />
        </div>
      )}

      {needsLogin && show !== 'install' && (
        <div className="mt-3 space-y-1.5">
          <Button
            size="sm"
            variant={status.loggedIn === false ? 'default' : 'outline'}
            className="w-full"
            onClick={() => setTerminal('login')}
          >
            <LogIn /> Entrar com sua conta
          </Button>
          <p className="text-[11px] text-muted-foreground">
            {status.id === 'claude'
              ? 'Use sua conta do Claude (Pro/Max) ou da Anthropic. O login abre no navegador.'
              : status.id === 'codex'
                ? 'Use sua conta do ChatGPT. O login abre no navegador.'
                : 'O login é verificado ao abrir a primeira conversa.'}
          </p>
        </div>
      )}

      {terminal && (
        <AgentTerminal
          agentId={status.id}
          agentName={status.name}
          action={terminal}
          onClose={() => {
            setTerminal(null)
            void refresh(true)
          }}
        />
      )}
    </div>
  )
}

/** Lista de agentes nas Configurações. */
export function AgentStatusList() {
  const statuses = useAgentsStore((s) => s.statuses)
  return (
    <div className="space-y-2 px-3">
      <div className="flex items-center justify-between pb-1">
        <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Agentes
        </span>
        <RecheckButton />
      </div>
      {statuses.map((status) => (
        <AgentCard key={status.id} status={status} />
      ))}
    </div>
  )
}
