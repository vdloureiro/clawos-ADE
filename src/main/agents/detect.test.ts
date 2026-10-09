import { describe, expect, it } from 'vitest'
import { describeClaudeAuth, parseVersion } from './detect'

describe('parseVersion', () => {
  it('extrai a versão semântica da saída do CLI', () => {
    expect(parseVersion('2.1.87 (Claude Code)')).toBe('2.1.87')
    expect(parseVersion('codex-cli 0.162.0\n')).toBe('0.162.0')
    expect(parseVersion('sem versão')).toBeNull()
  })
})

describe('describeClaudeAuth', () => {
  it('descreve o método e o e-mail quando logado', () => {
    const out = JSON.stringify({ loggedIn: true, authMethod: 'claude.ai', email: 'a@b.c' })
    expect(describeClaudeAuth(out)).toBe('claude.ai · a@b.c')
  })

  it('retorna null quando não logado ou saída inválida', () => {
    expect(describeClaudeAuth(JSON.stringify({ authMethod: 'none' }))).toBeNull()
    expect(describeClaudeAuth('Not logged in')).toBeNull()
  })
})
