import { describe, expect, it } from 'vitest'
import { buildCatalogEntry, MCP_CATALOG } from './mcpCatalog'
import { mcpServerSchema, secretRefs } from './project'

const entry = (id: string) => MCP_CATALOG.find((e) => e.id === id)!

describe('catálogo de MCPs', () => {
  it('toda entrada gera uma configuração válida para o project.yaml', () => {
    for (const e of MCP_CATALOG) {
      const values = Object.fromEntries(
        e.fields.map((f) => [f.key, f.key === 'readOnly' ? 'sim' : 'valor']),
      )
      const { server } = buildCatalogEntry(e, values)
      expect(mcpServerSchema.safeParse(server).success, e.id).toBe(true)
    }
  })

  it('tokens viram segredos e só aparecem no YAML como referência', () => {
    const result = buildCatalogEntry(entry('supabase'), {
      projectRef: 'abc',
      token: 'sbp_123',
      readOnly: 'sim',
    })
    expect(result.secrets).toEqual({ supabase_token: 'sbp_123' })
    expect(JSON.stringify(result.server)).not.toContain('sbp_123')
    expect(secretRefs(JSON.stringify(result.server))).toEqual(['supabase_token'])
    expect(result.server).toMatchObject({
      args: ['-y', '@supabase/mcp-server-supabase', '--project-ref=abc', '--read-only'],
    })
  })

  it('GitHub usa o servidor remoto oficial com o token no header', () => {
    const { server, secrets } = buildCatalogEntry(entry('github'), { token: 'github_pat_x' })
    expect(server).toEqual({
      type: 'http',
      url: 'https://api.githubcopilot.com/mcp/',
      headers: { Authorization: 'Bearer ${secret:github_token}' },
    })
    expect(secrets).toEqual({ github_token: 'github_pat_x' })
  })

  it('campos opcionais podem ficar vazios', () => {
    const { server, secrets } = buildCatalogEntry(entry('context7'), {})
    expect(server).toEqual({ command: 'npx', args: ['-y', '@upstash/context7-mcp'] })
    expect(secrets).toEqual({})
  })

  it('campos obrigatórios vazios geram erro legível', () => {
    expect(() => buildCatalogEntry(entry('notion'), {})).toThrow(
      /Notion: preencha Token da integração/,
    )
  })

  it('Supabase com escrita liberada não leva --read-only', () => {
    const { server } = buildCatalogEntry(entry('supabase'), {
      projectRef: 'abc',
      token: 't',
      readOnly: 'não',
    })
    expect(server).toMatchObject({
      args: ['-y', '@supabase/mcp-server-supabase', '--project-ref=abc'],
    })
  })
})
