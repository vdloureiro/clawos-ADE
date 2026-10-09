import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { currentBranch, listProjectFiles } from './files'

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), 'clawos-test-'))
}

describe('listProjectFiles', () => {
  it('fora do git, varre a pasta ignorando node_modules', async () => {
    const dir = tempDir()
    mkdirSync(join(dir, 'src'))
    mkdirSync(join(dir, 'node_modules/x'), { recursive: true })
    writeFileSync(join(dir, 'src/a.ts'), '')
    writeFileSync(join(dir, 'node_modules/x/i.js'), '')
    expect(await listProjectFiles(dir)).toEqual(['src/a.ts'])
    expect(await currentBranch(dir)).toBeNull()
  })

  it('no git, respeita o .gitignore e informa a branch', async () => {
    const dir = tempDir()
    execFileSync('git', ['init', '-q', '-b', 'principal'], { cwd: dir })
    writeFileSync(join(dir, '.gitignore'), 'segredo.txt\n')
    writeFileSync(join(dir, 'a.ts'), '')
    writeFileSync(join(dir, 'segredo.txt'), '')
    expect((await listProjectFiles(dir)).sort()).toEqual(['.gitignore', 'a.ts'])
    expect(await currentBranch(dir)).toBe('principal')
  })
})
