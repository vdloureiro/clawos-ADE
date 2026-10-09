import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { WorktreeManager } from './WorktreeManager'

function sh(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' })
}

function makeRepo(): string {
  const repo = mkdtempSync(join(tmpdir(), 'clawos-repo-'))
  sh(repo, 'init', '-q', '-b', 'main')
  sh(repo, 'config', 'user.name', 'Teste')
  sh(repo, 'config', 'user.email', 'teste@example.com')
  writeFileSync(join(repo, 'app.ts'), 'linha 1\nlinha 2\nlinha 3\n')
  sh(repo, 'add', '.')
  sh(repo, 'commit', '-q', '-m', 'inicial')
  return repo
}

describe('WorktreeManager', () => {
  let repo: string
  let manager: WorktreeManager

  beforeEach(() => {
    repo = makeRepo()
    manager = new WorktreeManager(mkdtempSync(join(tmpdir(), 'clawos-wt-')))
  })

  it('exige repositório git com commit', async () => {
    const plain = mkdtempSync(join(tmpdir(), 'clawos-plain-'))
    await expect(manager.create(plain, 'abcdef123456')).rejects.toThrow(/não é um repositório git/)
    sh(plain, 'init', '-q')
    await expect(manager.create(plain, 'abcdef123456')).rejects.toThrow(/nenhum commit/)
  })

  it('cria worktree numa branch própria e mostra o diff (inclusive arquivos novos)', async () => {
    const wt = await manager.create(repo, 'abcdef123456')
    expect(wt).toMatchObject({ branch: 'clawos/abcdef12', baseBranch: 'main' })
    expect(readFileSync(join(wt.path, 'app.ts'), 'utf8')).toContain('linha 2')

    writeFileSync(join(wt.path, 'app.ts'), 'linha 1\nlinha DOIS\nlinha 3\n')
    writeFileSync(join(wt.path, 'novo.ts'), 'export const x = 1\n')
    const diff = await manager.diff(wt)
    expect(diff.files).toEqual([
      {
        path: 'app.ts',
        status: 'M',
        oldText: 'linha 1\nlinha 2\nlinha 3\n',
        newText: 'linha 1\nlinha DOIS\nlinha 3\n',
        binary: false,
      },
      {
        path: 'novo.ts',
        status: 'A',
        oldText: null,
        newText: 'export const x = 1\n',
        binary: false,
      },
    ])
    // O repositório principal não foi tocado.
    expect(readFileSync(join(repo, 'app.ts'), 'utf8')).toContain('linha 2')
  })

  it('dois agentes no mesmo arquivo em worktrees diferentes; mescla um sem conflito', async () => {
    const a = await manager.create(repo, 'aaaaaaaa1111')
    const b = await manager.create(repo, 'bbbbbbbb2222')
    writeFileSync(join(a.path, 'app.ts'), 'linha 1 (A)\nlinha 2\nlinha 3\n')
    writeFileSync(join(b.path, 'app.ts'), 'linha 1\nlinha 2\nlinha 3 (B)\n')

    const merged = await manager.merge(repo, a, 'Alteração do agente A')
    expect(merged.ok).toBe(true)
    expect(readFileSync(join(repo, 'app.ts'), 'utf8')).toBe('linha 1 (A)\nlinha 2\nlinha 3\n')
    // A worktree B continua com o trabalho dela, intacta.
    expect(readFileSync(join(b.path, 'app.ts'), 'utf8')).toBe('linha 1\nlinha 2\nlinha 3 (B)\n')

    // Linhas diferentes: a segunda mescla também entra limpa.
    expect((await manager.merge(repo, b, 'Alteração do agente B')).ok).toBe(true)
    expect(readFileSync(join(repo, 'app.ts'), 'utf8')).toBe('linha 1 (A)\nlinha 2\nlinha 3 (B)\n')
  })

  it('conflito real: aborta a mescla e lista os arquivos', async () => {
    const a = await manager.create(repo, 'aaaaaaaa1111')
    const b = await manager.create(repo, 'bbbbbbbb2222')
    writeFileSync(join(a.path, 'app.ts'), 'linha 1\nlinha A\nlinha 3\n')
    writeFileSync(join(b.path, 'app.ts'), 'linha 1\nlinha B\nlinha 3\n')
    expect((await manager.merge(repo, a, 'A')).ok).toBe(true)

    const result = await manager.merge(repo, b, 'B')
    expect(result).toMatchObject({ ok: false, conflicts: ['app.ts'] })
    expect(sh(repo, 'status', '--porcelain')).toBe('')
    expect(readFileSync(join(repo, 'app.ts'), 'utf8')).toContain('linha A')
  })

  it('recusa mesclar se o projeto estiver em outra branch', async () => {
    const a = await manager.create(repo, 'aaaaaaaa1111')
    writeFileSync(join(a.path, 'app.ts'), 'mudou\n')
    sh(repo, 'checkout', '-q', '-b', 'outra')
    expect(await manager.merge(repo, a, 'A')).toMatchObject({
      ok: false,
      message: expect.stringContaining('"main"'),
    })
  })

  it('sem alterações, não há o que mesclar', async () => {
    const a = await manager.create(repo, 'aaaaaaaa1111')
    expect(await manager.merge(repo, a, 'A')).toMatchObject({
      ok: true,
      message: expect.stringContaining('Nada'),
    })
  })

  it('descartar remove a worktree e a branch', async () => {
    const a = await manager.create(repo, 'aaaaaaaa1111')
    writeFileSync(join(a.path, 'app.ts'), 'mudou\n')
    await manager.discard(repo, a)
    expect(existsSync(a.path)).toBe(false)
    expect(sh(repo, 'branch', '--list', 'clawos/*')).toBe('')
    expect(readFileSync(join(repo, 'app.ts'), 'utf8')).toContain('linha 2')
  })
})
