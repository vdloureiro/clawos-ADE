import { describe, expect, it } from 'vitest'
import { MissingSecretsError, type ProjectConfig } from '@shared/project'
import type { AgentId } from '@shared/types'
import { compile, GEMINI_NO_MCP, type CompileContext } from './ConfigCompiler'

function ctx(config: ProjectConfig, extra: Partial<CompileContext> = {}): CompileContext {
  return {
    agentId: 'claude',
    projectPath: '/p/dralab',
    config,
    secret: (name) => ({ supabase_token: 'tok-123' })[name] ?? null,
    readText: () => null,
    generatedDir: '/data/gen/s1',
    globalMcpNames: [],
    ...extra,
  }
}

const supabase: ProjectConfig['mcpServers'] = {
  supabase: {
    command: 'npx',
    args: ['-y', '@supabase/mcp-server-supabase', '--token=${secret:supabase_token}'],
    env: { SUPABASE_ACCESS_TOKEN: '${secret:supabase_token}' },
  },
}

describe('ConfigCompiler — comum', () => {
  it('falha listando todos os segredos ausentes, para qualquer agente', () => {
    const config: ProjectConfig = {
      mcpServers: {
        a: { command: 'x', env: { A: '${secret:um}' } },
        b: { command: 'y', args: ['${secret:dois}'] },
      },
    }
    for (const agentId of ['claude', 'codex', 'gemini'] as AgentId[]) {
      const run = () => compile(ctx(config, { agentId }))
      expect(run).toThrow(MissingSecretsError)
      expect(run).toThrow(/um, dois/)
    }
  })

  it('arquivo de instruções inexistente é erro claro', () => {
    for (const agentId of ['claude', 'codex'] as AgentId[]) {
      expect(() => compile(ctx({ instructions: './nao-existe.md' }, { agentId }))).toThrow(
        /não encontrado/,
      )
    }
  })
})

describe('ConfigCompiler — Claude', () => {
  it('sem configuração: nenhum MCP e modo estrito sem config global', () => {
    const result = compile(ctx({}))
    expect(result.mcpServers).toEqual([])
    expect(result.links).toEqual([])
    expect(result.meta).toEqual({
      claudeCode: { options: { strictMcpConfig: true, settingSources: ['project', 'local'] } },
    })
  })

  it('compila MCPs no formato ACP resolvendo segredos', () => {
    expect(compile(ctx({ mcpServers: supabase })).mcpServers).toEqual([
      {
        name: 'supabase',
        command: 'npx',
        args: ['-y', '@supabase/mcp-server-supabase', '--token=tok-123'],
        env: [{ name: 'SUPABASE_ACCESS_TOKEN', value: 'tok-123' }],
      },
    ])
    const http = compile(
      ctx({
        mcpServers: {
          api: {
            type: 'http',
            url: 'https://x/mcp',
            headers: { Authorization: 'Bearer ${secret:supabase_token}' },
          },
        },
      }),
    )
    expect(http.mcpServers).toEqual([
      {
        type: 'http',
        name: 'api',
        url: 'https://x/mcp',
        headers: [{ name: 'Authorization', value: 'Bearer tok-123' }],
      },
    ])
  })

  it('inheritUserConfig liga a configuração global do usuário', () => {
    expect(compile(ctx({ agents: { claude: { inheritUserConfig: true } } })).meta).toMatchObject({
      claudeCode: { options: { settingSources: ['user', 'project', 'local'] } },
    })
  })

  it('skills viram um plugin local gerado fora do repositório', () => {
    const result = compile(ctx({ skills: ['./.clawos/skills/revisao-pr', '/abs/outra'] }))
    expect(result.files.map((f) => f.path)).toEqual([
      '/data/gen/s1/claude-plugin/.claude-plugin/plugin.json',
    ])
    expect(result.links).toEqual([
      {
        path: '/data/gen/s1/claude-plugin/skills/revisao-pr',
        target: '/p/dralab/.clawos/skills/revisao-pr',
        requires: 'SKILL.md',
      },
      {
        path: '/data/gen/s1/claude-plugin/skills/outra',
        target: '/abs/outra',
        requires: 'SKILL.md',
      },
    ])
    expect(result.meta).toMatchObject({
      claudeCode: { options: { plugins: [{ type: 'local', path: '/data/gen/s1/claude-plugin' }] } },
    })
  })

  it('CLAUDE.md na raiz é nativo; outro arquivo vira append no system prompt', () => {
    expect(compile(ctx({ instructions: './CLAUDE.md' })).meta).not.toHaveProperty('systemPrompt')
    const result = compile(
      ctx(
        { instructions: './docs/AGENTS.md' },
        { readText: (p) => (p === '/p/dralab/docs/AGENTS.md' ? 'regras' : null) },
      ),
    )
    expect(result.meta).toMatchObject({ systemPrompt: { append: 'regras' } })
  })
})

