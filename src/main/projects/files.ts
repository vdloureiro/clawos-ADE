import { execFile } from 'node:child_process'
import { readdir } from 'node:fs/promises'
import { join, relative } from 'node:path'

const LIMIT = 20_000
const IGNORED = new Set([
  '.git',
  'node_modules',
  'dist',
  'out',
  'build',
  '.next',
  '.venv',
  '__pycache__',
])

/**
 * Arquivos do projeto para o `@` do chat. Em repositórios git usa `git ls-files`
 * (respeita o .gitignore); fora do git, varre a pasta ignorando diretórios pesados.
 */
export async function listProjectFiles(root: string): Promise<string[]> {
  const fromGit = await gitFiles(root)
  if (fromGit) return fromGit.slice(0, LIMIT)
  const files: string[] = []
  await walk(root, root, files)
  return files
}

function gitFiles(root: string): Promise<string[] | null> {
  return new Promise((resolve) => {
    execFile(
      'git',
      ['ls-files', '--cached', '--others', '--exclude-standard'],
      { cwd: root, maxBuffer: 64 * 1024 * 1024, timeout: 10_000 },
      (error, stdout) => resolve(error ? null : stdout.split('\n').filter(Boolean)),
    )
  })
}

async function walk(root: string, dir: string, out: string[]): Promise<void> {
  if (out.length >= LIMIT) return
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    if (out.length >= LIMIT) return
    if (entry.isDirectory()) {
      if (!IGNORED.has(entry.name)) await walk(root, join(dir, entry.name), out)
    } else if (entry.isFile()) {
      out.push(relative(root, join(dir, entry.name)))
    }
  }
}

/** Branch atual (hash curto se o HEAD estiver destacado; null fora de um repositório git). */
export async function currentBranch(cwd: string): Promise<string | null> {
  // `symbolic-ref` funciona mesmo em repositórios ainda sem commits.
  return (
    (await git(cwd, ['symbolic-ref', '--short', '-q', 'HEAD'])) ??
    git(cwd, ['rev-parse', '--short', 'HEAD'])
  )
}

function git(cwd: string, args: string[]): Promise<string | null> {
  return new Promise((resolve) => {
    execFile('git', args, { cwd, timeout: 5000 }, (error, stdout) =>
      resolve(error ? null : stdout.trim() || null),
    )
  })
}
