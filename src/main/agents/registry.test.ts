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
      expect(agent.loginArgs.length).toBeGreaterThan(0)
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
