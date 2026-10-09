import { AGENT_META, type AgentId } from '@shared/agents'

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
  /**
   * Lista os nomes dos MCPs configurados globalmente pelo usuário, para o compilador
   * desligá-los na sessão. Ausente quando o agente já isola por outro meio.
   */
  globalMcp?: { args: string[]; parse: (stdout: string) => string[] }
}

export const AGENTS: Record<AgentId, AgentDefinition> = {
  claude: {
    id: 'claude',
    name: AGENT_META.claude.name,
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
  codex: {
    id: 'codex',
    name: AGENT_META.codex.name,
    cli: 'codex',
    versionArgs: ['--version'],
    statusArgs: ['login', 'status'],
    loginArgs: ['login'],
    installHint: 'npm install -g @openai/codex',
    installUrl: 'https://developers.openai.com/codex/cli',
    acp: {
      kind: 'adapter',
      module: '@agentclientprotocol/codex-acp/dist/index.js',
      env: (cliPath) => ({ CODEX_PATH: cliPath }),
    },
    globalMcp: { args: ['mcp', 'list', '--json'], parse: parseCodexMcpList },
  },
  gemini: {
    id: 'gemini',
    name: AGENT_META.gemini.name,
    cli: 'gemini',
    versionArgs: ['--version'],
    // O Gemini CLI não tem comando de status; o login é detectado ao abrir a sessão.
    statusArgs: null,
    // Sem argumentos o CLI abre o fluxo interativo de login na primeira execução.
    loginArgs: [],
    installHint: 'npm install -g @google/gemini-cli',
    installUrl: 'https://github.com/google-gemini/gemini-cli',
    acp: { kind: 'native', args: ['--acp'] },
  },
}

export function getAgent(id: AgentId): AgentDefinition {
  const agent = AGENTS[id]
  if (!agent) throw new Error(`Agente desconhecido: ${id}`)
  return agent
}

/** `codex mcp list --json` → nomes dos servidores habilitados. */
export function parseCodexMcpList(stdout: string): string[] {
  try {
    const list = JSON.parse(stdout) as { name?: unknown; enabled?: unknown }[]
    return list
      .filter((s) => typeof s.name === 'string' && s.enabled !== false)
      .map((s) => s.name as string)
  } catch {
    return []
  }
}
