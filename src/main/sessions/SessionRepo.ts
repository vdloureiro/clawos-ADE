import type Database from 'better-sqlite3'
import type { ChatItem } from '@shared/chat'
import type { AgentId, SessionConfigChoice, SessionStatus, SessionSummary } from '@shared/types'

interface SessionRow {
  id: string
  project_id: string
  agent_id: string
  title: string
  acp_session_id: string | null
  branch: string | null
  mode: string
  worktree_path: string | null
  base_branch: string | null
  base_commit: string | null
  config: string | null
  status: string
  created_at: number
  updated_at: number
  cwd: string
  project_path: string
}

export interface StoredSession {
  summary: SessionSummary
  acpSessionId: string | null
  /** Modelo, modo de permissão etc. escolhidos nesta conversa. */
  config: SessionConfigChoice | null
  /** Presente nas sessões em worktree isolada. */
  worktree: { path: string; branch: string; baseBranch: string; baseCommit: string } | null
  projectPath: string
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

  create(input: {
    id: string
    projectId: string
    agentId: AgentId
    title: string
    worktree?: StoredSession['worktree']
  }): void {
    const now = Date.now()
    const wt = input.worktree
    this.db
      .prepare(
        `INSERT INTO sessions (id, project_id, agent_id, title, mode, worktree_path, branch, base_branch, base_commit,
                               status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'starting', ?, ?)`,
      )
      .run(
        input.id,
        input.projectId,
        input.agentId,
        input.title,
        wt ? 'worktree' : 'shared',
        wt?.path ?? null,
        wt?.branch ?? null,
        wt?.baseBranch ?? null,
        wt?.baseCommit ?? null,
        now,
        now,
      )
  }

  get(id: string): StoredSession {
    const row = this.db
      .prepare(
        'SELECT s.*, COALESCE(s.worktree_path, p.path) AS cwd, p.path AS project_path FROM sessions s JOIN projects p ON p.id = s.project_id WHERE s.id = ?',
      )
      .get(id) as SessionRow | undefined
    if (!row) throw new Error(`Sessão não encontrada: ${id}`)
    return toStored(row)
  }

  list(projectId: string): StoredSession[] {
    const rows = this.db
      .prepare(
        `SELECT s.*, COALESCE(s.worktree_path, p.path) AS cwd, p.path AS project_path FROM sessions s JOIN projects p ON p.id = s.project_id
         WHERE s.project_id = ? ORDER BY s.updated_at DESC`,
      )
      .all(projectId) as SessionRow[]
    return rows.map(toStored)
  }

  /** Todas as sessões, para a busca rápida (⌘K). */
  listAll(): StoredSession[] {
    const rows = this.db
      .prepare(
        `SELECT s.*, COALESCE(s.worktree_path, p.path) AS cwd, p.path AS project_path FROM sessions s JOIN projects p ON p.id = s.project_id
         ORDER BY s.updated_at DESC LIMIT 500`,
      )
      .all() as SessionRow[]
    return rows.map(toStored)
  }

  update(
    id: string,
    patch: {
      title?: string
      status?: SessionStatus
      acpSessionId?: string
      branch?: string | null
      config?: SessionConfigChoice
    },
  ): void {
    const sets: string[] = ['updated_at = @now']
    if (patch.branch !== undefined) sets.push('branch = @branch')
    if (patch.title !== undefined) sets.push('title = @title')
    if (patch.status !== undefined) sets.push('status = @status')
    if (patch.acpSessionId !== undefined) sets.push('acp_session_id = @acpSessionId')
    if (patch.config !== undefined) sets.push('config = @config')
    this.db.prepare(`UPDATE sessions SET ${sets.join(', ')} WHERE id = @id`).run({
      ...patch,
      config: patch.config === undefined ? undefined : JSON.stringify(patch.config),
      id,
      now: Date.now(),
    })
  }

  agentPreferences(agentId: AgentId): SessionConfigChoice {
    const row = this.db
      .prepare('SELECT config FROM agent_preferences WHERE agent_id = ?')
      .get(agentId) as { config: string } | undefined
    return row ? parseConfig(row.config) : {}
  }

  saveAgentPreferences(agentId: AgentId, config: SessionConfigChoice): void {
    this.db
      .prepare(
        `INSERT INTO agent_preferences (agent_id, config, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(agent_id) DO UPDATE SET config = excluded.config, updated_at = excluded.updated_at`,
      )
      .run(agentId, JSON.stringify(config), Date.now())
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

function parseConfig(json: string): SessionConfigChoice {
  try {
    const value: unknown = JSON.parse(json)
    if (!value || typeof value !== 'object') return {}
    return Object.fromEntries(
      Object.entries(value).filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string',
      ),
    )
  } catch {
    return {}
  }
}

function toStored(row: SessionRow): StoredSession {
  const worktree =
    row.mode === 'worktree' && row.worktree_path && row.branch
      ? {
          path: row.worktree_path,
          branch: row.branch,
          baseBranch: row.base_branch ?? 'HEAD',
          baseCommit: row.base_commit ?? 'HEAD',
        }
      : null
  return {
    acpSessionId: row.acp_session_id,
    config: row.config ? parseConfig(row.config) : null,
    worktree,
    projectPath: row.project_path,
    summary: {
      id: row.id,
      projectId: row.project_id,
      agentId: row.agent_id as AgentId,
      cwd: row.cwd,
      title: row.title,
      branch: row.branch,
      mode: worktree ? 'worktree' : 'shared',
      baseBranch: worktree?.baseBranch ?? null,
      // Sessões fora da memória estão sempre encerradas; o status vivo vem do SessionManager.
      status: 'closed',
      live: false,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    },
  }
}
