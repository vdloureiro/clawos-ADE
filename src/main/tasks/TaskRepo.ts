import { randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3'
import type { NewTaskInput, Task, TaskPatch, TaskPriority, TaskStatus } from '@shared/types'

interface TaskRow {
  id: string
  project_id: string
  title: string
  notes: string
  status: string
  priority: number
  due_date: string | null
  sort_order: number
  session_id: string | null
  created_at: number
  updated_at: number
  completed_at: number | null
}

function toTask(row: TaskRow): Task {
  return {
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    notes: row.notes,
    status: row.status as TaskStatus,
    priority: row.priority as TaskPriority,
    dueDate: row.due_date,
    sortOrder: row.sort_order,
    sessionId: row.session_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
  }
}

const DATE = /^\d{4}-\d{2}-\d{2}$/

/** Tarefas por projeto (SQLite local). */
export class TaskRepo {
  constructor(private readonly db: Database.Database) {}

  /** De um projeto, ou de todos quando `projectId` é null. */
  list(projectId: string | null): Task[] {
    const rows = (
      projectId
        ? this.db
            .prepare('SELECT * FROM tasks WHERE project_id = ? ORDER BY sort_order')
            .all(projectId)
        : this.db.prepare('SELECT * FROM tasks ORDER BY project_id, sort_order').all()
    ) as TaskRow[]
    return rows.map(toTask)
  }

  get(id: string): Task {
    const row = this.db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as TaskRow | undefined
    if (!row) throw new Error(`Tarefa não encontrada: ${id}`)
    return toTask(row)
  }

  create(input: NewTaskInput): Task {
    const title = input.title.trim()
    if (!title) throw new Error('A tarefa precisa de um título.')
    if (input.dueDate && !DATE.test(input.dueDate)) throw new Error('Data inválida.')
    // Novas tarefas entram no topo da lista do projeto.
    const min = this.db
      .prepare('SELECT MIN(sort_order) AS m FROM tasks WHERE project_id = ?')
      .get(input.projectId) as {
      m: number | null
    }
    const now = Date.now()
    const id = randomUUID()
    this.db
      .prepare(
        `INSERT INTO tasks (id, project_id, title, notes, priority, due_date, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.projectId,
        title,
        input.notes?.trim() ?? '',
        input.priority ?? 4,
        input.dueDate ?? null,
        (min.m ?? 1) - 1,
        now,
        now,
      )
    return this.get(id)
  }

  update(id: string, patch: TaskPatch): Task {
    const current = this.get(id)
    const next = { ...current, ...patch }
    if (!next.title.trim()) throw new Error('A tarefa precisa de um título.')
    if (next.dueDate && !DATE.test(next.dueDate)) throw new Error('Data inválida.')
    const completedAt =
      next.status === 'done' ? (current.status === 'done' ? current.completedAt : Date.now()) : null
    this.db
      .prepare(
        `UPDATE tasks SET project_id = ?, title = ?, notes = ?, status = ?, priority = ?, due_date = ?,
                          completed_at = ?, updated_at = ? WHERE id = ?`,
      )
      .run(
        next.projectId,
        next.title.trim(),
        next.notes,
        next.status,
        next.priority,
        next.dueDate,
        completedAt,
        Date.now(),
        id,
      )
    return this.get(id)
  }

  linkSession(id: string, sessionId: string): Task {
    this.db
      .prepare(
        `UPDATE tasks SET session_id = ?, status = 'doing', completed_at = NULL, updated_at = ? WHERE id = ?`,
      )
      .run(sessionId, Date.now(), id)
    return this.get(id)
  }

  delete(id: string): void {
    this.db.prepare('DELETE FROM tasks WHERE id = ?').run(id)
  }

  /** Nova ordem manual (ids na ordem desejada). */
  reorder(ids: string[]): void {
    const update = this.db.prepare('UPDATE tasks SET sort_order = ? WHERE id = ?')
    this.db.transaction(() => ids.forEach((id, index) => update.run(index, id)))()
  }

  /** Quantidade de tarefas abertas por projeto (para a barra lateral). */
  openCounts(): Record<string, number> {
    const rows = this.db
      .prepare(
        `SELECT project_id, COUNT(*) AS n FROM tasks WHERE status != 'done' GROUP BY project_id`,
      )
      .all() as { project_id: string; n: number }[]
    return Object.fromEntries(rows.map((r) => [r.project_id, r.n]))
  }
}

/** Mensagem enviada ao agente quando a tarefa é delegada. */
export function taskPrompt(task: Task, projectName: string): string {
  const lines = [`Tarefa do projeto "${projectName}": ${task.title}`]
  if (task.notes.trim()) lines.push('', task.notes.trim())
  const extras: string[] = []
  if (task.priority < 4) extras.push(`prioridade P${task.priority}`)
  if (task.dueDate) extras.push(`prazo ${task.dueDate.split('-').reverse().join('/')}`)
  if (extras.length) lines.push('', `(${extras.join(', ')})`)
  lines.push(
    '',
    'Execute esta tarefa neste projeto. Ao terminar, resuma o que foi feito e o que ficou pendente.',
  )
  return lines.join('\n')
}
