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
  /* 4 */ `
  ALTER TABLE sessions ADD COLUMN config TEXT;
  -- Última escolha de modelo/modo de permissão por agente, usada nas conversas novas.
  CREATE TABLE agent_preferences (
    agent_id   TEXT PRIMARY KEY,
    config     TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );
  `,
  /* 5 */ `
  -- Pastas da barra lateral (ex.: uma por cliente). Pastas e projetos soltos dividem a
  -- mesma ordem no nível de cima; dentro de uma pasta, sort_order é a ordem na pasta.
  CREATE TABLE project_folders (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    sort_order INTEGER NOT NULL,
    collapsed  INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );
  ALTER TABLE projects ADD COLUMN folder_id TEXT REFERENCES project_folders(id) ON DELETE SET NULL;
  -- Modo de permissão das conversas novas: 'auto', 'ask' ou NULL (última escolha).
  ALTER TABLE projects ADD COLUMN permission_default TEXT;
  `,
  /* 6 */ `
  -- Acesso remoto: aparelhos pareados (só o hash da chave é guardado) e ajustes do app.
  CREATE TABLE remote_devices (
    id           TEXT PRIMARY KEY,
    name         TEXT NOT NULL,
    token_hash   TEXT NOT NULL UNIQUE,
    created_at   INTEGER NOT NULL,
    last_seen_at INTEGER
  );
  CREATE TABLE app_settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  `,
  /* 7 */ `
  -- MCPs ativos em todos os projetos (configurados nas Configurações do Clawos).
  CREATE TABLE shared_mcps (
    name       TEXT PRIMARY KEY,
    config     TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  -- Tokens desses MCPs, criptografados pelo sistema (como os segredos de projeto).
  CREATE TABLE shared_secrets (
    name       TEXT PRIMARY KEY,
    value      BLOB NOT NULL,
    updated_at INTEGER NOT NULL
  );
  -- Projetos que desligaram algum MCP global.
  CREATE TABLE project_shared_mcp_off (
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    PRIMARY KEY (project_id, name)
  );
  `,
  /* 8 */ `
  -- Mensagens fixadas numa conversa (como no Instagram). A posição é o índice do item no
  -- histórico (reconstruído sempre na mesma ordem); o texto fica salvo para o destaque.
  CREATE TABLE pinned_messages (
    id         TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    item_index INTEGER NOT NULL,
    text       TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    UNIQUE (session_id, item_index)
  );
  `,
]
