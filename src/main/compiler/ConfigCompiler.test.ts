import { describe, expect, it } from 'vitest'
import { MissingSecretsError, type ProjectConfig } from '@shared/project'
import { compile, type CompileContext } from './ConfigCompiler'

function ctx(config: ProjectConfig, extra: Partial<CompileContext> = {}): CompileContext {
  return {
    agentId: 'claude',
    projectPath: '/p/dralab',
    config,
    secret: (name) => ({ supabase_token: 'tok-123' })[name] ?? null,
    readText: () => null,
    generatedDir: '/data/compiled/proj1',
    ...extra,
  }
}

describe('ConfigCompiler (Claude)', () => {
  it('sem configuração: nenhum MCP e modo estrito sem config global', () => {
    const result = compile(ctx({}))
    expect(result.mcpServers).toEqual([])
    expect(result.plugin).toBeNull()
    expect(result.meta).toEqual({
      claudeCode: { options: { strictMcpConfig: true, settingSources: ['project', 'local'] } },
    })
  })

  it('compila MCP stdio resolvendo segredos em env e args', () => {
    const result = compile(
      ctx({
        mcpServers: {
          supabase: {
            command: 'npx',
            args: ['-y', '@supabase/mcp-server-supabase', '--token=${secret:supabase_token}'],
            env: { SUPABASE_ACCESS_TOKEN: '${secret:supabase_token}' },
          },
        },
      }),
    )
    expect(result.mcpServers).toEqual([
      {
        name: 'supabase',
        command: 'npx',
        args: ['-y', '@supabase/mcp-server-supabase', '--token=tok-123'],
        env: [{ name: 'SUPABASE_ACCESS_TOKEN', value: 'tok-123' }],
      },
    ])
  })

  it('compila MCP http com headers', () => {
    const result = compile(
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
    expect(result.mcpServers).toEqual([
      {
        type: 'http',
        name: 'api',
        url: 'https://x/mcp',
        headers: [{ name: 'Authorization', value: 'Bearer tok-123' }],
      },
    ])
  })

  it('falha listando todos os segredos ausentes', () => {
    const run = () =>
      compile(
        ctx({
          mcpServers: {
            a: { command: 'x', env: { A: '${secret:um}' } },
            b: { command: 'y', args: ['${secret:dois}'] },
          },
        }),
      )
    expect(run).toThrow(MissingSecretsError)
    expect(run).toThrow(/um, dois/)
  })

  it('inheritUserConfig liga a configuração global do usuário', () => {
    const result = compile(ctx({ agents: { claude: { inheritUserConfig: true } } }))
    expect(result.meta).toMatchObject({
      claudeCode: { options: { settingSources: ['user', 'project', 'local'] } },
    })
  })

  it('skills viram um plugin local gerado fora do repositório', () => {
    const result = compile(ctx({ skills: ['./.clawos/skills/revisao-pr', '/abs/outra'] }))
    expect(result.plugin).toEqual({
      dir: '/data/compiled/proj1/claude-plugin',
      name: 'clawos-project',
      skills: [
        { name: 'revisao-pr', source: '/p/dralab/.clawos/skills/revisao-pr' },
        { name: 'outra', source: '/abs/outra' },
      ],
    })
    expect(result.meta).toMatchObject({
      claudeCode: {
        options: {
          plugins: [{ type: 'local', path: '/data/compiled/proj1/claude-plugin' }],
        },
      },
    })
  })

  it('CLAUDE.md na raiz é nativo; outro arquivo de instruções vira append no system prompt', () => {
    expect(compile(ctx({ instructions: './CLAUDE.md' })).meta).not.toHaveProperty('systemPrompt')

    const result = compile(
      ctx(
        { instructions: './docs/AGENTS.md' },
        { readText: (p) => (p === '/p/dralab/docs/AGENTS.md' ? 'regras' : null) },
      ),
    )
    expect(result.meta).toMatchObject({ systemPrompt: { append: 'regras' } })
    expect(() => compile(ctx({ instructions: './nao-existe.md' }))).toThrow(/não encontrado/)
  })
})
