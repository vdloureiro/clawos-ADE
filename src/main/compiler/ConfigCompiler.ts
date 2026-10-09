import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import type { McpServer } from '@agentclientprotocol/sdk'
import {
  isRemoteMcp,
  MissingSecretsError,
  resolveSecrets,
  type McpServerConfig,
  type ProjectConfig,
} from '@shared/project'
import type { AgentId } from '@shared/types'
import type { GlobalMcp } from '../agents/registry'

/**
 * Traduz `project.yaml` para o que cada agente entende, no momento de abrir uma sessão.
 *
 * Função pura: E/S (ler instruções, achar segredos, listar MCPs globais) entra por
 * `CompileContext`; arquivos a gerar saem em `files`/`links` e quem chama os escreve
 * (sempre fora do repositório do projeto).
 */
export interface CompileContext {
  agentId: AgentId
  projectPath: string
  config: ProjectConfig
  /** Valor de um segredo do projeto, ou null se não existir. */
  secret: (name: string) => string | null
  /** Lê um arquivo de texto (instruções). Retorna null se não existir. */
  readText: (path: string) => string | null
  /** Diretório fora do repositório onde o Clawos gera arquivos desta sessão. */
  generatedDir: string
  /** MCPs configurados globalmente pelo usuário neste agente (para desligar). */
  globalMcp: GlobalMcp[]
}

export interface GeneratedLink {
  path: string
  target: string
  /** Arquivo que precisa existir dentro de `target` (ex.: SKILL.md). */
  requires?: string
}

export interface CompiledSession {
  /** MCPs no formato ACP, para `session/new` / `session/resume`. */
  mcpServers: McpServer[]
  /** `_meta` para `session/new` (opções específicas do agente). */
  meta: Record<string, unknown>
  /** Diretórios extras da sessão (`additionalDirectories` do ACP). */
  additionalDirectories: string[]
  /** Argumentos do processo (agentes nativos). Substitui os do registry quando presente. */
  args: string[] | null
  /** Variáveis de ambiente extras do processo do agente. */
  env: Record<string, string>
  files: { path: string; content: string }[]
  links: GeneratedLink[]
  /** Avisos mostrados no chat ao abrir a sessão. */
  warnings: string[]
}

type AgentCompiler = (ctx: CompileContext) => CompiledSession

const COMPILERS: Partial<Record<AgentId, AgentCompiler>> = {
  claude: compileClaude,
  codex: compileCodex,
  gemini: compileGemini,
}

export function compile(ctx: CompileContext): CompiledSession {
  return (COMPILERS[ctx.agentId] ?? compileGeneric)(ctx)
}

function empty(): CompiledSession {
  return {
    mcpServers: [],
    meta: {},
    additionalDirectories: [],
    args: null,
    env: {},
    files: [],
    links: [],
    warnings: [],
  }
}

/** Padrão para agentes ACP sem compilador próprio: só os MCPs via `session/new`. */
function compileGeneric(ctx: CompileContext): CompiledSession {
  return { ...empty(), mcpServers: compileMcpServers(ctx) }
}

// ---------------------------------------------------------------------------
// Claude

function compileClaude(ctx: CompileContext): CompiledSession {
  const result = { ...empty(), mcpServers: compileMcpServers(ctx) }
  const settings = ctx.config.agents?.['claude'] ?? {}
  const skills = resolveSkills(ctx)

  const options: Record<string, unknown> = {
    // Só os MCPs do projeto: ignora ~/.claude.json, .mcp.json e plugins do usuário.
    strictMcpConfig: true,
    // CLAUDE.md e .claude/ do projeto continuam valendo; a config global só se pedida.
    settingSources: settings.inheritUserConfig
      ? ['user', 'project', 'local']
      : ['project', 'local'],
  }

  if (skills.length > 0) {
    // Skills viram um plugin local gerado fora do repositório, com links para as pastas.
    const dir = join(ctx.generatedDir, 'claude-plugin')
    result.files.push({
      path: join(dir, '.claude-plugin', 'plugin.json'),
      content: JSON.stringify(
        {
          name: 'clawos-project',
          version: '0.0.0',
          description: 'Skills do projeto, geradas pelo Clawos',
        },
        null,
        2,
      ),
    })
    for (const skill of skills) {
      result.links.push({
        path: join(dir, 'skills', skill.name),
        target: skill.source,
        requires: 'SKILL.md',
      })
    }
    // Sem `skipMcpDiscovery`: CLIs antigos não conhecem a flag correspondente, e o plugin
    // gerado não declara MCPs (o strictMcpConfig já ignora MCPs de plugins).
    options['plugins'] = [{ type: 'local', path: dir }]
  }

  result.meta = { claudeCode: { options } }

  // CLAUDE.md na raiz já é lido nativamente; outro arquivo de instruções vira append.
  const instructions = customInstructions(ctx, 'CLAUDE.md')
  if (instructions) result.meta['systemPrompt'] = { append: instructions.text }

  return result
}

