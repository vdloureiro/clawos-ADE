import { ArrowLeft, MessageSquarePlus } from 'lucide-react'
import { ChatPanel } from '@/components/chat/ChatPanel'
import { FilePanel } from '@/components/files/FilePanel'
import { TasksView } from '@/components/tasks/TasksView'
import { Button } from '@/components/ui/button'
import { ErrorBoundary } from '@/components/ui/error-boundary'
import { newSessionInDock } from '@/lib/dock'
import { useActiveProject } from '@/stores/projects'
import { useSessionsStore } from '@/stores/sessions'
import { useUiStore } from '@/stores/ui'
import { Onboarding } from './Onboarding'

/**
 * Área principal no celular: uma coisa por vez — a conversa ativa, as tarefas ou um
 * arquivo em tela cheia. A troca é pelo menu (barra lateral).
 */
export function MobileWorkspace() {
  const project = useActiveProject()
  const view = useUiStore((s) => s.view)
  const mobileFile = useUiStore((s) => s.mobileFile)
  const setMobileFile = useUiStore((s) => s.setMobileFile)
  const activeSession = useSessionsStore((s) =>
    project ? (s.activeByProject[project.id] ?? null) : null,
  )

  if (mobileFile && project)
    return (
      <div className="flex h-full flex-col">
        <button
          type="button"
          onClick={() => setMobileFile(null)}
          className="flex items-center gap-1.5 border-b px-3 py-2 text-sm text-muted-foreground"
        >
          <ArrowLeft className="size-4" /> Voltar para a conversa
        </button>
        <div className="min-h-0 flex-1">
          <FilePanel
            path={mobileFile.path}
            line={mobileFile.line}
            nonce={mobileFile.nonce}
            projectId={project.id}
          />
        </div>
      </div>
    )

  if (view.kind === 'tasks') return <TasksView projectId={view.projectId} />
  if (!project) return <Onboarding />
  if (!activeSession)
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-sm text-muted-foreground">
        <span>Escolha uma conversa no menu ou comece uma nova.</span>
        <Button size="sm" onClick={() => void newSessionInDock(project.id)}>
          <MessageSquarePlus /> Nova conversa
        </Button>
      </div>
    )
  return (
    <ErrorBoundary label="Esta conversa encontrou um erro.">
      <ChatPanel key={activeSession} sessionId={activeSession} />
    </ErrorBoundary>
  )
}
