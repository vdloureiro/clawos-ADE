import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import {
  ChevronRight,
  Folder,
  FolderMinus,
  FolderOpen,
  FolderPlus,
  Pencil,
  Plus,
  GitBranch,
  ListTodo,
  MessageSquarePlus,
  MoreHorizontal,
  Search,
  Settings,
  Trash2,
} from 'lucide-react'
import {
  PROJECT_COLORS,
  type Project,
  type ProjectFolder,
  type SessionSummary,
} from '@shared/types'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useProjectsStore } from '@/stores/projects'
import { projectActivity, useSessionsStore, type ProjectActivity } from '@/stores/sessions'
import { useTasksStore } from '@/stores/tasks'
import { useUiStore } from '@/stores/ui'
import { newSessionInDock, openInDock, removeSessionPanel } from '@/lib/dock'
import { buildTree, moveInTree, type DragSource, type DropTarget } from '@/lib/sidebarTree'

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

/** Prioridade para resumir a atividade de uma pasta: aguardando > trabalhando > erro. */
const rank = (a: ProjectActivity): number =>
  a === 'awaiting' ? 3 : a === 'working' ? 2 : a === 'error' ? 1 : 0

type DragState = { source: DragSource; target: DropTarget | null }

export function ProjectSidebar() {
  const { projects, folders, activeId, select, add, arrange, createFolder } = useProjectsStore()
  const summaries = useSessionsStore((s) => s.summaries)
  const setPaletteOpen = useUiStore((s) => s.setPaletteOpen)
  const view = useUiStore((s) => s.view)
  const setView = useUiStore((s) => s.setView)
  const counts = useTasksStore((s) => s.counts)
  const totalOpen = Object.values(counts).reduce((a, b) => a + b, 0)
  const tree = useMemo(() => buildTree(projects, folders), [projects, folders])
  const [drag, setDragState] = useState<DragState | null>(null)
  // O ref é lido nos eventos de arrastar (que chegam antes de o React re-renderizar).
  const dragRef = useRef<DragState | null>(null)
  const setDrag = (value: DragState | null) => {
    dragRef.current = value
    setDragState(value)
  }
  const [naming, setNaming] = useState(false)
  const [renamingFolder, setRenamingFolder] = useState<string | null>(null)

  const over = (e: DragEvent, target: DropTarget) => {
    const current = dragRef.current
    if (!current) return
    e.preventDefault()
    e.stopPropagation()
    if (JSON.stringify(current.target) !== JSON.stringify(target)) setDrag({ ...current, target })
  }
  const drop = (e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const current = dragRef.current
    if (current?.target) {
      const next = moveInTree(tree, current.source, current.target)
      if (next) void arrange(next)
    }
    setDrag(null)
  }
  const startDrag = (e: DragEvent, source: DragSource) => {
    e.stopPropagation()
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', source.id)
    setDrag({ source, target: null })
  }
  const isTarget = (target: DropTarget) =>
    drag?.target !== null && JSON.stringify(drag?.target) === JSON.stringify(target)

  const renderProject = (project: Project, inFolder: boolean) => (
    <li
      key={project.id}
      draggable
      onDragStart={(e) => startDrag(e, { type: 'project', id: project.id })}
      onDragEnd={() => setDrag(null)}
      onDragOver={(e) => over(e, { kind: 'before-project', id: project.id })}
      onDrop={drop}
      className={cn(
        'relative',
        drag?.source.id === project.id && 'opacity-40',
        isTarget({ kind: 'before-project', id: project.id }) && DROP_LINE,
      )}
    >
      <ProjectRow
        project={project}
        inFolder={inFolder}
        active={project.id === activeId}
        activity={projectActivity(summaries[project.id])}
        onSelect={() => {
          select(project.id)
          setView({ kind: 'chat' })
        }}
      />
      {project.id === activeId && (
        <SessionList project={project} sessions={summaries[project.id] ?? []} />
      )}
    </li>
  )

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

      <div className="px-2 pb-3">
        <button
          type="button"
          onClick={() => setView({ kind: 'tasks', projectId: null })}
          className={cn(
            'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm',
            view.kind === 'tasks' && view.projectId === null
              ? 'bg-accent text-accent-foreground'
              : 'hover:bg-accent/50',
          )}
        >
          <ListTodo className="size-4 text-muted-foreground" />
          <span className="flex-1 text-left">Todas as tarefas</span>
          {totalOpen > 0 && <span className="text-xs text-muted-foreground">{totalOpen}</span>}
        </button>
      </div>

      <div className="flex items-center justify-between px-3 pb-1">
        <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Projetos
        </span>
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            className="size-6"
            title="Nova pasta (para agrupar projetos, ex.: por cliente)"
            onClick={() => setNaming(true)}
          >
            <FolderPlus className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-6"
            title="Novo projeto"
            onClick={() => void add()}
          >
            <Plus className="size-3.5" />
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {naming && (
          <FolderNameInput
            initial=""
            onDone={(name) => {
              setNaming(false)
              if (name) void createFolder(name)
            }}
          />
        )}
        {projects.length === 0 && folders.length === 0 && (
          <p className="px-2 py-1 text-xs text-muted-foreground">
            Adicione a pasta de um projeto para começar.
          </p>
        )}
        <ul className="space-y-0.5">
          {tree.map((item) => {
            if (item.type === 'project') return renderProject(item.project, false)
            const { folder, projects: inside } = item
            const activity = inside.reduce<ProjectActivity>((acc, p) => {
              const a = projectActivity(summaries[p.id])
              return rank(a) > rank(acc) ? a : acc
            }, null)
            const containsActive = inside.some((p) => p.id === activeId)
            const intoTarget: DropTarget = { kind: 'into-folder', id: folder.id }
            const beforeTarget: DropTarget = { kind: 'before-folder', id: folder.id }
            // Fechada: mostra só o projeto ativo, para não "sumir" com a conversa aberta.
            const visible = folder.collapsed ? inside.filter((p) => p.id === activeId) : inside
            return (
              <li
                key={folder.id}
                className={cn(
                  'relative rounded-md',
                  drag?.source.id === folder.id && 'opacity-40',
                  isTarget(beforeTarget) && DROP_LINE,
                  isTarget(intoTarget) && 'bg-primary/10 ring-1 ring-primary/40',
                )}
              >
                <div
                  draggable={renamingFolder !== folder.id}
                  onDragStart={(e) => startDrag(e, { type: 'folder', id: folder.id })}
                  onDragEnd={() => setDrag(null)}
                  onDragOver={(e) =>
                    over(e, drag?.source.type === 'folder' ? beforeTarget : intoTarget)
                  }
                  onDrop={drop}
                >
                  {renamingFolder === folder.id ? (
                    <FolderNameInput
                      initial={folder.name}
                      onDone={(name) => {
                        setRenamingFolder(null)
                        if (name) void useProjectsStore.getState().updateFolder(folder.id, { name })
                      }}
                    />
                  ) : (
                    <FolderRow
                      folder={folder}
                      count={inside.length}
                      activity={folder.collapsed ? activity : null}
                      highlight={folder.collapsed && containsActive}
                      onRename={() => setRenamingFolder(folder.id)}
                    />
                  )}
                </div>
                {visible.length > 0 && (
                  <ul className="mt-0.5 ml-2 space-y-0.5 border-l border-sidebar-border/70 pl-1.5">
                    {visible.map((p) => renderProject(p, true))}
                  </ul>
                )}
                {!folder.collapsed && inside.length === 0 && (
                  <p
                    className="mx-2 mb-1 ml-5 rounded border border-dashed px-2 py-1.5 text-[11px] text-muted-foreground"
                    onDragOver={(e) => over(e, intoTarget)}
                    onDrop={drop}
                  >
                    Arraste projetos para cá
                  </p>
                )}
              </li>
            )
          })}
        </ul>
        {/* Área final: soltar aqui deixa o projeto/pasta solto no fim da lista. */}
        <div
          className={cn('min-h-10 rounded-md', isTarget({ kind: 'root-end' }) && DROP_LINE)}
          onDragOver={(e) => over(e, { kind: 'root-end' })}
          onDrop={drop}
        />
      </div>
    </div>
  )
}

