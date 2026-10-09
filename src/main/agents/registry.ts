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
  /** Como resolver quando o agente exige autenticação (erro ACP `auth_required`). */
  authHelp: string
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
  globalMcp?: { args: string[]; parse: (stdout: string) => GlobalMcp[] }
}

/** MCP global do usuário e a entrada de config que o desliga na sessão. */
export interface GlobalMcp {
  name: string
  /** Entrada válida (com transporte) e `enabled: false`; sem env/headers, que podem ter segredos. */
  disable: Record<string, unknown>
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
    authHelp: 'Entre no Claude pelo botão Entrar em Configurações (roda `claude auth login`).',
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
    authHelp: 'Entre no Codex pelo botão Entrar em Configurações (roda `codex login`).',
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
    // O login com conta Google pessoal foi descontinuado no Gemini CLI (out/2026).
    authHelp:
      'O Gemini CLI precisa de uma API key: crie uma em https://aistudio.google.com/apikey e defina GEMINI_API_KEY no seu ambiente (ou em ~/.gemini/.env). O Clawos não guarda essa chave.',
    acp: { kind: 'native', args: ['--acp'] },
  },
}

export function getAgent(id: AgentId): AgentDefinition {
  const agent = AGENTS[id]
  if (!agent) throw new Error(`Agente desconhecido: ${id}`)
  return agent
}

/**
 * `codex mcp list --json` → servidores habilitados (de config.toml e de plugins). O override
 * precisa de um transporte válido, senão o Codex rejeita a config ("invalid transport").
 */
export function parseCodexMcpList(stdout: string): GlobalMcp[] {
  interface Entry {
    name?: unknown
    enabled?: unknown
    transport?: { type?: string; command?: string; args?: string[]; url?: string }
  }
  let list: Entry[]
  try {
    list = JSON.parse(stdout) as Entry[]
  } catch {
    return []
  }
  const result: GlobalMcp[] = []
  for (const entry of list) {
    if (typeof entry.name !== 'string' || entry.enabled === false) continue
    const t = entry.transport ?? {}
    if (t.url) result.push({ name: entry.name, disable: { url: t.url, enabled: false } })
    else if (t.command)
      result.push({
        name: entry.name,
        disable: { command: t.command, args: t.args ?? [], enabled: false },
      })
  }
  return result
}
