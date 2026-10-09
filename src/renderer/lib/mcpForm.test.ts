import { describe, expect, it } from 'vitest'
import { fromForm, toForm } from './mcpForm'

describe('mcpForm', () => {
  it('ida e volta de um MCP stdio', () => {
    const server = {
      command: 'npx',
      args: ['-y', '@supabase/mcp-server-supabase'],
      env: { SUPABASE_ACCESS_TOKEN: '${secret:supabase_token}' },
    }
    const form = toForm('supabase', server)
    expect(form.env).toBe('SUPABASE_ACCESS_TOKEN=${secret:supabase_token}')
    expect(fromForm(form)).toEqual(['supabase', server])
  })

  it('ida e volta de um MCP http com headers', () => {
    const server = {
      type: 'http' as const,
      url: 'https://x/mcp',
      headers: { Authorization: 'Bearer ${secret:t}' },
    }
    expect(fromForm(toForm('api', server))).toEqual(['api', server])
  })

  it('valida nome, comando e linhas mal formatadas', () => {
    const base = toForm('ok', { command: 'x' })
    expect(() => fromForm({ ...base, name: 'com espaço' })).toThrow(/Nome/)
    expect(() => fromForm({ ...base, command: ' ' })).toThrow(/comando/)
    expect(() => fromForm({ ...base, env: 'SEM_IGUAL' })).toThrow(/Linha inválida/)
  })
})
