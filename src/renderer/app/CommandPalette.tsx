import { useEffect, useState } from 'react'
import { Command } from 'cmdk'
import { FolderPlus, MessageSquare, MessageSquarePlus, Settings } from 'lucide-react'
import type { SessionSummary } from '@shared/types'
import { useActiveProject, useProjectsStore } from '@/stores/projects'
import { newSessionInDock, openInDock } from '@/lib/dock'
import { useUiStore } from '@/stores/ui'

/** ⌘K / Ctrl+K: busca rápida de projetos, conversas e ações. */
export function CommandPalette() {
  const { paletteOpen, setPaletteOpen, openProjectSettings } = useUiStore()
  const { projects, select, add } = useProjectsStore()
  const activeProject = useActiveProject()
  const [sessions, setSessions] = useState<SessionSummary[]>([])

  useEffect(() => {
    if (paletteOpen) void window.clawos.invoke('sessions:listAll').then(setSessions)
  }, [paletteOpen])

  if (!paletteOpen) return null

  const close = () => setPaletteOpen(false)
  const run = (fn: () => void) => () => {
    fn()
    close()
  }
  const projectName = (id: string) => projects.find((p) => p.id === id)?.name ?? ''
  const item =
    'flex cursor-default items-center gap-2 rounded px-2 py-1.5 text-sm aria-selected:bg-accent aria-selected:text-accent-foreground'
  const group =
    '[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:text-muted-foreground'

  return (
    <div
      className="fixed inset-0 z-50 flex justify-center bg-black/40 pt-[15vh]"
      onMouseDown={(e) => e.target === e.currentTarget && close()}
    >
      <Command
        label="Busca rápida"
        className="h-fit w-full max-w-lg overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-2xl"
        onKeyDown={(e) => e.key === 'Escape' && close()}
      >
        <Command.Input
          autoFocus
          placeholder="Buscar projetos e conversas…"
          className="w-full border-b bg-transparent px-3 py-2.5 text-sm outline-none select-text"
        />
        <Command.List className="max-h-80 overflow-y-auto p-1">
          <Command.Empty className="px-3 py-4 text-center text-sm text-muted-foreground">
            Nada encontrado.
          </Command.Empty>

          <Command.Group heading="Ações" className={group}>
            {activeProject && (
              <Command.Item
                className={item}
                onSelect={run(() => void newSessionInDock(activeProject.id))}
              >
                <MessageSquarePlus className="size-4" /> Nova conversa em {activeProject.name}
              </Command.Item>
            )}
            <Command.Item className={item} onSelect={run(() => void add())}>
              <FolderPlus className="size-4" /> Adicionar projeto
            </Command.Item>
            {activeProject && (
              <Command.Item
                className={item}
                onSelect={run(() => openProjectSettings(activeProject.id))}
              >
                <Settings className="size-4" /> Configurações de {activeProject.name}
              </Command.Item>
            )}
          </Command.Group>

          <Command.Group heading="Projetos" className={group}>
            {projects.map((project) => (
              <Command.Item
                key={project.id}
                value={`projeto ${project.name} ${project.path}`}
                className={item}
                onSelect={run(() => select(project.id))}
              >
                <span
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ background: project.color }}
                />
                <span className="shrink-0">{project.name}</span>
                <span className="ml-auto truncate text-xs text-muted-foreground">
                  {project.path}
                </span>
              </Command.Item>
            ))}
          </Command.Group>

          <Command.Group heading="Conversas" className={group}>
            {sessions.map((session) => (
              <Command.Item
                key={session.id}
                value={`conversa ${session.title} ${projectName(session.projectId)} ${session.id}`}
                className={item}
                onSelect={run(() => void openInDock(session.projectId, session.id))}
              >
                <MessageSquare className="size-4 shrink-0" />
                <span className="truncate">{session.title}</span>
                <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                  {projectName(session.projectId)}
                </span>
              </Command.Item>
            ))}
          </Command.Group>
        </Command.List>
      </Command>
    </div>
  )
}