/** Linha azul acima do item onde o arrastado vai entrar. */
const DROP_LINE =
  "before:absolute before:-top-px before:right-1 before:left-1 before:h-0.5 before:rounded-full before:bg-primary before:content-['']"

function FolderNameInput({
  initial,
  onDone,
}: {
  initial: string
  onDone: (name: string | null) => void
}) {
  const done = useRef(false)
  const finish = (value: string | null) => {
    if (done.current) return
    done.current = true
    onDone(value?.trim() || null)
  }
  return (
    <div className="flex items-center gap-1.5 px-2 py-1">
      <Folder className="size-3.5 shrink-0 text-muted-foreground" />
      <input
        autoFocus
        defaultValue={initial}
        placeholder="Nome da pasta (ex.: Cliente X)"
        className="min-w-0 flex-1 rounded border bg-background px-1.5 py-0.5 text-sm outline-none focus:ring-2 focus:ring-ring/40"
        onBlur={(e) => finish(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') finish(e.currentTarget.value)
          if (e.key === 'Escape') finish(null)
        }}
      />
    </div>
  )
}

function FolderRow({
  folder,
  count,
  activity,
  highlight,
  onRename,
}: {
  folder: ProjectFolder
  count: number
  activity: ProjectActivity
  highlight: boolean
  onRename: () => void
}) {
  const { updateFolder, deleteFolder } = useProjectsStore()
  const [menuOpen, setMenuOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!menuOpen) return
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setMenuOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [menuOpen])
  const Icon = folder.collapsed ? Folder : FolderOpen
  const item = 'flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs hover:bg-accent'

  return (
    <div
      className={cn(
        'group relative flex cursor-default items-center gap-1.5 rounded-md px-1.5 py-1.5 text-sm hover:bg-accent/50',
        highlight && 'bg-accent/40',
      )}
      onClick={() => void updateFolder(folder.id, { collapsed: !folder.collapsed })}
      onDoubleClick={(e) => {
        e.stopPropagation()
        onRename()
      }}
      title={folder.collapsed ? 'Abrir pasta' : 'Fechar pasta'}
    >
      <ChevronRight
        className={cn(
          'size-3 shrink-0 text-muted-foreground transition-transform',
          !folder.collapsed && 'rotate-90',
        )}
      />
      <Icon className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate font-medium">{folder.name}</span>
      <ActivityIndicator activity={activity} />
      <span className="text-[11px] text-muted-foreground group-hover:hidden">{count}</span>
      <button
        type="button"
        className="hidden rounded p-0.5 group-hover:block hover:bg-background/60"
        onClick={(e) => {
          e.stopPropagation()
          setMenuOpen(!menuOpen)
        }}
        title="Opções da pasta"
      >
        <MoreHorizontal className="size-3.5" />
      </button>
      {menuOpen && (
        <div
          ref={ref}
          className="absolute top-full right-0 z-40 mt-1 w-48 rounded-md border bg-popover p-1 text-popover-foreground shadow-lg"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className={item}
            onClick={() => {
              setMenuOpen(false)
              onRename()
            }}
          >
            <Pencil className="size-3" /> Renomear
          </button>
          <button
            type="button"
            className={cn(item, 'text-red-600 dark:text-red-400')}
            onClick={() => {
              setMenuOpen(false)
              if (
                confirm(
                  `Excluir a pasta "${folder.name}"? Os projetos saem da pasta e continuam na lista — nada é apagado.`,
                )
              )
                void deleteFolder(folder.id)
            }}
          >
            <Trash2 className="size-3" /> Excluir pasta
          </button>
        </div>
      )}
    </div>
  )
}

