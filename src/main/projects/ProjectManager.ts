import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import type Database from 'better-sqlite3'
import { parse, stringify } from 'yaml'
import { projectConfigSchema, type ProjectConfig } from '@shared/project'
import { PROJECT_COLORS, type AgentId, type Project } from '@shared/types'

interface ProjectRow {
  id: string
  name: string
  path: string
  color: string
  default_agent: string
  created_at: number
  last_opened_at: number | null
  sort_order: number
}

function toProject(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    path: row.path,
    color: row.color,
    defaultAgent: row.default_agent as AgentId,
    createdAt: row.created_at,
    lastOpenedAt: row.last_opened_at,
    sortOrder: row.sort_order,
  }
}

export const CONFIG_DIR = '.clawos'
export const CONFIG_FILE = 'project.yaml'

export interface ConfigReadResult {
  config: ProjectConfig
  /** Erro de leitura/validação; nesse caso `config` é o padrão vazio. */
  error: string | null
  exists: boolean
}

/** CRUD de projetos (SQLite) + leitura/escrita de `.clawos/project.yaml`. */
export class ProjectManager {
  constructor(private readonly db: Database.Database) {}

  list(): Project[] {
    const rows = this.db.prepare('SELECT * FROM projects ORDER BY sort_order').all() as ProjectRow[]
    return rows.map(toProject)
  }

  get(id: string): Project {
    const row = this.db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as
      ProjectRow | undefined
    if (!row) throw new Error(`Projeto não encontrado: ${id}`)
    return toProject(row)
  }

  add(path: string): Project {
    if (!existsSync(path) || !statSync(path).isDirectory()) {
      throw new Error(`Pasta não encontrada: ${path}`)
    }
    const existing = this.db.prepare('SELECT * FROM projects WHERE path = ?').get(path) as
      ProjectRow | undefined
    if (existing) return toProject(existing)

    const { config } = this.readConfig(path)
    const count = (this.db.prepare('SELECT COUNT(*) AS n FROM projects').get() as { n: number }).n
    const project: Project = {
      id: randomUUID(),
      name: config.name || basename(path),
      path,
      color: PROJECT_COLORS[count % PROJECT_COLORS.length]!,
      defaultAgent: config.defaultAgent ?? 'claude',
      createdAt: Date.now(),
      lastOpenedAt: null,
      sortOrder: count,
    }
    this.db
      .prepare(
        `INSERT INTO projects (id, name, path, color, default_agent, created_at, last_opened_at, sort_order)
         VALUES (@id, @name, @path, @color, @defaultAgent, @createdAt, @lastOpenedAt, @sortOrder)`,
      )
      .run(project)
    return project
  }

  update(id: string, patch: { name?: string; color?: string }): Project {
    const project = this.get(id)
    const name = patch.name?.trim() || project.name
    const color = patch.color ?? project.color
    this.db.prepare('UPDATE projects SET name = ?, color = ? WHERE id = ?').run(name, color, id)
    return { ...project, name, color }
  }

  reorder(ids: string[]): void {
    const update = this.db.prepare('UPDATE projects SET sort_order = ? WHERE id = ?')
    this.db.transaction(() => ids.forEach((id, index) => update.run(index, id)))()
  }

  /** Remove da lista do Clawos. Nunca apaga arquivos do projeto. */
  remove(id: string): void {
    this.db.prepare('DELETE FROM projects WHERE id = ?').run(id)
  }

  touch(id: string): void {
    this.db.prepare('UPDATE projects SET last_opened_at = ? WHERE id = ?').run(Date.now(), id)
  }

  // -------------------------------------------------------------------------
  // project.yaml

  readConfig(projectPath: string): ConfigReadResult {
    const file = join(projectPath, CONFIG_DIR, CONFIG_FILE)
    if (!existsSync(file)) return { config: {}, error: null, exists: false }
    try {
      const raw: unknown = parse(readFileSync(file, 'utf8')) ?? {}
      const parsed = projectConfigSchema.safeParse(raw)
      if (!parsed.success) {
        const issues = parsed.error.issues.map(
          (i) => `${i.path.join('.') || '(raiz)'}: ${i.message}`,
        )
        return { config: {}, error: `project.yaml inválido — ${issues.join('; ')}`, exists: true }
      }
      return { config: parsed.data, error: null, exists: true }
    } catch (error) {
      return {
        config: {},
        error: `Erro ao ler project.yaml: ${(error as Error).message}`,
        exists: true,
      }
    }
  }

  writeConfig(projectId: string, config: ProjectConfig): void {
    const project = this.get(projectId)
    const parsed = projectConfigSchema.parse(config)
    const dir = join(project.path, CONFIG_DIR)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, CONFIG_FILE), stringify(parsed, { lineWidth: 0 }))
    // Arquivos locais gerados nunca vão para o git do projeto.
    const gitignore = join(dir, '.gitignore')
    if (!existsSync(gitignore)) writeFileSync(gitignore, 'local/\n')

    if (parsed.defaultAgent && parsed.defaultAgent !== project.defaultAgent) {
      this.db
        .prepare('UPDATE projects SET default_agent = ? WHERE id = ?')
        .run(parsed.defaultAgent, projectId)
    }
  }
}
