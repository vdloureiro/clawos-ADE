import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { materialize } from './materialize'

describe('materialize', () => {
  it('escreve arquivos e cria links, recriando o diretório', () => {
    const root = mkdtempSync(join(tmpdir(), 'clawos-test-'))
    const source = join(root, 'skills/revisao')
    mkdirSync(source, { recursive: true })
    writeFileSync(join(source, 'SKILL.md'), '---\nname: revisao\n---\n')
    const dir = join(root, 'out')
    mkdirSync(dir)
    writeFileSync(join(dir, 'velho.txt'), 'x')

    materialize(dir, {
      files: [{ path: join(dir, 'a/plugin.json'), content: '{}' }],
      links: [{ path: join(dir, 'skills/revisao'), target: source, requires: 'SKILL.md' }],
    })

    expect(readFileSync(join(dir, 'a/plugin.json'), 'utf8')).toBe('{}')
    expect(readFileSync(join(dir, 'skills/revisao/SKILL.md'), 'utf8')).toContain('revisao')
    expect(existsSync(join(dir, 'velho.txt'))).toBe(false)
  })

  it('falha antes de escrever se faltar o arquivo exigido', () => {
    const root = mkdtempSync(join(tmpdir(), 'clawos-test-'))
    const dir = join(root, 'out')
    expect(() =>
      materialize(dir, {
        files: [],
        links: [{ path: join(dir, 'x'), target: root, requires: 'SKILL.md' }],
      }),
    ).toThrow(/SKILL.md/)
    expect(existsSync(dir)).toBe(false)
  })
})
