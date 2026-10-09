import type { AgentId } from '@shared/types'

/**
 * Agentes conhecidos pelo Clawos.
 *
 * Cada agente é um CLI oficial que o usuário instala e loga por conta própria. O Clawos
 * só conversa com ele via ACP — nativo (`acp.kind = 'native'`) ou por um adaptador JS
 * embutido no app (`acp.kind = 'adapter'`), que recebe o caminho do CLI do usuário.
 */
export interface AgentDefinition {
  id: AgentId
  name: string
  /** Executável do CLI oficial, procurado no PATH do usuário. */
  cli: string
  /** Argumentos para obter a versão (`<cli> ...args`). */
  versionArgs: string[]
  /** Comando de status de login. Exit 0 = logado. `null` se o CLI não tiver um. */
  statusArgs: string[] | null
  /** Comando oficial de login, executado num terminal visível ao usuário. */
  loginArgs: string[]
  installHint: string
  installUrl: string
  acp:
    | {
        kind: 'adapter'
        /** Módulo do adaptador ACP (resolvido a partir de node_modules). */
        module: string
        /** Variáveis que apontam o adaptador para o CLI do usuário. */
        env: (cliPath: string) => Record<string, string>
      }
    | { kind: 'native'; args: string[] }
}

export const AGENTS: Record<AgentId, AgentDefinition> = {
  claude: {
    id: 'claude',
    name: 'Claude',
    cli: 'claude',
    versionArgs: ['--version'],
    statusArgs: ['auth', 'status'],
    loginArgs: ['auth', 'login'],
    installHint: 'curl -fsSL https://claude.ai/install.sh | bash',
    installUrl: 'https://code.claude.com/docs/en/setup',
    acp: {
      kind: 'adapter',
      module: '@agentclientprotocol/claude-agent-acp/dist/index.js',
      env: (cliPath) => ({ CLAUDE_CODE_EXECUTABLE: cliPath }),
    },
  },
}

export function getAgent(id: AgentId): AgentDefinition {
  const agent = AGENTS[id]
  if (!agent) throw new Error(`Agente desconhecido: ${id}`)
  return agent
}
