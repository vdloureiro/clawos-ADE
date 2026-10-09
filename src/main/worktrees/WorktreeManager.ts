import { existsSync, readFileSync, statSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { MergeResult, WorktreeDiff, WorktreeFile } from '@shared/types'
import { git, gitOk } from './git'

export interface WorktreeInfo {
  path: string
  branch: string
  baseBranch: string
  baseCommit: string
}

/** Tamanho máximo de um arquivo exibido no diff (texto). */
const MAX_DIFF_BYTES = 512 * 1024

/**
 * Worktrees git por sessão: cada sessão "isolada" trabalha numa branch própria
 * (`clawos/<id>`) num diretório fora do repositório, criada a partir da branch atual.
 */
export class WorktreeManager {
  constructor(private readonly root: string) {}

  async create(repoPath: string, sessionId: string): Promise<WorktreeInfo> {
    const inside = await git(repoPath, ['rev-parse', '--is-inside-work-tree'])
    if (inside.code !== 0) throw new Error('A pasta do projeto não é um repositório git.')
    const head = await git(repoPath, ['rev-parse', '--verify', 'HEAD'])
    if (head.code !== 0)
      throw new Error(
        'O repositório ainda não tem nenhum commit; faça o primeiro commit para usar worktrees.',
      )

    const baseCommit = head.stdout.trim()
    const symbolic = await git(repoPath, ['symbolic-ref', '--short', '-q', 'HEAD'])
    const baseBranch = symbolic.code === 0 ? symbolic.stdout.trim() : baseCommit
    const short = sessionId.slice(0, 8)
    const branch = `clawos/${short}`
    const path = join(this.root, short)

    await mkdir(dirname(path), { recursive: true })
    await gitOk(repoPath, ['worktree', 'add', '-b', branch, path, baseCommit])
    return { path, branch, baseBranch, baseCommit }
  }

  /** Alterações da worktree (commitadas ou não, inclusive arquivos novos) contra a base. */
  async diff(info: WorktreeInfo): Promise<WorktreeDiff> {
    // Marca arquivos novos como "intenção de adicionar" para aparecerem no diff.
    await git(info.path, ['add', '--intent-to-add', '--all'])
    const out = await gitOk(info.path, [
      'diff',
      '--name-status',
      '-z',
      '--no-renames',
      info.baseCommit,
    ])
    const parts = out.split('\0').filter(Boolean)
    const files: WorktreeFile[] = []
    for (let i = 0; i + 1 < parts.length; i += 2) {
      const status = parts[i]![0] as 'A' | 'M' | 'D'
      const path = parts[i + 1]!
      files.push(await this.fileDiff(info, path, status))
    }
    return { branch: info.branch, baseBranch: info.baseBranch, files }
  }

  private async fileDiff(
    info: WorktreeInfo,
    path: string,
    status: 'A' | 'M' | 'D',
  ): Promise<WorktreeFile> {
    const file: WorktreeFile = { path, status, oldText: null, newText: null, binary: false }
    if (status !== 'A') {
      const old = await git(info.path, ['show', `${info.baseCommit}:${path}`])
      if (old.code === 0) file.oldText = old.stdout
    }
    const absolute = join(info.path, path)
    if (status !== 'D' && existsSync(absolute)) {
      if (statSync(absolute).size > MAX_DIFF_BYTES) {
        file.binary = true
      } else {
        const buffer = readFileSync(absolute)
        if (buffer.includes(0)) file.binary = true
        else file.newText = buffer.toString('utf8')
      }
    }
    if (file.oldText?.includes('\0')) file.binary = true
    if (file.binary) {
      file.oldText = null
      file.newText = null
    }
    return file
  }

  /**
   * Commita o que estiver pendente na worktree e mescla a branch na branch base do
   * repositório principal. Em caso de conflito, aborta e informa os arquivos.
   */
  async merge(repoPath: string, info: WorktreeInfo, message: string): Promise<MergeResult> {
    await this.commitPending(info.path, message)

    const ahead = (
      await gitOk(repoPath, ['rev-list', '--count', `${info.baseBranch}..${info.branch}`])
    ).trim()
    if (ahead === '0')
      return {
        ok: true,
        message: 'Nada para mesclar: a worktree não tem alterações.',
        conflicts: [],
      }

    const current = await git(repoPath, ['symbolic-ref', '--short', '-q', 'HEAD'])
    if (current.code !== 0 || current.stdout.trim() !== info.baseBranch) {
      const name = current.code === 0 ? current.stdout.trim() : 'HEAD destacado'
      return {
        ok: false,
        message: `O projeto está em "${name}". Mude para "${info.baseBranch}" para mesclar.`,
        conflicts: [],
      }
    }

    const result = await git(repoPath, [
      'merge',
      '--no-ff',
      '--no-edit',
      '-m',
      `Mescla ${info.branch}: ${message}`,
      info.branch,
    ])
    if (result.code === 0) {
      const commit = (await gitOk(repoPath, ['rev-parse', '--short', 'HEAD'])).trim()
      return { ok: true, message: `Mesclado em ${info.baseBranch} (${commit}).`, conflicts: [] }
    }

    const unmerged = await git(repoPath, ['diff', '--name-only', '--diff-filter=U'])
    const conflicts = unmerged.stdout.split('\n').filter(Boolean)
    if (conflicts.length > 0) await git(repoPath, ['merge', '--abort'])
    return {
      ok: false,
      message:
        conflicts.length > 0
          ? `Conflito ao mesclar em ${info.baseBranch}; nada foi alterado.`
          : (result.stderr || result.stdout).trim(),
      conflicts,
    }
  }

  /** Remove a worktree e a branch, descartando as alterações. */
  async discard(repoPath: string, info: WorktreeInfo): Promise<void> {
    await git(repoPath, ['worktree', 'remove', '--force', info.path])
    await git(repoPath, ['worktree', 'prune'])
    await git(repoPath, ['branch', '-D', info.branch])
  }

  private async commitPending(path: string, message: string): Promise<void> {
    await gitOk(path, ['add', '--all'])
    const staged = await git(path, ['diff', '--cached', '--quiet'])
    if (staged.code === 0) return
    const commit = await git(path, ['commit', '-m', message])
    if (commit.code !== 0 && /user\.(name|email)|identity/i.test(commit.stderr)) {
      // Sem identidade git configurada: usa uma genérica só para este commit.
      await gitOk(path, [
        '-c',
        'user.name=Clawos',
        '-c',
        'user.email=clawos@localhost',
        'commit',
        '-m',
        message,
      ])
    } else if (commit.code !== 0) {
      throw new Error(commit.stderr.trim() || 'Falha ao commitar as alterações da worktree.')
    }
  }
}
