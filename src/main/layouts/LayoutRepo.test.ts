import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { openDatabase } from '../db'
import { ProjectManager } from '../projects/ProjectManager'
import { LayoutRepo } from './LayoutRepo'

describe('LayoutRepo', () => {
  it('salva layout por projeto e gerencia presets', () => {
    const db = openDatabase(':memory:')
    const project = new ProjectManager(db).add(mkdtempSync(join(tmpdir(), 'clawos-test-')))
    const layouts = new LayoutRepo(db)

    expect(layouts.get(project.id)).toBeNull()
    layouts.save(project.id, '{"a":1}')
    layouts.save(project.id, '{"a":2}')
    expect(layouts.get(project.id)).toBe('{"a":2}')

    const preset = layouts.savePreset('Meu layout', '{"grid":1}')
    expect(layouts.listPresets()).toEqual([
      { id: preset.id, name: 'Meu layout', json: '{"grid":1}' },
    ])
    layouts.deletePreset(preset.id)
    expect(layouts.listPresets()).toEqual([])
  })
})
