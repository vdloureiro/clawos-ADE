import { useActiveProject, useProjectsStore } from '@/stores/projects'
import { TasksView } from '@/components/tasks/TasksView'
import { useUiStore } from '@/stores/ui'
import { DockWorkspace } from './DockWorkspace'
import { Onboarding } from './Onboarding'
import { WorkspaceToolbar } from './WorkspaceToolbar'

/**
 * Área principal. Cada projeto visitado mantém seu dock montado; trocar de projeto só
 * alterna a visibilidade, então as sessões e os painéis continuam exatamente como estavam.
 */
export function Workspace() {
  const project = useActiveProject()
  const projects = useProjectsStore((s) => s.projects)
  const visited = useProjectsStore((s) => s.visited)
  const view = useUiStore((s) => s.view)
  const showingTasks = view.kind === 'tasks'
  const mounted = visited.filter((id) => projects.some((p) => p.id === id))

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-11 shrink-0 items-center justify-between gap-3 border-b px-3 [-webkit-app-region:drag]">
        {showingTasks ? (
          <span className="text-sm font-medium">Tarefas</span>
        ) : (
          project && (
            <>
              <div className="flex min-w-0 items-center gap-2 text-sm">
                <span
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ background: project.color }}
                />
                <span className="truncate font-medium">{project.name}</span>
              </div>
              <WorkspaceToolbar project={project} />
            </>
          )
        )}
      </div>
      <div className="relative min-h-0 flex-1">
        {mounted.map((id) => (
          <DockWorkspace key={id} projectId={id} visible={!showingTasks && id === project?.id} />
        ))}
        {/* A lista de tarefas cobre os painéis, que continuam montados (e os agentes rodando). */}
        {showingTasks && (
          <div className="absolute inset-0 z-10 bg-background">
            <TasksView projectId={view.projectId} />
          </div>
        )}
        {!project && !showingTasks && <Onboarding />}
      </div>
    </div>
  )
}
