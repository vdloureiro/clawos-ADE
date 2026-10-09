import { useEffect, useRef, useState, type DragEvent } from 'react'
import {
  FolderPlus,
  MessageSquarePlus,
  MoreHorizontal,
  Search,
  Settings,
  Trash2,
} from 'lucide-react'
import { PROJECT_COLORS, type Project, type SessionSummary } from '@shared/types'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useProjectsStore } from '@/stores/projects'
import { projectActivity, useSessionsStore, type ProjectActivity } from '@/stores/sessions'
import { useUiStore } from '@/stores/ui'

function ActivityIndicator({ activity }: { activity: ProjectActivity }) {
  if (activity === 'awaiting')
    return (
      <span className="text-xs text-amber-500" title="Aguardando aprovação">
        ◐
      </span>
    )
  if (activity === 'working')
    return (
      <span className="animate-pulse text-xs text-blue-500" title="Agente trabalhando">
        ●
      </span>
    )
  if (activity === 'error')
    return (
      <span className="text-xs font-bold text-red-500" title="Erro">
        !
      </span>
    )
  return null
}

export function ProjectSidebar() {
  const { projects, activeId, select, add, reorder } = useProjectsStore()
  const summaries = useSessionsStore((s) => s.summaries)
  const setPaletteOpen = useUiStore((s) => s.setPaletteOpen)
  const [dragId, setDragId] = useState<string | null>(null)

  const onDrop = (targetId: string) => {
    if (!dragId || dragId === targetId) return
    const ids = projects.map((p) => p.id).filter((id) => id !== dragId)
    ids.splice(ids.indexOf(targetId), 0, dragId)
    void reorder(ids)
    setDragId(null)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="px-3 pb-2">
        <button
          type="button"
          onClick={() => setPaletteOpen(true)}
          className="flex w-full items-center gap-2 rounded-md border bg-background/50 px-2 py-1 text-xs text-muted-foreground hover:bg-accent/50"
        >
          <Search className="size-3" />
          <span className="flex-1 text-left">Buscar</span>
          <kbd className="font-sans text-[10px]">
            {navigator.platform.startsWith('Mac') ? '⌘K' : 'Ctrl K'}
          </kbd>
        </button>
      </div>

      <div className="flex items-center justify-between px-3 pb-1">
        <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Projetos
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="size-6"
          title="Adicionar projeto"
          onClick={() => void add()}
        >
          <FolderPlus className="size-3.5" />
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {projects.length === 0 && (
          <p className="px-2 py-1 text-xs text-muted-foreground">
            Adicione a pasta de um projeto para começar.
          </p>
        )}
        <ul className="space-y-0.5">
          {projects.map((project) => (
            <li
              key={project.id}
              draggable
              onDragStart={() => setDragId(project.id)}
              onDragOver={(e: DragEvent) => e.preventDefault()}
              onDrop={() => onDrop(project.id)}
              className={cn(dragId === project.id && 'opacity-40')}
            >
              <ProjectRow
                project={project}
                active={project.id === activeId}
                activity={projectActivity(summaries[project.id])}
                onSelect={() => select(project.id)}
              />
              {project.id === activeId && (
                <SessionList project={project} sessions={summaries[project.id] ?? []} />
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

function ProjectRow({
  project,
  active,
  activity,
  onSelect,
}: {
  project: Project
  active: boolean
  activity: ProjectActivity
  onSelect: () => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const { update, remove } = useProjectsStore()
  const openProjectSettings = useUiStore((s) => s.openProjectSettings)

  return (
    <div
      className={cn(
        'group relative flex items-center gap-2 rounded-md px-2 py-1.5 text-sm',
        active ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50',
      )}
      onClick={onSelect}
      title={project.path}
    >
      <span className="size-2.5 shrink-0 rounded-full" style={{ background: project.color }} />
      {renaming ? (
        <input
          autoFocus
          defaultValue={project.name}
          className="min-w-0 flex-1 rounded border bg-background px-1 text-sm outline-none"
          onClick={(e) => e.stopPropagation()}
          onBlur={(e) => {
            void update(project.id, { name: e.target.value })
            setRenaming(false)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
            if (e.key === 'Escape') setRenaming(false)
          }}
        />
      ) : (
        <span className="min-w-0 flex-1 truncate">{project.name}</span>
      )}
      <ActivityIndicator activity={activity} />
      <button
        type="button"
        className="rounded p-0.5 opacity-0 group-hover:opacity-100 hover:bg-background/60"
        onClick={(e) => {
          e.stopPropagation()
          setMenuOpen(!menuOpen)
        }}
        title="Opções"
      >
        <MoreHorizontal className="size-3.5" />
      </button>
      {menuOpen && (
        <ProjectMenu
          project={project}
          onClose={() => setMenuOpen(false)}
          onRename={() => setRenaming(true)}
          onSettings={() => openProjectSettings(project.id)}
          onColor={(color) => void update(project.id, { color })}
          onRemove={() => {
            if (
              confirm(
                `Remover "${project.name}" da lista? Os arquivos do projeto não serão apagados.`,
              )
            ) {
              void remove(project.id)
            }
          }}
        />
      )}
    </div>
  )
}

function ProjectMenu({
  project,
  onClose,
  onRename,
  onSettings,
  onColor,
  onRemove,
}: {
  project: Project
  onClose: () => void
  onRename: () => void
  onSettings: () => void
  onColor: (color: string) => void
  onRemove: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose()
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [onClose])

  const item = 'flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs hover:bg-accent'
  const run = (fn: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation()
    fn()
    onClose()
  }

  return (
    <div
      ref={ref}
      className="absolute top-full right-0 z-40 mt-1 w-48 rounded-md border bg-popover p-1 text-popover-foreground shadow-lg"
      onClick={(e) => e.stopPropagation()}
    >
      <button type="button" className={item} onClick={run(onSettings)}>
        <Settings className="size-3" /> Configurações
      </button>
      <button type="button" className={item} onClick={run(onRename)}>
        Renomear
      </button>
      <div className="flex flex-wrap gap-1.5 px-2 py-1.5">
        {PROJECT_COLORS.map((color) => (
          <button
            key={color}
            type="button"
            className={cn(
              'size-4 rounded-full',
              project.color === color && 'ring-2 ring-ring ring-offset-1 ring-offset-popover',
            )}
            style={{ background: color }}
            onClick={run(() => onColor(color))}
            title={color}
          />
        ))}
      </div>
      <button
        type="button"
        className={cn(item, 'text-red-600 dark:text-red-400')}
        onClick={run(onRemove)}
      >
        <Trash2 className="size-3" /> Remover da lista
      </button>
    </div>
  )
}

const STATUS_DOT: Record<string, string> = {
  starting: 'bg-muted-foreground animate-pulse',
  ready: 'bg-emerald-500',
  working: 'bg-blue-500 animate-pulse',
  awaiting_permission: 'bg-amber-500',
  error: 'bg-red-500',
}

function SessionList({ project, sessions }: { project: Project; sessions: SessionSummary[] }) {
  const { activeByProject, create, open, remove } = useSessionsStore()
  const active = activeByProject[project.id]

  return (
    <div className="mt-0.5 mb-1 ml-3 border-l pl-2">
      <button
        type="button"
        onClick={() => void create(project.id)}
        className="flex w-full items-center gap-2 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-accent/50 hover:text-foreground"
      >
        <MessageSquarePlus className="size-3" /> Nova conversa
      </button>
      {sessions.slice(0, 30).map((session) => (
        <div
          key={session.id}
          onClick={() => void open(session.id, project.id)}
          className={cn(
            'group flex cursor-default items-center gap-2 rounded px-2 py-1 text-xs',
            session.id === active
              ? 'bg-accent/70 text-foreground'
              : 'text-muted-foreground hover:bg-accent/40',
          )}
          title={session.title}
        >
          <span
            className={cn(
              'size-1.5 shrink-0 rounded-full',
              session.live ? STATUS_DOT[session.status] : 'bg-transparent',
            )}
          />
          <span className="min-w-0 flex-1 truncate">{session.title}</span>
          <button
            type="button"
            className="opacity-0 group-hover:opacity-60 hover:opacity-100"
            title="Apagar conversa"
            onClick={(e) => {
              e.stopPropagation()
              if (confirm(`Apagar a conversa "${session.title}"?`))
                void remove(session.id, project.id)
            }}
          >
            <Trash2 className="size-3" />
          </button>
        </div>
      ))}
    </div>
  )
}