// ---------------------------------------------------------------------------
// Codex

/**
 * O Codex mescla MCPs da sessão com os de `~/.codex/config.toml` e guarda a autenticação
 * em `CODEX_HOME` — trocar o CODEX_HOME deslogaria o usuário. Em vez disso, toda a
 * configuração vai por `CODEX_CONFIG` (override por sessão do adaptador): MCPs do projeto
 * e `enabled = false` para cada MCP global. Os MCPs ACP ficam vazios de propósito, pois
 * o adaptador sobrescreveria `mcp_servers` inteiro com eles. Os conectores da conta
 * ChatGPT (feature `apps`) também são desligados.
 */
function compileCodex(ctx: CompileContext): CompiledSession {
  const result = empty()
  const servers = resolvedMcpServers(ctx)

  const mcp: Record<string, unknown> = {}
  for (const global of ctx.globalMcp) mcp[global.name] = global.disable
  for (const [name, server] of servers) {
    if (server.type === 'sse')
      throw new Error(`O Codex não suporta MCP via SSE ("${name}"). Use http ou stdio.`)
    mcp[name] = isRemoteMcp(server)
      ? { url: server.url, http_headers: server.headers ?? {} }
      : { command: server.command, args: server.args ?? [], env: server.env ?? {} }
  }

  // `apps` injeta os conectores da conta ChatGPT como um MCP extra (codex_apps).
  const config: Record<string, unknown> = { features: { apps: false }, mcp_servers: mcp }

  // AGENTS.md é nativo; outro arquivo de instruções vira developer_instructions.
  const instructions = customInstructions(ctx, 'AGENTS.md')
  if (instructions) config['developer_instructions'] = instructions.text

  // Skills fora de .agents/skills do projeto: o adaptador lê <dir extra>/.agents/skills.
  const extra = resolveSkills(ctx).filter(
    (s) => !isNativeSkill(ctx.projectPath, s.source, ['.agents/skills']),
  )
  if (extra.length > 0) {
    const root = join(ctx.generatedDir, 'codex')
    for (const skill of extra) {
      result.links.push({
        path: join(root, '.agents', 'skills', skill.name),
        target: skill.source,
        requires: 'SKILL.md',
      })
    }
    result.additionalDirectories.push(root)
  }

  result.env = { CODEX_CONFIG: JSON.stringify(config) }
  return result
}

// ---------------------------------------------------------------------------
// Gemini

/** Nome que não casa com nenhum servidor: lista de permitidos vazia significa "todos". */
export const GEMINI_NO_MCP = '__clawos_sem_mcp__'

/**
 * O Gemini mescla os MCPs da sessão com os do `settings.json` do usuário; a lista de
 * permitidos (`--allowed-mcp-server-names`) restringe aos do projeto. Skills só são lidas
 * de `.agents/skills` ou `.gemini/skills` dentro do projeto (ou da pasta do usuário).
 */
