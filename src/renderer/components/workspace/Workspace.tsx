import { FolderPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useActiveProject, useProjectsStore } from '@/stores/projects'
import { DockWorkspace } from './DockWorkspace'
import { WorkspaceToolbar } from './WorkspaceToolbar'

/**
 * Área principal. Cada projeto visitado mantém seu dock montado; trocar de projeto só
 * alterna a visibilidade, então as sessões e os painéis continuam exatamente como estavam.
 */
export function Workspace() {
  const project = useActiveProject()
  const projects = useProjectsStore((s) => s.projects)
  const add = useProjectsStore((s) => s.add)
  const visited = useProjectsStore((s) => s.visited)
  const mounted = visited.filter((id) => projects.some((p) => p.id === id))

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-11 shrink-0 items-center justify-between gap-3 border-b px-3 [-webkit-app-region:drag]">
        {project && (
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
        )}
      </div>
      <div className="relative min-h-0 flex-1">
        {mounted.map((id) => (
          <DockWorkspace key={id} projectId={id} visible={id === project?.id} />
        ))}
        {!project && (
          <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
            <h1 className="text-2xl font-semibold">Clawos</h1>
            <p className="text-sm text-muted-foreground">
              Adicione a pasta de um projeto para começar.
            </p>
            <Button onClick={() => void add()}>
              <FolderPlus /> Adicionar projeto
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
