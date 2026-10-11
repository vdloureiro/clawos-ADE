import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
import { AGENTS, getAgent, installCommand, installProcess } from './registry'

const require = createRequire(import.meta.url)

describe('registry', () => {
  it('cada agente tem id coerente com a chave e comandos definidos', () => {
    for (const [key, agent] of Object.entries(AGENTS)) {
      expect(agent.id).toBe(key)
      expect(agent.cli).not.toBe('')
      expect(Array.isArray(agent.loginArgs)).toBe(true)
      expect(agent.install.posix).not.toBe('')
      expect(agent.install.windows).not.toBe('')
    }
  })

  it('instaladores oficiais sem depender de npm (Claude e Codex)', () => {
    expect(installCommand(getAgent('claude'), 'darwin')).toBe(
      'curl -fsSL https://claude.ai/install.sh | bash',
    )
    expect(installCommand(getAgent('codex'), 'darwin')).not.toContain('npm')
    expect(installProcess(getAgent('codex'), 'darwin')).toEqual({
      file: '/bin/bash',
      args: ['-c', 'curl -fsSL https://chatgpt.com/codex/install.sh | sh'],
      env: { CODEX_NON_INTERACTIVE: '1' },
    })
    expect(installProcess(getAgent('claude'), 'win32').file).toBe('powershell.exe')
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
        name: 'remote_tools',
        enabled: true,
        transport: { type: 'streamable_http', url: 'https://m/mcp', http_headers: { A: 'b' } },
      },
      { name: 'codex_app', enabled: false, transport: { type: 'stdio', command: 'y' } },
    ])
    expect(parseCodexMcpList(out)).toEqual([
      { name: 'node_repl', disable: { command: '/x/node', args: ['s.js'], enabled: false } },
      { name: 'remote_tools', disable: { url: 'https://m/mcp', enabled: false } },
    ])
    expect(parseCodexMcpList('erro')).toEqual([])
  })
})
