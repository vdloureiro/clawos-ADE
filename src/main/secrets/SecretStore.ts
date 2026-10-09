import type Database from 'better-sqlite3'

/** Criptografia injetável para testes; em produção é o `safeStorage` do Electron. */
export interface Cipher {
  isAvailable(): boolean
  encrypt(value: string): Buffer
  decrypt(value: Buffer): string
}

/**
 * Segredos por projeto (ex.: tokens de MCP), criptografados pelo sistema operacional.
 * O renderer só vê os nomes; os valores saem daqui apenas para o processo do agente.
 */
export class SecretStore {
  constructor(
    private readonly db: Database.Database,
    private readonly cipher: Cipher,
  ) {}

  names(projectId: string): string[] {
    const rows = this.db
      .prepare('SELECT name FROM secrets WHERE project_id = ? ORDER BY name')
      .all(projectId) as { name: string }[]
    return rows.map((r) => r.name)
  }

  set(projectId: string, name: string, value: string): void {
    if (!/^[\w-]+$/.test(name))
      throw new Error('Nome de segredo inválido: use letras, números, - ou _.')
    if (!this.cipher.isAvailable()) {
      throw new Error('Criptografia do sistema indisponível; o segredo não foi salvo.')
    }
    this.db
      .prepare(
        `INSERT INTO secrets (project_id, name, value, updated_at) VALUES (?, ?, ?, ?)
         ON CONFLICT (project_id, name) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      )
      .run(projectId, name, this.cipher.encrypt(value), Date.now())
  }

  get(projectId: string, name: string): string | null {
    const row = this.db
      .prepare('SELECT value FROM secrets WHERE project_id = ? AND name = ?')
      .get(projectId, name) as { value: Buffer } | undefined
    return row ? this.cipher.decrypt(row.value) : null
  }

  delete(projectId: string, name: string): void {
    this.db.prepare('DELETE FROM secrets WHERE project_id = ? AND name = ?').run(projectId, name)
  }
}
