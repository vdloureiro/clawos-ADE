import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import type Database from 'better-sqlite3'
import { parse, stringify } from 'yaml'
import { projectConfigSchema, type ProjectConfig } from '@shared/project'
import {
  PROJECT_COLORS,
  type AgentId,
  type FolderInspection,
  type NewProjectInput,
  type PermissionDefault,
  type Project,
  type ProjectFolder,
  type SidebarArrangement,
} from '@shared/types'

interface ProjectRow {
  id: string
  name: string
  path: string
  color: string
  default_agent: string
  created_at: number
  last_opened_at: number | null
  sort_order: number
  folder_id: string | null
  permission_default: string | null
}

interface FolderRow {
  id: string
  name: string
  sort_order: number
  collapsed: number
}

function toFolder(row: FolderRow): ProjectFolder {
  return { id: row.id, name: row.name, sortOrder: row.sort_order, collapsed: row.collapsed === 1 }
}

function toPermission(value: string | null): PermissionDefault | null {
  return value === 'auto' || value === 'ask' ? value : null
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
    folderId: row.folder_id,
    permissionDefault: toPermission(row.permission_default),
  }
}

export const CONFIG_DIR = '.clawos'
export const CONFIG_FILE = 'project.yaml'

/** Pastas onde agentes procuram skills dentro de um projeto. */
const SKILL_DIRS = ['.agents/skills', '.claude/skills', '.clawos/skills', '.gemini/skills']
const INSTRUCTION_FILES = ['CLAUDE.md', 'AGENTS.md', 'GEMINI.md']

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
    // Projeto novo entra no fim do nível de cima (depois de pastas e projetos soltos).
    const last = this.db
      .prepare(
        `SELECT MAX(o) AS o FROM (
           SELECT sort_order AS o FROM projects WHERE folder_id IS NULL
           UNION ALL SELECT sort_order FROM project_folders)`,
      )
      .get() as { o: number | null }
    const project: Project = {
      id: randomUUID(),
      name: config.name || basename(path),
      path,
      color: PROJECT_COLORS[count % PROJECT_COLORS.length]!,
      defaultAgent: config.defaultAgent ?? 'claude',
      createdAt: Date.now(),
      lastOpenedAt: null,
      sortOrder: (last.o ?? -1) + 1,
      folderId: null,
      permissionDefault: null,
    }
    this.db
      .prepare(
        `INSERT INTO projects (id, name, path, color, default_agent, created_at, last_opened_at, sort_order)
         VALUES (@id, @name, @path, @color, @defaultAgent, @createdAt, @lastOpenedAt, @sortOrder)`,
      )
      .run(project)
    return project
  }

  update(
    id: string,
    patch: { name?: string; color?: string; permissionDefault?: PermissionDefault | null },
  ): Project {
    const project = this.get(id)
    const name = patch.name?.trim() || project.name
    const color = patch.color ?? project.color
    const permissionDefault =
      patch.permissionDefault === undefined
        ? project.permissionDefault
        : toPermission(patch.permissionDefault)
    this.db
      .prepare('UPDATE projects SET name = ?, color = ?, permission_default = ? WHERE id = ?')
      .run(name, color, permissionDefault, id)
    return { ...project, name, color, permissionDefault }
  }

  // -------------------------------------------------------------------------
  // Pastas da barra lateral

  listFolders(): ProjectFolder[] {
    const rows = this.db
      .prepare('SELECT * FROM project_folders ORDER BY sort_order')
      .all() as FolderRow[]
    return rows.map(toFolder)
  }

  /** Cria a pasta no topo da lista (onde a pessoa vai procurar logo em seguida). */
  createFolder(name: string): ProjectFolder {
    const clean = name.trim() || 'Nova pasta'
    const first = this.db
      .prepare(
        `SELECT MIN(o) AS o FROM (
           SELECT sort_order AS o FROM projects WHERE folder_id IS NULL
           UNION ALL SELECT sort_order FROM project_folders)`,
      )
      .get() as { o: number | null }
    const folder: ProjectFolder = {
      id: randomUUID(),
      name: clean,
      sortOrder: (first.o ?? 0) - 1,
      collapsed: false,
    }
    this.db
      .prepare(
        'INSERT INTO project_folders (id, name, sort_order, collapsed, created_at) VALUES (?, ?, ?, 0, ?)',
      )
      .run(folder.id, folder.name, folder.sortOrder, Date.now())
    return folder
  }

  updateFolder(id: string, patch: { name?: string; collapsed?: boolean }): ProjectFolder {
    const row = this.db.prepare('SELECT * FROM project_folders WHERE id = ?').get(id) as
      FolderRow | undefined
    if (!row) throw new Error(`Pasta não encontrada: ${id}`)
    const name = patch.name?.trim() || row.name
    const collapsed = patch.collapsed ?? row.collapsed === 1
    this.db
      .prepare('UPDATE project_folders SET name = ?, collapsed = ? WHERE id = ?')
      .run(name, collapsed ? 1 : 0, id)
    return toFolder({ ...row, name, collapsed: collapsed ? 1 : 0 })
  }

  /** Apaga a pasta; os projetos dela voltam soltos, no lugar onde a pasta estava. */
  deleteFolder(id: string): void {
    const arrangement: SidebarArrangement = []
    for (const item of this.currentArrangement()) {
      if (item.type === 'folder' && item.id === id)
        arrangement.push(...item.projectIds.map((pid) => ({ type: 'project' as const, id: pid })))
      else arrangement.push(item)
    }
    this.db.transaction(() => {
      this.arrange(arrangement)
      this.db.prepare('DELETE FROM project_folders WHERE id = ?').run(id)
    })()
  }

  /** Grava a ordem completa da barra lateral (após arrastar projetos ou pastas). */
  arrange(items: SidebarArrangement): void {
    const setProject = this.db.prepare(
      'UPDATE projects SET folder_id = ?, sort_order = ? WHERE id = ?',
    )
    const setFolder = this.db.prepare('UPDATE project_folders SET sort_order = ? WHERE id = ?')
    this.db.transaction(() => {
      items.forEach((item, index) => {
        if (item.type === 'project') {
          setProject.run(null, index, item.id)
          return
        }
        setFolder.run(index, item.id)
        item.projectIds.forEach((pid, i) => setProject.run(item.id, i, pid))
      })
    })()
  }

  /** Ordem atual (pastas e projetos soltos intercalados pelo sort_order). */
  currentArrangement(): SidebarArrangement {
    const projects = this.list()
    const top = [
      ...this.listFolders().map((f) => ({
        order: f.sortOrder,
        item: {
          type: 'folder' as const,
          id: f.id,
          projectIds: projects.filter((p) => p.folderId === f.id).map((p) => p.id),
        },
      })),
      ...projects
        .filter((p) => !p.folderId)
        .map((p) => ({ order: p.sortOrder, item: { type: 'project' as const, id: p.id } })),
    ]
    return top.sort((a, b) => a.order - b.order).map((t) => t.item)
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

  /** O que já existe numa pasta, para o assistente de novo projeto. */
  inspect(path: string): FolderInspection {
    if (!existsSync(path) || !statSync(path).isDirectory())
      throw new Error(`Pasta não encontrada: ${path}`)
    const existing = this.db.prepare('SELECT * FROM projects WHERE path = ?').get(path) as
      ProjectRow | undefined
    const config = this.readConfig(path)
    const skills: string[] = []
    for (const dir of SKILL_DIRS) {
      const full = join(path, dir)
      if (!existsSync(full)) continue
      for (const entry of readdirSync(full, { withFileTypes: true })) {
        if (entry.isDirectory() && existsSync(join(full, entry.name, 'SKILL.md')))
          skills.push(`./${dir}/${entry.name}`)
      }
    }
    return {
      path,
      suggestedName: config.config.name || basename(path),
      isGit: existsSync(join(path, '.git')),
      alreadyAdded: existing ? toProject(existing) : null,
      config,
      instructionFiles: INSTRUCTION_FILES.filter((f) => existsSync(join(path, f))),
      skills,
    }
  }

  /**
   * Cria (ou atualiza, se a pasta já estiver na lista) um projeto com a configuração
   * inicial do assistente. A configuração é validada antes de qualquer gravação.
   */
  create(
    input: NewProjectInput,
    saveSecret: (projectId: string, name: string, value: string) => void,
  ): Project {
    const config = projectConfigSchema.parse(input.config)
    const project = this.add(input.path)
    const updated = this.update(project.id, {
      name: input.name,
      color: input.color,
      permissionDefault: input.permissionDefault,
    })
    if (input.writeConfig) this.writeConfig(project.id, config)
    for (const [name, value] of Object.entries(input.secrets)) saveSecret(project.id, name, value)
    this.db
      .prepare('UPDATE projects SET default_agent = ? WHERE id = ?')
      .run(config.defaultAgent ?? 'claude', project.id)
    return { ...updated, defaultAgent: config.defaultAgent ?? 'claude' }
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
