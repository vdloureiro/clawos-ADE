import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { materializePlugin } from './materialize'

describe('materializePlugin', () => {
  it('gera plugin.json e links para as skills', () => {
    const root = mkdtempSync(join(tmpdir(), 'clawos-test-'))
    const source = join(root, 'skills/revisao')
    mkdirSync(source, { recursive: true })
    writeFileSync(join(source, 'SKILL.md'), '---\nname: revisao\n---\n')
    const dir = join(root, 'out/claude-plugin')

    materializePlugin({ dir, name: 'clawos-project', skills: [{ name: 'revisao', source }] })

    expect(JSON.parse(readFileSync(join(dir, '.claude-plugin/plugin.json'), 'utf8')).name).toBe(
      'clawos-project',
    )
    expect(readFileSync(join(dir, 'skills/revisao/SKILL.md'), 'utf8')).toContain('revisao')
  })

  it('falha se a pasta não tiver SKILL.md', () => {
    const root = mkdtempSync(join(tmpdir(), 'clawos-test-'))
    const dir = join(root, 'out')
    expect(() =>
      materializePlugin({ dir, name: 'x', skills: [{ name: 'a', source: root }] }),
    ).toThrow(/SKILL.md/)
    expect(existsSync(dir)).toBe(false)
  })
})
