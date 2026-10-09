import type { ReactNode } from 'react'
import { CheckCircle2, Circle, FolderPlus, LogIn } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAgentsStore } from '@/stores/agents'
import { useProjectsStore } from '@/stores/projects'
import { useUiStore } from '@/stores/ui'

function Step({ done, children }: { done: boolean; children: ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      {done ? (
        <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-500" />
      ) : (
        <Circle className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
      )}
      <div className="space-y-2">{children}</div>
    </li>
  )
}

/** Primeiros passos: instalar um agente, entrar e adicionar um projeto. */
export function Onboarding() {
  const statuses = useAgentsStore((s) => s.statuses)
  const add = useProjectsStore((s) => s.add)
  const openSettings = useUiStore((s) => s.setGlobalSettingsOpen)
  const installed = statuses.some((a) => a.installed)
  const ready = statuses.some((a) => a.installed && a.loggedIn !== false)
  const claude = statuses.find((a) => a.id === 'claude')

  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="w-full max-w-md space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Bem-vindo ao Clawos</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Vários agentes de código, vários projetos, um chat limpo. Tudo local, com a sua própria
            conta.
          </p>
        </div>
        <ol className="space-y-4 text-sm">
          <Step done={installed}>
            <p className="font-medium">Instale um agente</p>
            {!installed && claude && (
              <p className="text-muted-foreground">
                No terminal:{' '}
                <code className="rounded bg-muted px-1 font-mono text-xs select-text">
                  {claude.installHint}
                </code>
              </p>
            )}
          </Step>
          <Step done={ready}>
            <p className="font-medium">Entre com a sua conta</p>
            {installed && !ready && (
              <Button size="sm" variant="outline" onClick={() => openSettings(true)}>
                <LogIn /> Entrar
              </Button>
            )}
          </Step>
          <Step done={false}>
            <p className="font-medium">Adicione a pasta de um projeto</p>
            <Button size="sm" onClick={() => void add()} disabled={!ready}>
              <FolderPlus /> Adicionar projeto
            </Button>
          </Step>
        </ol>
      </div>
    </div>
  )
}
