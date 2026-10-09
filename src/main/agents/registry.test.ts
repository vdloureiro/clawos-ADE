import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
import { AGENTS, getAgent } from './registry'

const require = createRequire(import.meta.url)

describe('registry', () => {
  it('cada agente tem id coerente com a chave e comandos definidos', () => {
    for (const [key, agent] of Object.entries(AGENTS)) {
      expect(agent.id).toBe(key)
      expect(agent.cli).not.toBe('')
      expect(Array.isArray(agent.loginArgs)).toBe(true)
      expect(agent.installHint).not.toBe('')
    }
  })

  it('o módulo de cada adaptador embutido existe em node_modules', () => {
    for (const agent of Object.values(AGENTS)) {
      if (agent.acp.kind !== 'adapter') continue
      expect(existsSync(require.resolve(agent.acp.module))).toBe(true)
    }
  })

  it('o adaptador do Claude aponta para o CLI do usuário', () => {
    const claude = getAgent('claude')
    expect(claude.acp.kind).toBe('adapter')
    if (claude.acp.kind === 'adapter') {
      expect(claude.acp.env('/x/claude')).toEqual({ CLAUDE_CODE_EXECUTABLE: '/x/claude' })
    }
  })
})

describe('parseCodexMcpList', () => {
  it('gera entradas de desligamento com transporte, sem env', async () => {
    const { parseCodexMcpList } = await import('./registry')
    const out = JSON.stringify([
      {
        name: 'node_repl',
        enabled: true,
        transport: { type: 'stdio', command: '/x/node', args: ['s.js'], env: { TOKEN: 'segredo' } },
      },
      {
        name: 'meta_ads',
        enabled: true,
        transport: { type: 'streamable_http', url: 'https://m/mcp', http_headers: { A: 'b' } },
      },
      { name: 'codex_app', enabled: false, transport: { type: 'stdio', command: 'y' } },
    ])
    expect(parseCodexMcpList(out)).toEqual([
      { name: 'node_repl', disable: { command: '/x/node', args: ['s.js'], enabled: false } },
      { name: 'meta_ads', disable: { url: 'https://m/mcp', enabled: false } },
    ])
    expect(parseCodexMcpList('erro')).toEqual([])
  })
})
