/**
 * Migrations do SQLite, em ordem. Nunca edite uma migration já publicada: adicione outra.
 */
export const MIGRATIONS: string[] = [
  /* 1 */ `
  CREATE TABLE projects (
    id             TEXT PRIMARY KEY,
    name           TEXT NOT NULL,
    path           TEXT NOT NULL UNIQUE,
    color          TEXT NOT NULL,
    default_agent  TEXT NOT NULL DEFAULT 'claude',
    created_at     INTEGER NOT NULL,
    last_opened_at INTEGER,
    sort_order     INTEGER NOT NULL
  );

  CREATE TABLE sessions (
    id             TEXT PRIMARY KEY,
    project_id     TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    agent_id       TEXT NOT NULL,
    title          TEXT NOT NULL,
    mode           TEXT NOT NULL DEFAULT 'shared' CHECK (mode IN ('shared', 'worktree')),
    worktree_path  TEXT,
    branch         TEXT,
    acp_session_id TEXT,
    status         TEXT NOT NULL,
    created_at     INTEGER NOT NULL,
    updated_at     INTEGER NOT NULL
  );
  CREATE INDEX sessions_project ON sessions(project_id, updated_at DESC);

  CREATE TABLE messages (
    id         TEXT NOT NULL,
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    seq        INTEGER NOT NULL,
    role       TEXT NOT NULL,
    kind       TEXT NOT NULL CHECK (kind IN ('text', 'tool_call', 'tool_result', 'diff', 'permission', 'plan', 'error')),
    payload    TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (session_id, seq)
  );

  CREATE TABLE layouts (
    project_id    TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
    dockview_json TEXT NOT NULL,
    updated_at    INTEGER NOT NULL
  );

  CREATE TABLE layout_presets (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    dockview_json TEXT NOT NULL
  );

  -- Valores criptografados com safeStorage (criptografia do SO). Nunca em texto puro.
  CREATE TABLE secrets (
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    value      BLOB NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (project_id, name)
  );
  `,
  /* 2 */ `
  ALTER TABLE sessions ADD COLUMN base_branch TEXT;
  ALTER TABLE sessions ADD COLUMN base_commit TEXT;
  `,
  /* 3 */ `
  CREATE TABLE tasks (
    id           TEXT PRIMARY KEY,
    project_id   TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title        TEXT NOT NULL,
    notes        TEXT NOT NULL DEFAULT '',
    status       TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'doing', 'done')),
    priority     INTEGER NOT NULL DEFAULT 4 CHECK (priority BETWEEN 1 AND 4),
    due_date     TEXT,
    sort_order   INTEGER NOT NULL,
    session_id   TEXT REFERENCES sessions(id) ON DELETE SET NULL,
    created_at   INTEGER NOT NULL,
    updated_at   INTEGER NOT NULL,
    completed_at INTEGER
  );
  CREATE INDEX tasks_project ON tasks(project_id, status, sort_order);
  `,
]
