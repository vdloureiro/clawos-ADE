import { execFile } from 'node:child_process'

export interface GitResult {
  code: number
  stdout: string
  stderr: string
}

/** Executa git sem lançar exceção; o chamador decide o que é erro. */
export function git(cwd: string, args: string[], input?: string): Promise<GitResult> {
  return new Promise((resolve) => {
    const child = execFile(
      'git',
      args,
      {
        cwd,
        maxBuffer: 64 * 1024 * 1024,
        timeout: 60_000,
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
      },
      (error, stdout, stderr) => {
        const code = error ? (typeof error.code === 'number' ? error.code : 1) : 0
        resolve({ code, stdout: String(stdout), stderr: String(stderr) })
      },
    )
    if (input !== undefined) child.stdin?.end(input)
  })
}

/** Como `git`, mas lança erro legível se falhar. */
export async function gitOk(cwd: string, args: string[]): Promise<string> {
  const result = await git(cwd, args)
  if (result.code !== 0) {
    throw new Error((result.stderr || result.stdout).trim() || `git ${args.join(' ')} falhou`)
  }
  return result.stdout
}
