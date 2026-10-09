import { FolderPlus, MessageSquarePlus, Settings } from 'lucide-react'
import { ChatPanel } from '@/components/chat/ChatPanel'
import { Button } from '@/components/ui/button'
import { useAgentsStore } from '@/stores/agents'
import { useActiveProject, useProjectsStore } from '@/stores/projects'
import { useSessionsStore } from '@/stores/sessions'
import { useUiStore } from '@/stores/ui'

/** Área principal: conversa em foco do projeto ativo (multi-painel chega no M3). */
export function Workspace() {
  const project = useActiveProject()
  const add = useProjectsStore((s) => s.add)
  const { activeByProject, summaries, create, open } = useSessionsStore()
  const openProjectSettings = useUiStore((s) => s.openProjectSettings)
  const setGlobalSettingsOpen = useUiStore((s) => s.setGlobalSettingsOpen)
  const claude = useAgentsStore((s) => s.statuses.find((a) => a.id === 'claude'))
  const ready = claude?.installed && claude.loggedIn !== false

  if (!project) {
    return (
      <EmptyState title="Clawos" text="Adicione a pasta de um projeto para começar.">
        <Button onClick={() => void add()}>
          <FolderPlus /> Adicionar projeto
        </Button>
      </EmptyState>
    )
  }

  const sessionId = activeByProject[project.id]
  if (sessionId) return <ChatPanel key={sessionId} sessionId={sessionId} />

  const recent = (summaries[project.id] ?? []).slice(0, 5)
  return (
    <EmptyState title={project.name} text={project.path}>
      <div className="flex gap-2">
        <Button onClick={() => void create(project.id)} disabled={!ready}>
          <MessageSquarePlus /> Nova conversa
        </Button>
        <Button variant="outline" onClick={() => openProjectSettings(project.id)}>
          <Settings /> Configurações
        </Button>
      </div>
      {!ready && claude && (
        <button
          type="button"
          className="text-xs text-amber-600 underline-offset-2 hover:underline"
          onClick={() => setGlobalSettingsOpen(true)}
        >
          {claude.installed ? 'Entre no Claude para começar.' : 'Instale o Claude para começar.'}
        </button>
      )}
      {recent.length > 0 && (
        <div className="mt-4 w-72 text-left">
          <div className="mb-1 text-xs text-muted-foreground">Recentes</div>
          {recent.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => void open(s.id, project.id)}
              className="block w-full truncate rounded px-2 py-1 text-left text-sm hover:bg-accent/50"
            >
              {s.title}
            </button>
          ))}
        </div>
      )}
    </EmptyState>
  )
}

function EmptyState({
  title,
  text,
  children,
}: {
  title: string
  text: string
  children: React.ReactNode
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="max-w-md truncate text-sm text-muted-foreground">{text}</p>
      {children}
    </div>
  )
}
