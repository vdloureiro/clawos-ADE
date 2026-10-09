import { execFile } from 'node:child_process'
import type { AgentId, AgentStatus } from '@shared/types'
import { AGENTS, type AgentDefinition, type GlobalMcp } from './registry'
import { getShellEnv, which } from './shellEnv'

interface RunResult {
  code: number
  stdout: string
  stderr: string
}

export async function run(file: string, args: string[]): Promise<RunResult> {
  const env = await getShellEnv()
  return new Promise((resolve) => {
    execFile(file, args, { env, timeout: 10_000 }, (error, stdout, stderr) => {
      const code = error ? (typeof error.code === 'number' ? error.code : 1) : 0
      resolve({ code, stdout: String(stdout), stderr: String(stderr) })
    })
  })
}

/** Extrai "2.1.87" de saídas como "2.1.87 (Claude Code)". */
export function parseVersion(output: string): string | null {
  return output.match(/\d+\.\d+\.\d+[\w.-]*/)?.[0] ?? null
}

/** `claude auth status` imprime JSON; exit 0 = logado. Nunca lemos arquivos de token. */
export function describeClaudeAuth(stdout: string): string | null {
  try {
    const data = JSON.parse(stdout) as { authMethod?: string; email?: string }
    if (!data.authMethod || data.authMethod === 'none') return null
    return data.email ? `${data.authMethod} · ${data.email}` : data.authMethod
  } catch {
    return null
  }
}

export async function detectAgent(agent: AgentDefinition): Promise<AgentStatus> {
  const base: AgentStatus = {
    id: agent.id,
    name: agent.name,
    installed: false,
    version: null,
    loggedIn: null,
    detail: null,
    installHint: agent.installHint,
    installUrl: agent.installUrl,
  }

  const cliPath = await which(agent.cli)
  if (!cliPath) return base

  const version = await run(cliPath, agent.versionArgs)
  const status: AgentStatus = {
    ...base,
    installed: true,
    version: parseVersion(version.stdout || version.stderr),
  }
  if (!agent.statusArgs) return status

  const auth = await run(cliPath, agent.statusArgs)
  return {
    ...status,
    loggedIn: auth.code === 0,
    detail: agent.id === 'claude' ? describeClaudeAuth(auth.stdout) : null,
  }
}

let cache: Promise<AgentStatus[]> | null = null

export function detectAll(refresh = false): Promise<AgentStatus[]> {
  if (refresh || !cache) {
    cache = Promise.all(Object.values(AGENTS).map(detectAgent))
  }
  return cache
}

export async function resolveCli(id: AgentId): Promise<string> {
  const agent = AGENTS[id]
  const path = await which(agent.cli)
  if (!path) throw new Error(`${agent.name} não está instalado (comando "${agent.cli}").`)
  return path
}

/** MCPs globais do usuário neste agente (vazio se não houver como listar). */
export async function globalMcps(id: AgentId): Promise<GlobalMcp[]> {
  const agent = AGENTS[id]
  if (!agent.globalMcp) return []
  const cliPath = await which(agent.cli)
  if (!cliPath) return []
  const result = await run(cliPath, agent.globalMcp.args)
  return result.code === 0 ? agent.globalMcp.parse(result.stdout) : []
}
