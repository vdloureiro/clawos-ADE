import { useState } from 'react'
import { Copy, LogIn, RefreshCw } from 'lucide-react'
import type { AgentStatus } from '@shared/types'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useAgentsStore } from '@/stores/agents'
import { LoginTerminal } from './LoginTerminal'

function StatusDot({ status }: { status: AgentStatus }) {
  const color = !status.installed
    ? 'bg-muted-foreground/40'
    : status.loggedIn === false
      ? 'bg-amber-500'
      : 'bg-emerald-500'
  return <span className={cn('size-2 shrink-0 rounded-full', color)} />
}

export function AgentStatusList() {
  const { statuses, loading, refresh } = useAgentsStore()
  const [loginFor, setLoginFor] = useState<AgentStatus | null>(null)

  return (
    <div className="px-3">
      <div className="flex items-center justify-between pb-1">
        <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Agentes
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="size-6"
          onClick={() => void refresh(true)}
          title="Verificar novamente"
        >
          <RefreshCw className={cn('size-3', loading && 'animate-spin')} />
        </Button>
      </div>
      <ul className="space-y-1">
        {statuses.map((status) => (
          <li key={status.id} className="rounded-md px-2 py-1.5 text-sm hover:bg-accent/50">
            <div className="flex items-center gap-2">
              <StatusDot status={status} />
              <span className="flex-1">{status.name}</span>
              {status.version && (
                <span className="text-[11px] text-muted-foreground">v{status.version}</span>
              )}
            </div>
            {!status.installed && (
              <div className="mt-1 ml-4 space-y-1 text-[11px] text-muted-foreground">
                <div>Não instalado. Instale com:</div>
                <button
                  type="button"
                  className="flex w-full items-center gap-1 rounded bg-muted px-1.5 py-1 text-left font-mono"
                  onClick={() => void navigator.clipboard.writeText(status.installHint)}
                  title="Copiar"
                >
                  <span className="truncate">{status.installHint}</span>
                  <Copy className="size-3 shrink-0" />
                </button>
              </div>
            )}
            {status.installed && status.loggedIn === null && (
              <div className="mt-1 ml-4 flex items-center gap-2 text-[11px] text-muted-foreground">
                Login verificado ao abrir a sessão.
                <button
                  type="button"
                  className="underline-offset-2 hover:underline"
                  onClick={() => setLoginFor(status)}
                >
                  Entrar
                </button>
              </div>
            )}
            {status.installed && status.loggedIn === false && (
              <Button
                size="sm"
                variant="outline"
                className="mt-1 ml-4 h-7"
                onClick={() => setLoginFor(status)}
              >
                <LogIn className="size-3" /> Entrar
              </Button>
            )}
            {status.installed && status.loggedIn && status.detail && (
              <div
                className="ml-4 truncate text-[11px] text-muted-foreground"
                title={status.detail}
              >
                {status.detail}
              </div>
            )}
          </li>
        ))}
      </ul>
      {loginFor && (
        <LoginTerminal
          agentId={loginFor.id}
          agentName={loginFor.name}
          onClose={() => {
            setLoginFor(null)
            void refresh(true)
          }}
        />
      )}
    </div>
  )
}