function ProjectRow({
  project,
  inFolder,
  active,
  activity,
  onSelect,
}: {
  project: Project
  inFolder: boolean
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
        inFolder && 'py-1',
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
      <MoveToFolder project={project} onClose={onClose} />
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

/** "Mover para pasta" no menu do projeto (alternativa a arrastar). */
function MoveToFolder({ project, onClose }: { project: Project; onClose: () => void }) {
  const { projects, folders, arrange, createFolder } = useProjectsStore()
  const tree = buildTree(projects, folders)
  const item = 'flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs hover:bg-accent'
  const move = (target: DropTarget, current = tree) => {
    const next = moveInTree(current, { type: 'project', id: project.id }, target)
    if (next) void arrange(next)
    onClose()
  }
  return (
    <div className="my-1 border-y py-1">
      <div className="px-2 py-0.5 text-[11px] text-muted-foreground">Mover para pasta</div>
      {folders
        .filter((f) => f.id !== project.folderId)
        .map((f) => (
          <button
            key={f.id}
            type="button"
            className={item}
            onClick={(e) => {
              e.stopPropagation()
              move({ kind: 'into-folder', id: f.id })
            }}
          >
            <Folder className="size-3" /> <span className="truncate">{f.name}</span>
          </button>
        ))}
      {project.folderId && (
        <button
          type="button"
          className={item}
          onClick={(e) => {
            e.stopPropagation()
            move({ kind: 'root-end' })
          }}
        >
          <FolderMinus className="size-3" /> Tirar da pasta
        </button>
      )}
      <button
        type="button"
        className={item}
        onClick={(e) => {
          e.stopPropagation()
          const name = prompt('Nome da nova pasta (ex.: Cliente X):')?.trim()
          if (!name) return onClose()
          void createFolder(name).then((folder) => {
            const state = useProjectsStore.getState()
            move({ kind: 'into-folder', id: folder.id }, buildTree(state.projects, state.folders))
          })
        }}
      >
        <FolderPlus className="size-3" /> Nova pasta…
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
  const { activeByProject, remove } = useSessionsStore()
  const view = useUiStore((s) => s.view)
  const setView = useUiStore((s) => s.setView)
  const openTasks = useTasksStore((s) => s.counts[project.id] ?? 0)
  const onTasks = view.kind === 'tasks' && view.projectId === project.id
  const active = view.kind === 'chat' ? activeByProject[project.id] : null

  return (
    <div className="mt-0.5 mb-1 ml-3 border-l pl-2">
      <button
        type="button"
        onClick={() => setView({ kind: 'tasks', projectId: project.id })}
        className={cn(
          'flex w-full items-center gap-2 rounded px-2 py-1 text-xs',
          onTasks
            ? 'bg-accent/70 text-foreground'
            : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
        )}
      >
        <ListTodo className="size-3" />
        <span className="flex-1 text-left">Tarefas</span>
        {openTasks > 0 && <span>{openTasks}</span>}
      </button>
      <button
        type="button"
        onClick={() => void newSessionInDock(project.id)}
        className="flex w-full items-center gap-2 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-accent/50 hover:text-foreground"
      >
        <MessageSquarePlus className="size-3" /> Nova conversa
      </button>
      {sessions.slice(0, 30).map((session) => (
        <div
          key={session.id}
          onClick={() => void openInDock(project.id, session.id)}
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
          {session.mode === 'worktree' && (
            <GitBranch className="size-3 shrink-0 opacity-60" aria-label="Worktree isolada" />
          )}
          <span className="min-w-0 flex-1 truncate">{session.title}</span>
          <button
            type="button"
            className="opacity-0 group-hover:opacity-60 hover:opacity-100"
            title="Apagar conversa"
            onClick={(e) => {
              e.stopPropagation()
              const extra =
                session.mode === 'worktree'
                  ? ' A worktree e as alterações não mescladas também serão descartadas.'
                  : ''
              if (confirm(`Apagar a conversa "${session.title}"?${extra}`)) {
                removeSessionPanel(project.id, session.id)
                void remove(session.id, project.id)
              }
            }}
          >
            <Trash2 className="size-3" />
          </button>
        </div>
      ))}
    </div>
  )
}
