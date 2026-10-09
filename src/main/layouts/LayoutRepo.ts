import { randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3'
import type { LayoutPreset } from '@shared/types'

/** Layout do dockview por projeto e presets salvos pelo usuário (JSON opaco para o main). */
export class LayoutRepo {
  constructor(private readonly db: Database.Database) {}

  get(projectId: string): string | null {
    const row = this.db
      .prepare('SELECT dockview_json FROM layouts WHERE project_id = ?')
      .get(projectId) as { dockview_json: string } | undefined
    return row?.dockview_json ?? null
  }

  save(projectId: string, json: string): void {
    this.db
      .prepare(
        `INSERT INTO layouts (project_id, dockview_json, updated_at) VALUES (?, ?, ?)
         ON CONFLICT (project_id) DO UPDATE SET dockview_json = excluded.dockview_json, updated_at = excluded.updated_at`,
      )
      .run(projectId, json, Date.now())
  }

  listPresets(): LayoutPreset[] {
    const rows = this.db
      .prepare('SELECT id, name, dockview_json FROM layout_presets ORDER BY name')
      .all() as {
      id: string
      name: string
      dockview_json: string
    }[]
    return rows.map((r) => ({ id: r.id, name: r.name, json: r.dockview_json }))
  }

  savePreset(name: string, json: string): LayoutPreset {
    const preset = { id: randomUUID(), name: name.trim() || 'Layout', json }
    this.db
      .prepare('INSERT INTO layout_presets (id, name, dockview_json) VALUES (?, ?, ?)')
      .run(preset.id, preset.name, json)
    return preset
  }

  deletePreset(id: string): void {
    this.db.prepare('DELETE FROM layout_presets WHERE id = ?').run(id)
  }
}
