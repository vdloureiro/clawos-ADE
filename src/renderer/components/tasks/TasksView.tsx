import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import {
  Bot,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  Flag,
  GripVertical,
  ListTodo,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react'
import { AGENT_META } from '@shared/agents'
import type {
  AgentId,
  Project,
  SessionMode,
  SessionSummary,
  Task,
  TaskPriority,
} from '@shared/types'
import { AgentIcon } from '@/components/agents/AgentIcon'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import { addDays, dueLabel, isoDate, type DueTone } from '@/lib/dates'
import { cleanIpcError, openInDock } from '@/lib/dock'
import { cn } from '@/lib/utils'
import { useAgentsStore } from '@/stores/agents'
import { useProjectsStore } from '@/stores/projects'
import { useSessionsStore } from '@/stores/sessions'
import { useTasksStore } from '@/stores/tasks'
import { useUiStore } from '@/stores/ui'

export const PRIORITY_COLOR: Record<TaskPriority, string> = {
  1: '#ef4444',
  2: '#f97316',
  3: '#3b82f6',
  4: '#71717a',
}

const TONE_CLASS: Record<DueTone, string> = {
  overdue: 'text-red-600 dark:text-red-400',
  today: 'text-emerald-600 dark:text-emerald-400',
  soon: 'text-violet-600 dark:text-violet-400',
  later: 'text-muted-foreground',
}

type Filter = 'todas' | 'hoje' | 'atrasadas' | 'delegadas'

const today = () => isoDate(new Date())

/** Lista de tarefas de um projeto (`projectId`) ou de todos (`null`). */
export function TasksView({ projectId }: { projectId: string | null }) {
  const projects = useProjectsStore((s) => s.projects)
  const { byProject, loadProject, loadAll } = useTasksStore()
  const [filter, setFilter] = useState<Filter>('todas')
  const [editing, setEditing] = useState<Task | null>(null)

  useEffect(() => {
    if (projectId) void loadProject(projectId)
    else void loadAll()
  }, [projectId, loadProject, loadAll])

  const project = projects.find((p) => p.id === projectId) ?? null
  const visibleProjects = project ? [project] : projects
  const now = today()

  const matches = (t: Task) => {
    if (filter === 'hoje') return t.dueDate !== null && t.dueDate <= now
    if (filter === 'atrasadas') return t.dueDate !== null && t.dueDate < now
    if (filter === 'delegadas') return t.sessionId !== null
    return true
  }

  const totalOpen = visibleProjects.reduce(
    (n, p) => n + (byProject[p.id] ?? []).filter((t) => t.status !== 'done').length,
    0,
  )

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl px-6 py-8">
        <header className="mb-6 flex items-end justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2.5 text-2xl font-semibold tracking-tight">
              {project ? (
                <span className="size-3 rounded-full" style={{ background: project.color }} />
              ) : (
                <ListTodo className="size-6 text-muted-foreground" />
              )}
              {project ? project.name : 'Todas as tarefas'}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {totalOpen === 0
                ? 'Nenhuma tarefa aberta'
                : `${totalOpen} tarefa${totalOpen > 1 ? 's' : ''} aberta${totalOpen > 1 ? 's' : ''}`}
            </p>
          </div>
          {!project && (
            <div className="flex gap-1">
              {(['todas', 'hoje', 'atrasadas', 'delegadas'] as Filter[]).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFilter(f)}
                  className={cn(
                    'rounded-full border px-3 py-1 text-xs capitalize',
                    filter === f
                      ? 'border-foreground/30 bg-accent'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {f}
                </button>
              ))}
            </div>
          )}
        </header>

        <QuickAdd projectId={projectId} projects={projects} />

        {projects.length === 0 && (
          <p className="mt-10 text-center text-sm text-muted-foreground">
            Adicione um projeto para criar tarefas.
          </p>
        )}

        <div className="mt-6 space-y-8">
          {visibleProjects.map((p) => {
            const tasks = (byProject[p.id] ?? []).filter(matches)
            if (!project && tasks.length === 0) return null
            return (
              <ProjectTasks
                key={p.id}
                project={p}
                tasks={tasks}
                showHeader={!project}
                sortable={Boolean(project) && filter === 'todas'}
                onEdit={setEditing}
              />
            )
          })}
          {!project &&
            visibleProjects.every((p) => (byProject[p.id] ?? []).filter(matches).length === 0) &&
            projects.length > 0 && (
              <p className="py-10 text-center text-sm text-muted-foreground">
                {filter === 'todas'
                  ? 'Nenhuma tarefa ainda. Que tal criar a primeira?'
                  : 'Nada por aqui.'}
              </p>
            )}
        </div>
      </div>
      {editing && (
        <TaskEditor task={editing} projects={projects} onClose={() => setEditing(null)} />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------

function QuickAdd({ projectId, projects }: { projectId: string | null; projects: Project[] }) {
  const create = useTasksStore((s) => s.create)
  const [title, setTitle] = useState('')
  const [priority, setPriority] = useState<TaskPriority>(4)
  const [due, setDue] = useState('')
  const [target, setTarget] = useState(projectId ?? '')
  const [error, setError] = useState<string | null>(null)
  const destination = projectId ?? target ?? projects[0]?.id ?? ''

  const submit = async () => {
    if (!title.trim() || !destination) return
    setError(null)
    try {
      await create({ projectId: destination, title, priority, dueDate: due || null })
      setTitle('')
      setPriority(4)
      setDue('')
    } catch (e) {
      setError(cleanIpcError(e))
    }
  }

  return (
    <div className="rounded-lg border bg-card focus-within:ring-2 focus-within:ring-ring/30">
      <div className="flex items-center gap-2 px-3 py-2.5">
        <Plus className="size-4 text-muted-foreground" />
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) void submit()
          }}
          placeholder="Adicionar tarefa…"
          aria-label="Título da nova tarefa"
          className="min-w-0 flex-1 bg-transparent text-sm outline-none select-text placeholder:text-muted-foreground"
        />
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t px-3 py-2 text-xs">
        <DuePicker value={due} onChange={setDue} />
        <PriorityPicker value={priority} onChange={setPriority} />
        {!projectId && (
          <select
            value={destination}
            onChange={(e) => setTarget(e.target.value)}
            className="h-7 rounded-md border bg-background px-2"
            aria-label="Projeto"
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        )}
        {error && <span className="text-red-600">{error}</span>}
        <Button
          size="sm"
          className="ml-auto h-7"
          disabled={!title.trim() || !destination}
          onClick={() => void submit()}
        >
          Adicionar
        </Button>
      </div>
    </div>
  )
}

function DuePicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const now = today()
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => onChange(value === now ? '' : now)}
        className={cn(
          'rounded-md border px-2 py-1',
          value === now && 'border-emerald-500/50 text-emerald-600 dark:text-emerald-400',
        )}
      >
        Hoje
      </button>
      <button
        type="button"
        onClick={() => onChange(value === addDays(now, 1) ? '' : addDays(now, 1))}
        className={cn(
          'rounded-md border px-2 py-1',
          value === addDays(now, 1) && 'border-violet-500/50 text-violet-600 dark:text-violet-400',
        )}
      >
        Amanhã
      </button>
      <label className="flex h-7 items-center gap-1 rounded-md border px-2 text-muted-foreground">
        <CalendarDays className="size-3.5" />
        <input
          type="date"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="bg-transparent text-xs text-foreground outline-none [color-scheme:light_dark]"
          aria-label="Data"
        />
      </label>
    </div>
  )
}

function PriorityPicker({
  value,
  onChange,
}: {
  value: TaskPriority
  onChange: (value: TaskPriority) => void
}) {
  return (
    <div
      className="flex items-center gap-0.5 rounded-md border px-1"
      role="radiogroup"
      aria-label="Prioridade"
    >
      {([1, 2, 3, 4] as TaskPriority[]).map((p) => (
        <button
          key={p}
          type="button"
          role="radio"
          aria-checked={value === p}
          title={p === 4 ? 'Sem prioridade' : `Prioridade ${p}`}
          onClick={() => onChange(p)}
          className={cn('flex h-6 items-center gap-0.5 rounded px-1.5', value === p && 'bg-accent')}
        >
          <Flag
            className="size-3"
            style={{ color: PRIORITY_COLOR[p] }}
            fill={p < 4 ? PRIORITY_COLOR[p] : 'none'}
          />
          <span className="text-[11px]">P{p}</span>
        </button>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------

function ProjectTasks({
  project,
  tasks,
  showHeader,
  sortable,
  onEdit,
}: {
  project: Project
  tasks: Task[]
  showHeader: boolean
  sortable: boolean
  onEdit: (task: Task) => void
}) {
  const setView = useUiStore((s) => s.setView)
  const select = useProjectsStore((s) => s.select)
  const reorder = useTasksStore((s) => s.reorder)
  const [showDone, setShowDone] = useState(false)
  const [dragId, setDragId] = useState<string | null>(null)
  const open = tasks.filter((t) => t.status !== 'done')
  const done = tasks.filter((t) => t.status === 'done')

  const onDrop = (targetId: string) => {
    if (!dragId || dragId === targetId) return
    const ids = open.map((t) => t.id).filter((id) => id !== dragId)
    ids.splice(ids.indexOf(targetId), 0, dragId)
    void reorder(project.id, [...ids, ...done.map((t) => t.id)])
    setDragId(null)
  }

  return (
    <section>
      {showHeader && (
        <button
          type="button"
          onClick={() => {
            select(project.id)
            setView({ kind: 'tasks', projectId: project.id })
          }}
          className="mb-2 flex items-center gap-2 text-sm font-medium hover:underline"
        >
          <span className="size-2.5 rounded-full" style={{ background: project.color }} />
          {project.name}
          <span className="font-normal text-muted-foreground">{open.length}</span>
        </button>
      )}
      <ul className="divide-y rounded-lg border">
        {open.length === 0 && (
          <li className="px-4 py-6 text-center text-sm text-muted-foreground">Tudo em dia ✓</li>
        )}
        {open.map((task) => (
          <li
            key={task.id}
            draggable={sortable}
            onDragStart={() => setDragId(task.id)}
            onDragOver={(e: DragEvent) => sortable && e.preventDefault()}
            onDrop={() => onDrop(task.id)}
            className={cn(dragId === task.id && 'opacity-40')}
          >
            <TaskRow
              task={task}
              project={project}
              sortable={sortable}
              onEdit={() => onEdit(task)}
            />
          </li>
        ))}
      </ul>
      {done.length > 0 && (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => setShowDone(!showDone)}
            className="flex items-center gap-1 px-1 py-1 text-xs text-muted-foreground hover:text-foreground"
          >
            {showDone ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
            Concluídas ({done.length})
          </button>
          {showDone && (
            <ul className="mt-1 divide-y rounded-lg border opacity-70">
              {done.map((task) => (
                <li key={task.id}>
                  <TaskRow
                    task={task}
                    project={project}
                    sortable={false}
                    onEdit={() => onEdit(task)}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}

const SESSION_STATUS: Record<string, { label: string; dot: string }> = {
  starting: { label: 'iniciando', dot: 'bg-muted-foreground animate-pulse' },
  working: { label: 'trabalhando', dot: 'bg-blue-500 animate-pulse' },
  awaiting_permission: { label: 'aguardando aprovação', dot: 'bg-amber-500' },
  ready: { label: 'pronto para revisar', dot: 'bg-emerald-500' },
  error: { label: 'erro', dot: 'bg-red-500' },
  closed: { label: 'conversa encerrada', dot: 'bg-muted-foreground/50' },
}

function TaskRow({
  task,
  project,
  sortable,
  onEdit,
}: {
  task: Task
  project: Project
  sortable: boolean
  onEdit: () => void
}) {
  const update = useTasksStore((s) => s.update)
  const remove = useTasksStore((s) => s.remove)
  const session = useSessionsStore((s): SessionSummary | undefined =>
    task.sessionId ? s.summaries[project.id]?.find((x) => x.id === task.sessionId) : undefined,
  )
  const [delegating, setDelegating] = useState(false)
  const done = task.status === 'done'
  const due = task.dueDate ? dueLabel(task.dueDate, today()) : null
  const status = session ? SESSION_STATUS[session.live ? session.status : 'closed'] : null

  return (
    <div className="group relative flex items-start gap-3 px-3 py-2.5">
      {sortable && (
        <GripVertical className="absolute top-3 -left-5 size-4 cursor-grab text-muted-foreground opacity-0 group-hover:opacity-60" />
      )}
      <button
        type="button"
        onClick={() => void update(task.id, { status: done ? 'todo' : 'done' })}
        className="mt-0.5 flex size-[18px] shrink-0 items-center justify-center rounded-full border-2 transition-colors"
        style={{
          borderColor: PRIORITY_COLOR[task.priority],
          background: done ? PRIORITY_COLOR[task.priority] : `${PRIORITY_COLOR[task.priority]}14`,
        }}
        title={done ? 'Reabrir' : 'Concluir'}
        aria-label={done ? `Reabrir ${task.title}` : `Concluir ${task.title}`}
      >
        <Check
          className={cn(
            'size-3',
            done ? 'text-white' : 'opacity-0 transition-opacity hover:opacity-70',
          )}
          style={done ? undefined : { color: PRIORITY_COLOR[task.priority] }}
        />
      </button>

      <button type="button" onClick={onEdit} className="min-w-0 flex-1 text-left">
        <div className={cn('text-sm', done && 'text-muted-foreground line-through')}>
          {task.title}
        </div>
        {task.notes && (
          <div className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{task.notes}</div>
        )}
        {(due || task.priority < 4 || session) && (
          <div className="mt-1 flex flex-wrap items-center gap-3 text-xs">
            {due && !done && (
              <span className={cn('flex items-center gap-1', TONE_CLASS[due.tone])}>
                <CalendarDays className="size-3" /> {due.label}
              </span>
            )}
            {task.priority < 4 && (
              <span
                className="flex items-center gap-1"
                style={{ color: PRIORITY_COLOR[task.priority] }}
              >
                <Flag className="size-3" fill={PRIORITY_COLOR[task.priority]} /> P{task.priority}
              </span>
            )}
          </div>
        )}
      </button>

      {session && status && (
        <button
          type="button"
          onClick={() => void openInDock(project.id, session.id)}
          className="flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
          title="Abrir a conversa"
        >
          <AgentIcon agentId={session.agentId} className="size-4 text-[9px]" />
          <span className={cn('size-1.5 rounded-full', status.dot)} />
          {status.label}
        </button>
      )}

      <div
        className={cn(
          'flex shrink-0 items-center gap-0.5 transition-opacity group-hover:opacity-100 focus-within:opacity-100',
          delegating ? 'opacity-100' : 'opacity-0',
        )}
      >
        {!done && (
          <div className="relative">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 px-2 text-xs"
              onClick={() => setDelegating(!delegating)}
            >
              <Bot className="size-3.5" /> Delegar
            </Button>
            {delegating && (
              <DelegateMenu task={task} project={project} onClose={() => setDelegating(false)} />
            )}
          </div>
        )}
        <Button variant="ghost" size="icon" className="size-7" onClick={onEdit} title="Editar">
          <Pencil className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          title="Excluir"
          onClick={() => {
            if (confirm(`Excluir a tarefa "${task.title}"?`)) void remove(task.id)
          }}
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>
    </div>
  )
}

function DelegateMenu({
  task,
  project,
  onClose,
}: {
  task: Task
  project: Project
  onClose: () => void
}) {
  const statuses = useAgentsStore((s) => s.statuses)
  const delegate = useTasksStore((s) => s.delegate)
  const [agentId, setAgentId] = useState<AgentId>(project.defaultAgent)
  const [mode, setMode] = useState<SessionMode>('shared')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const available = useMemo(
    () => statuses.filter((s) => s.installed && s.loggedIn !== false),
    [statuses],
  )

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose()
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [onClose])

  const send = async () => {
    setBusy(true)
    setError(null)
    try {
      const { sessionId } = await delegate(task.id, agentId, mode)
      await useSessionsStore.getState().loadProject(project.id)
      onClose()
      await openInDock(project.id, sessionId)
    } catch (e) {
      setError(cleanIpcError(e))
      setBusy(false)
    }
  }

  return (
    <div
      ref={ref}
      className="absolute top-full right-0 z-40 mt-1 w-72 rounded-lg border bg-popover p-3 text-popover-foreground shadow-xl"
    >
      <p className="mb-2 text-xs font-medium">Delegar para um agente</p>
      <p className="mb-3 line-clamp-2 text-xs text-muted-foreground">
        Abre uma conversa nova com a tarefa já enviada para o agente executar.
      </p>
      <div className="space-y-1">
        {available.length === 0 && (
          <p className="text-xs text-amber-600">Nenhum agente instalado e logado.</p>
        )}
        {available.map((a) => (
          <label
            key={a.id}
            className={cn(
              'flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm',
              agentId === a.id && 'bg-accent',
            )}
          >
            <input
              type="radio"
              name={`agent-${task.id}`}
              checked={agentId === a.id}
              onChange={() => setAgentId(a.id)}
              className="sr-only"
            />
            <AgentIcon agentId={a.id} className="size-5 text-[10px]" />
            {AGENT_META[a.id].name}
            {a.id === project.defaultAgent && (
              <span className="text-xs text-muted-foreground">(padrão)</span>
            )}
          </label>
        ))}
      </div>
      <div className="mt-3 flex gap-1">
        {(['shared', 'worktree'] as SessionMode[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={cn('flex-1 rounded-md border px-2 py-1 text-xs', mode === m && 'bg-accent')}
          >
            {m === 'shared' ? 'Mesma pasta' : 'Worktree isolada'}
          </button>
        ))}
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      <Button
        size="sm"
        className="mt-3 w-full"
        disabled={busy || !available.some((a) => a.id === agentId)}
        onClick={() => void send()}
      >
        <Bot /> {busy ? 'Abrindo conversa…' : `Enviar para o ${AGENT_META[agentId].name}`}
      </Button>
    </div>
  )
}

// ---------------------------------------------------------------------------

function TaskEditor({
  task,
  projects,
  onClose,
}: {
  task: Task
  projects: Project[]
  onClose: () => void
}) {
  const update = useTasksStore((s) => s.update)
  const remove = useTasksStore((s) => s.remove)
  const [title, setTitle] = useState(task.title)
  const [notes, setNotes] = useState(task.notes)
  const [priority, setPriority] = useState<TaskPriority>(task.priority)
  const [due, setDue] = useState(task.dueDate ?? '')
  const [projectId, setProjectId] = useState(task.projectId)
  const [error, setError] = useState<string | null>(null)

  const save = async () => {
    try {
      await update(task.id, { title, notes, priority, dueDate: due || null, projectId })
      onClose()
    } catch (e) {
      setError(cleanIpcError(e))
    }
  }

  return (
    <Modal title="Editar tarefa" onClose={onClose} className="max-w-lg">
      <div className="space-y-4 p-4">
        <div className="space-y-1.5">
          <Label htmlFor="task-title">Título</Label>
          <Input
            id="task-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="task-notes">Descrição</Label>
          <textarea
            id="task-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={5}
            placeholder="Detalhes, critérios de aceite, links… (enviados ao agente ao delegar)"
            className="w-full rounded-md border bg-background px-2.5 py-2 text-sm outline-none select-text placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/40"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <DuePicker value={due} onChange={setDue} />
          <PriorityPicker value={priority} onChange={setPriority} />
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className="h-7 rounded-md border bg-background px-2"
            aria-label="Projeto"
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <div className="flex items-center justify-between border-t pt-4">
          <Button
            variant="ghost"
            size="sm"
            className="text-red-600 dark:text-red-400"
            onClick={async () => {
              if (!confirm(`Excluir a tarefa "${task.title}"?`)) return
              await remove(task.id)
              onClose()
            }}
          >
            <Trash2 /> Excluir
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>
              Cancelar
            </Button>
            <Button size="sm" onClick={() => void save()} disabled={!title.trim()}>
              Salvar
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
