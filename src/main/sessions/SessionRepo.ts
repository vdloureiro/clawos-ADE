import type Database from 'better-sqlite3'
import type { ChatItem } from '@shared/chat'
import type { AgentId, SessionStatus, SessionSummary } from '@shared/types'

interface SessionRow {
  id: string
  project_id: string
  agent_id: string
  title: string
  acp_session_id: string | null
  status: string
  created_at: number
  updated_at: number
  cwd: string
}

export interface StoredSession {
  summary: SessionSummary
  acpSessionId: string | null
}

/** Mapeia um ChatItem para as colunas role/kind da tabela `messages`. */
export function messageColumns(item: ChatItem): { role: string; kind: string } {
  switch (item.kind) {
    case 'user':
      return { role: 'user', kind: 'text' }
    case 'assistant':
      return { role: 'assistant', kind: 'text' }
    case 'thought':
      return { role: 'thought', kind: 'text' }
    case 'notice':
      return { role: 'system', kind: 'text' }
    case 'tool':
      return { role: 'assistant', kind: 'tool_call' }
    case 'permission':
      return { role: 'system', kind: 'permission' }
    case 'plan':
      return { role: 'assistant', kind: 'plan' }
    case 'error':
      return { role: 'system', kind: 'error' }
  }
}

/** Persistência de sessões e do histórico de mensagens. */
export class SessionRepo {
  constructor(private readonly db: Database.Database) {}

  create(input: { id: string; projectId: string; agentId: AgentId; title: string }): void {
    const now = Date.now()
    this.db
      .prepare(
        `INSERT INTO sessions (id, project_id, agent_id, title, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'starting', ?, ?)`,
      )
      .run(input.id, input.projectId, input.agentId, input.title, now, now)
  }

  get(id: string): StoredSession {
    const row = this.db
      .prepare(
        'SELECT s.*, p.path AS cwd FROM sessions s JOIN projects p ON p.id = s.project_id WHERE s.id = ?',
      )
      .get(id) as SessionRow | undefined
    if (!row) throw new Error(`Sessão não encontrada: ${id}`)
    return toStored(row)
  }

  list(projectId: string): StoredSession[] {
    const rows = this.db
      .prepare(
        `SELECT s.*, p.path AS cwd FROM sessions s JOIN projects p ON p.id = s.project_id
         WHERE s.project_id = ? ORDER BY s.updated_at DESC`,
      )
      .all(projectId) as SessionRow[]
    return rows.map(toStored)
  }

  /** Todas as sessões, para a busca rápida (⌘K). */
  listAll(): StoredSession[] {
    const rows = this.db
      .prepare(
        `SELECT s.*, p.path AS cwd FROM sessions s JOIN projects p ON p.id = s.project_id
         ORDER BY s.updated_at DESC LIMIT 500`,
      )
      .all() as SessionRow[]
    return rows.map(toStored)
  }

  update(
    id: string,
    patch: { title?: string; status?: SessionStatus; acpSessionId?: string },
  ): void {
    const sets: string[] = ['updated_at = @now']
    if (patch.title !== undefined) sets.push('title = @title')
    if (patch.status !== undefined) sets.push('status = @status')
    if (patch.acpSessionId !== undefined) sets.push('acp_session_id = @acpSessionId')
    this.db
      .prepare(`UPDATE sessions SET ${sets.join(', ')} WHERE id = @id`)
      .run({ ...patch, id, now: Date.now() })
  }

  delete(id: string): void {
    this.db.prepare('DELETE FROM sessions WHERE id = ?').run(id)
  }

  saveItems(sessionId: string, items: ChatItem[]): void {
    const insert = this.db.prepare(
      `INSERT INTO messages (id, session_id, seq, role, kind, payload, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    const now = Date.now()
    this.db.transaction(() => {
      this.db.prepare('DELETE FROM messages WHERE session_id = ?').run(sessionId)
      items.forEach((item, seq) => {
        const { role, kind } = messageColumns(item)
        insert.run(item.id, sessionId, seq, role, kind, JSON.stringify(item), now)
      })
    })()
  }

  loadItems(sessionId: string): ChatItem[] {
    const rows = this.db
      .prepare('SELECT payload FROM messages WHERE session_id = ? ORDER BY seq')
      .all(sessionId) as { payload: string }[]
    return rows.map((r) => JSON.parse(r.payload) as ChatItem)
  }
}

function toStored(row: SessionRow): StoredSession {
  return {
    acpSessionId: row.acp_session_id,
    summary: {
      id: row.id,
      projectId: row.project_id,
      agentId: row.agent_id as AgentId,
      cwd: row.cwd,
      title: row.title,
      // Sessões fora da memória estão sempre encerradas; o status vivo vem do SessionManager.
      status: 'closed',
      live: false,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    },
  }
}
