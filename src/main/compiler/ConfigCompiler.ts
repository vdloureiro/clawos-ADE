import { isAbsolute, join, resolve } from 'node:path'
import type { McpServer } from '@agentclientprotocol/sdk'
import {
  isRemoteMcp,
  MissingSecretsError,
  resolveSecrets,
  type McpServerConfig,
  type ProjectConfig,
} from '@shared/project'
import type { AgentId } from '@shared/types'

/**
 * Traduz `project.yaml` para o que cada agente entende, no momento de abrir uma sessão.
 *
 * Função pura: E/S (ler instruções, achar segredos) entra por `CompileContext`, e a
 * escrita de arquivos gerados (plugin de skills) fica a cargo de quem chama.
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
}

/** Skill a ser exposta ao agente: nome e pasta de origem (com SKILL.md). */
export interface SkillLink {
  name: string
  source: string
}

export interface CompiledSession {
  /** MCPs no formato ACP, para `session/new` / `session/resume`. */
  mcpServers: McpServer[]
  /** `_meta` para `session/new` (opções específicas do agente). */
  meta: Record<string, unknown>
  /** Plugin a gerar em disco antes de iniciar a sessão (Claude). */
  plugin: { dir: string; name: string; skills: SkillLink[] } | null
}

export function compile(ctx: CompileContext): CompiledSession {
  switch (ctx.agentId) {
    case 'claude':
      return compileClaude(ctx)
  }
}

// ---------------------------------------------------------------------------

function compileClaude(ctx: CompileContext): CompiledSession {
  const mcpServers = compileMcpServers(ctx)
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

  let plugin: CompiledSession['plugin'] = null
  if (skills.length > 0) {
    const dir = join(ctx.generatedDir, 'claude-plugin')
    plugin = { dir, name: 'clawos-project', skills }
    // Sem `skipMcpDiscovery`: CLIs antigos não conhecem a flag correspondente, e o plugin
    // gerado não declara MCPs (o strictMcpConfig já ignora MCPs de plugins).
    options['plugins'] = [{ type: 'local', path: dir }]
  }

  const meta: Record<string, unknown> = { claudeCode: { options } }

  // CLAUDE.md na raiz já é lido nativamente; outro arquivo de instruções vira append.
  const instructions = instructionsPath(ctx)
  if (instructions && instructions !== join(ctx.projectPath, 'CLAUDE.md')) {
    const text = ctx.readText(instructions)
    if (text === null) throw new Error(`Arquivo de instruções não encontrado: ${instructions}`)
    meta['systemPrompt'] = { append: text }
  }

  return { mcpServers, meta, plugin }
}

// ---------------------------------------------------------------------------

export function compileMcpServers(ctx: CompileContext): McpServer[] {
  const entries = Object.entries(ctx.config.mcpServers ?? {})
  const missing = new Set<string>()
  const lookup = (name: string): string | null => {
    const value = ctx.secret(name)
    if (value === null) missing.add(name)
    return value ?? ''
  }
  const servers = entries.map(([name, server]) => compileMcpServer(name, server, lookup))
  if (missing.size > 0) throw new MissingSecretsError([...missing])
  return servers
}

function compileMcpServer(
  name: string,
  server: McpServerConfig,
  lookup: (name: string) => string | null,
): McpServer {
  const sub = (value: string) => resolveSecrets(value, lookup)
  const pairs = (record: Record<string, string> | undefined) =>
    Object.entries(record ?? {}).map(([key, value]) => ({ name: key, value: sub(value) }))

  if (isRemoteMcp(server)) {
    return { type: server.type, name, url: sub(server.url), headers: pairs(server.headers) }
  }
  return {
    name,
    command: sub(server.command),
    args: (server.args ?? []).map(sub),
    env: pairs(server.env),
  }
}

function instructionsPath(ctx: CompileContext): string | null {
  const value = ctx.config.instructions
  if (!value) return null
  return isAbsolute(value) ? value : resolve(ctx.projectPath, value)
}

function resolveSkills(ctx: CompileContext): SkillLink[] {
  const seen = new Set<string>()
  return (ctx.config.skills ?? []).map((entry) => {
    const source = isAbsolute(entry) ? entry : resolve(ctx.projectPath, entry)
    let name = source.split(/[\\/]/).filter(Boolean).pop() ?? 'skill'
    while (seen.has(name)) name += '-1'
    seen.add(name)
    return { name, source }
  })
}
