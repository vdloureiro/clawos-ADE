import type Database from 'better-sqlite3'
import { mcpServerSchema, type McpServerConfig } from '@shared/project'
import type { Cipher } from '../secrets/SecretStore'

/**
 * MCPs "globais" do Clawos: configurados uma vez nas Configurações e ativos em todos os
 * projetos (cada projeto pode desligar). Não confundir com os MCPs globais dos próprios
 * agentes (~/.claude.json, config do Codex), que o Clawos sempre desliga nas sessões.
 */
export class SharedMcpStore {
  constructor(
    private readonly db: Database.Database,
    private readonly cipher: Cipher,
  ) {}

  list(): Record<string, McpServerConfig> {
    const rows = this.db
      .prepare('SELECT name, config FROM shared_mcps ORDER BY created_at')
      .all() as { name: string; config: string }[]
    const out: Record<string, McpServerConfig> = {}
    for (const row of rows) {
      const parsed = mcpServerSchema.safeParse(JSON.parse(row.config))
      if (parsed.success) out[row.name] = parsed.data
    }
    return out
  }

  /** Salva (ou substitui) um MCP e guarda os tokens dele no cofre. */
  save(name: string, server: McpServerConfig, secrets: Record<string, string>): void {
    if (!/^[\w-]+$/.test(name)) throw new Error('Nome inválido: use letras, números, - ou _.')
    const config = mcpServerSchema.parse(server)
    if (Object.keys(secrets).length > 0 && !this.cipher.isAvailable())
      throw new Error('Criptografia do sistema indisponível; o token não foi salvo.')
    this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO shared_mcps (name, config, created_at) VALUES (?, ?, ?)
           ON CONFLICT(name) DO UPDATE SET config = excluded.config`,
        )
        .run(name, JSON.stringify(config), Date.now())
      for (const [secret, value] of Object.entries(secrets)) {
        this.db
          .prepare(
            `INSERT INTO shared_secrets (name, value, updated_at) VALUES (?, ?, ?)
             ON CONFLICT(name) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
          )
          .run(secret, this.cipher.encrypt(value), Date.now())
      }
    })()
  }

  remove(name: string): void {
    this.db.prepare('DELETE FROM shared_mcps WHERE name = ?').run(name)
  }

  secret(name: string): string | null {
    const row = this.db.prepare('SELECT value FROM shared_secrets WHERE name = ?').get(name) as
      { value: Buffer } | undefined
    return row ? this.cipher.decrypt(row.value) : null
  }

  secretNames(): string[] {
    return (this.db.prepare('SELECT name FROM shared_secrets').all() as { name: string }[]).map(
      (r) => r.name,
    )
  }

  /** Globais desligados neste projeto. */
  disabledFor(projectId: string): string[] {
    return (
      this.db
        .prepare('SELECT name FROM project_shared_mcp_off WHERE project_id = ?')
        .all(projectId) as { name: string }[]
    ).map((r) => r.name)
  }

  setEnabledFor(projectId: string, name: string, enabled: boolean): void {
    if (enabled)
      this.db
        .prepare('DELETE FROM project_shared_mcp_off WHERE project_id = ? AND name = ?')
        .run(projectId, name)
    else
      this.db
        .prepare('INSERT OR IGNORE INTO project_shared_mcp_off (project_id, name) VALUES (?, ?)')
        .run(projectId, name)
  }

  /** MCPs globais que valem para o projeto (o MCP do próprio projeto vence se o nome repetir). */
  forProject(projectId: string, projectServers: Record<string, McpServerConfig> = {}) {
    const off = new Set(this.disabledFor(projectId))
    return Object.fromEntries(
      Object.entries(this.list()).filter(([name]) => !off.has(name) && !(name in projectServers)),
    )
  }
}