describe('ConfigCompiler — Codex', () => {
  function codexConfig(result: ReturnType<typeof compile>) {
    return JSON.parse(result.env['CODEX_CONFIG']!) as Record<string, unknown>
  }

  it('MCPs do projeto via CODEX_CONFIG e MCPs globais desligados (sem tocar no CODEX_HOME)', () => {
    const result = compile(
      ctx(
        { mcpServers: { ...supabase, api: { type: 'http', url: 'https://x/mcp' } } },
        { agentId: 'codex', globalMcpNames: ['meta_ads', 'node_repl'] },
      ),
    )
    expect(result.mcpServers).toEqual([])
    expect(result.env).not.toHaveProperty('CODEX_HOME')
    expect(codexConfig(result)).toEqual({
      mcp_servers: {
        meta_ads: { enabled: false },
        node_repl: { enabled: false },
        supabase: {
          command: 'npx',
          args: ['-y', '@supabase/mcp-server-supabase', '--token=tok-123'],
          env: { SUPABASE_ACCESS_TOKEN: 'tok-123' },
        },
        api: { url: 'https://x/mcp', http_headers: {} },
      },
    })
  })

  it('MCP do projeto com o mesmo nome de um global prevalece', () => {
    const result = compile(
      ctx({ mcpServers: supabase }, { agentId: 'codex', globalMcpNames: ['supabase'] }),
    )
    expect(
      (codexConfig(result)['mcp_servers'] as Record<string, unknown>)['supabase'],
    ).toMatchObject({ command: 'npx' })
  })

  it('recusa SSE com mensagem clara', () => {
    expect(() =>
      compile(
        ctx({ mcpServers: { s: { type: 'sse', url: 'https://x/sse' } } }, { agentId: 'codex' }),
      ),
    ).toThrow(/SSE/)
  })

  it('instruções extras viram developer_instructions; AGENTS.md é nativo', () => {
    expect(
      codexConfig(compile(ctx({ instructions: './AGENTS.md' }, { agentId: 'codex' }))),
    ).not.toHaveProperty('developer_instructions')
    const result = compile(
      ctx({ instructions: './CLAUDE.md' }, { agentId: 'codex', readText: () => 'regras' }),
    )
    expect(codexConfig(result)['developer_instructions']).toBe('regras')
  })

  it('skills fora de .agents/skills entram por um diretório extra gerado', () => {
    const result = compile(
      ctx({ skills: ['./.agents/skills/nativa', './.clawos/skills/extra'] }, { agentId: 'codex' }),
    )
    expect(result.links).toEqual([
      {
        path: '/data/gen/s1/codex/.agents/skills/extra',
        target: '/p/dralab/.clawos/skills/extra',
        requires: 'SKILL.md',
      },
    ])
    expect(result.additionalDirectories).toEqual(['/data/gen/s1/codex'])
  })
})

describe('ConfigCompiler — Gemini', () => {
  it('MCPs via ACP e lista de permitidos só com os do projeto', () => {
    const result = compile(ctx({ mcpServers: supabase }, { agentId: 'gemini' }))
    expect(result.mcpServers.map((s) => s.name)).toEqual(['supabase'])
    expect(result.args).toEqual(['--acp', '--allowed-mcp-server-names', 'supabase'])
  })

  it('sem MCPs no projeto, bloqueia todos os globais com um nome sentinela', () => {
    expect(compile(ctx({}, { agentId: 'gemini' })).args).toEqual([
      '--acp',
      '--allowed-mcp-server-names',
      GEMINI_NO_MCP,
    ])
  })

  it('avisa sobre skills fora das pastas que o Gemini lê', () => {
    const result = compile(
      ctx(
        { skills: ['./.agents/skills/ok', './.gemini/skills/ok2', './.clawos/skills/fora'] },
        { agentId: 'gemini' },
      ),
    )
    expect(result.links).toEqual([])
    expect(result.warnings).toEqual([expect.stringContaining('fora')])
  })

  it('instruções em outro arquivo do projeto entram como arquivo de contexto', () => {
    const result = compile(ctx({ instructions: './CLAUDE.md' }, { agentId: 'gemini' }))
    expect(result.env).toEqual({
      GEMINI_CLI_SYSTEM_SETTINGS_PATH: '/data/gen/s1/gemini-settings.json',
    })
    expect(JSON.parse(result.files[0]!.content)).toEqual({
      context: { fileName: ['GEMINI.md', 'CLAUDE.md'] },
    })
    expect(compile(ctx({ instructions: './GEMINI.md' }, { agentId: 'gemini' })).env).toEqual({})
  })
})