function compileGemini(ctx: CompileContext): CompiledSession {
  const result = { ...empty(), mcpServers: compileMcpServers(ctx) }
  const names = result.mcpServers.map((s) => s.name)
  result.args = [
    '--acp',
    '--allowed-mcp-server-names',
    names.length > 0 ? names.join(',') : GEMINI_NO_MCP,
  ]

  const outside = resolveSkills(ctx).filter(
    (s) => !isNativeSkill(ctx.projectPath, s.source, ['.agents/skills', '.gemini/skills']),
  )
  if (outside.length > 0) {
    result.warnings.push(
      `O Gemini só lê skills de .agents/skills ou .gemini/skills dentro do projeto. Não carregadas: ${outside
        .map((s) => s.name)
        .join(', ')}.`,
    )
  }

  // GEMINI.md é nativo; outro arquivo dentro do projeto entra como arquivo de contexto.
  const path = instructionsPath(ctx)
  if (path && basename(path) !== 'GEMINI.md') {
    if (isInside(ctx.projectPath, path)) {
      const settings = join(ctx.generatedDir, 'gemini-settings.json')
      result.files.push({
        path: settings,
        content: JSON.stringify({ context: { fileName: ['GEMINI.md', basename(path)] } }, null, 2),
      })
      result.env['GEMINI_CLI_SYSTEM_SETTINGS_PATH'] = settings
    } else {
      result.warnings.push(`O Gemini só lê instruções de dentro do projeto. Ignorado: ${path}`)
    }
  }
  return result
}

// ---------------------------------------------------------------------------
// MCPs

/** Servidores do projeto com segredos resolvidos (formato do project.yaml). */
function resolvedMcpServers(ctx: CompileContext): [string, McpServerConfig][] {
  const missing = new Set<string>()
  const lookup = (name: string): string | null => {
    const value = ctx.secret(name)
    if (value === null) missing.add(name)
    return value ?? ''
  }
  const sub = (value: string) => resolveSecrets(value, lookup)
  const subRecord = (record: Record<string, string> | undefined) =>
    record ? Object.fromEntries(Object.entries(record).map(([k, v]) => [k, sub(v)])) : undefined

  const servers = Object.entries(ctx.config.mcpServers ?? {}).map(
    ([name, server]): [string, McpServerConfig] => {
      if (isRemoteMcp(server)) {
        return [
          name,
          { type: server.type, url: sub(server.url), headers: subRecord(server.headers) },
        ]
      }
      return [
        name,
        {
          command: sub(server.command),
          args: (server.args ?? []).map(sub),
          env: subRecord(server.env),
        },
      ]
    },
  )
  if (missing.size > 0) throw new MissingSecretsError([...missing])
  return servers
}

/** MCPs do projeto no formato ACP. */
export function compileMcpServers(ctx: CompileContext): McpServer[] {
  return resolvedMcpServers(ctx).map(([name, server]): McpServer => {
    const pairs = (record: Record<string, string> | undefined) =>
      Object.entries(record ?? {}).map(([key, value]) => ({ name: key, value }))
    if (isRemoteMcp(server)) {
      return { type: server.type, name, url: server.url, headers: pairs(server.headers) }
    }
    return { name, command: server.command, args: server.args ?? [], env: pairs(server.env) }
  })
}

// ---------------------------------------------------------------------------
// Instruções e skills

function instructionsPath(ctx: CompileContext): string | null {
  const value = ctx.config.instructions
  if (!value) return null
  return isAbsolute(value) ? value : resolve(ctx.projectPath, value)
}

/** Conteúdo das instruções quando não é o arquivo que o agente já lê na raiz. */
function customInstructions(
  ctx: CompileContext,
  nativeFile: string,
): { path: string; text: string } | null {
  const path = instructionsPath(ctx)
  if (!path || path === join(ctx.projectPath, nativeFile)) return null
  const text = ctx.readText(path)
  if (text === null) throw new Error(`Arquivo de instruções não encontrado: ${path}`)
  return { path, text }
}

interface SkillLink {
  name: string
  source: string
}

function resolveSkills(ctx: CompileContext): SkillLink[] {
  const seen = new Set<string>()
  return (ctx.config.skills ?? []).map((entry) => {
    const source = isAbsolute(entry) ? entry : resolve(ctx.projectPath, entry)
    let name = basename(source) || 'skill'
    while (seen.has(name)) name += '-1'
    seen.add(name)
    return { name, source }
  })
}

/** A skill já está numa pasta que o agente lê nativamente dentro do projeto? */
function isNativeSkill(projectPath: string, source: string, dirs: string[]): boolean {
  return dirs.some((dir) => dirname(source) === join(projectPath, dir))
}

function isInside(root: string, path: string): boolean {
  const rel = relative(root, path)
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel) && !rel.startsWith(sep)
}
