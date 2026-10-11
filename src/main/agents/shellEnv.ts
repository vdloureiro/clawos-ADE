import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { delimiter, join } from 'node:path'

/**
 * Apps abertos pelo Finder/Dock não herdam o PATH do shell do usuário, então CLIs em
 * `~/.local/bin`, nvm, Homebrew etc. ficariam invisíveis. Resolvemos o PATH do login
 * shell uma vez (como fazem VS Code e o pacote `shell-env`) e somamos locais conhecidos.
 */
let cached: Promise<NodeJS.ProcessEnv> | null = null

const MARKER = '__CLAWOS_PATH__'

function readLoginShellPath(): Promise<string | null> {
  if (process.platform === 'win32') return Promise.resolve(null)
  const shell = process.env['SHELL'] || '/bin/zsh'
  return new Promise((resolve) => {
    execFile(
      shell,
      ['-ilc', `printf '${MARKER}%s${MARKER}' "$PATH"`],
      { timeout: 5000, env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined } },
      (error, stdout) => {
        if (error) return resolve(null)
        const match = stdout.match(new RegExp(`${MARKER}(.*)${MARKER}`))
        resolve(match?.[1] ?? null)
      },
    )
  })
}

function wellKnownDirs(): string[] {
  if (process.platform === 'win32') return []
  const home = homedir()
  return [
    join(home, '.local/bin'),
    join(home, '.claude/local'),
    join(home, '.npm-global/bin'),
    join(home, '.bun/bin'),
    '/opt/homebrew/bin',
    '/usr/local/bin',
  ]
}

export function mergePath(...parts: (string | null | undefined)[]): string {
  const seen = new Set<string>()
  for (const part of parts) {
    for (const dir of (part ?? '').split(delimiter)) {
      if (dir) seen.add(dir)
    }
  }
  return [...seen].join(delimiter)
}

/** Relê o PATH do shell na próxima consulta (após instalar um CLI). */
export function resetShellEnv(): void {
  cached = null
}

export function getShellEnv(): Promise<NodeJS.ProcessEnv> {
  cached ??= readLoginShellPath().then((shellPath) => {
    const env = { ...process.env }
    // Herdado de alguns editores; faria qualquer app Electron filho rodar como Node.
    delete env['ELECTRON_RUN_AS_NODE']
    env['PATH'] = mergePath(shellPath, process.env['PATH'], wellKnownDirs().join(delimiter))
    return env
  })
  return cached
}

/** Procura um executável no PATH resolvido. */
export async function which(command: string): Promise<string | null> {
  const env = await getShellEnv()
  const exts = process.platform === 'win32' ? ['.exe', '.cmd', '.bat', ''] : ['']
  for (const dir of (env['PATH'] ?? '').split(delimiter)) {
    for (const ext of exts) {
      const candidate = join(dir, command + ext)
      if (existsSync(candidate)) return candidate
    }
  }
  return null
}
