import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SKILL_CATALOG, skillFiles } from '@shared/skillCatalog'
import { gitBlobSha, installSkill } from './installSkill'

const enc = new TextEncoder()

describe('catálogo de skills', () => {
  it('toda skill tem SKILL.md e arquivos com hash', () => {
    const ids = new Set<string>()
    for (const entry of SKILL_CATALOG) {
      expect(ids.has(entry.id)).toBe(false)
      ids.add(entry.id)
      const files = skillFiles(entry.id)
      expect(files.some(([path]) => path === 'SKILL.md')).toBe(true)
      for (const [, sha] of files) expect(sha).toMatch(/^[0-9a-f]{40}$/)
    }
  })
})

describe('installSkill', () => {
  it('confere o hash git (igual ao `git hash-object`)', () => {
    expect(gitBlobSha(enc.encode('hello\n'))).toBe('ce013625030ba8dba906f756967f9e9ca394464a')
  })

  it('baixa só o commit fixado e grava a pasta da skill', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'clawos-skill-'))
    const files = skillFiles('writing-plans')
    const urls: string[] = []
    // Conteúdo falso cujo hash bate: o teste troca os hashes esperados pelos do conteúdo.
    const content = new Map(files.map(([path]) => [path, enc.encode(`conteúdo de ${path}`)]))
    for (const file of files) file[1] = gitBlobSha(content.get(file[0])!)

    const path = await installSkill(dir, 'writing-plans', async (url) => {
      urls.push(url)
      return content.get(url.split('/skills/writing-plans/')[1]!)!
    })

    expect(path).toBe('./.clawos/skills/writing-plans')
    expect(
      urls.every((u) => u.includes('/obra/superpowers/bb92a77741419a4ab5f06e711a283343f1ada0c3/')),
    ).toBe(true)
    expect(readFileSync(join(dir, '.clawos/skills/writing-plans/SKILL.md'), 'utf8')).toBe(
      'conteúdo de SKILL.md',
    )
  })

  it('cancela tudo se um arquivo vier adulterado', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'clawos-skill-'))
    await expect(
      installSkill(dir, 'frontend-design', async () => enc.encode('adulterado')),
    ).rejects.toThrow(/diferente do esperado/)
    expect(existsSync(join(dir, '.clawos/skills/frontend-design'))).toBe(false)
    expect(existsSync(join(dir, '.clawos/skills/.frontend-design.download'))).toBe(false)
  })

  it('recusa skill fora do catálogo', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'clawos-skill-'))
    await expect(installSkill(dir, '../../etc', async () => new Uint8Array())).rejects.toThrow(
      /desconhecida/,
    )
  })
})
