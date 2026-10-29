import { describe, expect, it } from 'vitest'
import { buildCatalogEntry, catalogEntry, MCP_CATALOG, needsClaudeLogin } from './mcpCatalog'
import { mcpServerSchema, secretRefs } from './project'

const entry = (id: string) => MCP_CATALOG.find((e) => e.id === id)!

describe('catálogo de MCPs', () => {
  it('toda entrada gera uma configuração válida para o project.yaml', () => {
    for (const e of MCP_CATALOG) {
      const values = Object.fromEntries(
        e.fields.map((f) => [
          f.key,
          f.key === 'readOnly'
            ? 'sim'
            : f.key === 'clientId'
              ? 'x.apps.googleusercontent.com'
              : 'valor',
        ]),
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

describe('Meta Ads', () => {
  const entry = catalogEntry('meta-ads')!

  it('sem token: login pelo Claude, sem cabeçalho', () => {
    const { server, secrets } = buildCatalogEntry(entry, {})
    expect(server).toEqual({ type: 'http', url: 'https://mcp.facebook.com/ads' })
    expect(secrets).toEqual({})
    expect(needsClaudeLogin(server)).toBe(true)
  })

  it('com token: Bearer do cofre, testável e válido para qualquer agente', () => {
    const { server, secrets } = buildCatalogEntry(entry, { token: 'EAAx' })
    expect(server).toMatchObject({ headers: { Authorization: 'Bearer ${secret:meta_ads_token}' } })
    expect(secrets).toEqual({ meta_ads_token: 'EAAx' })
    expect(needsClaudeLogin(server)).toBe(false)
  })

  it('Google Drive: OAuth com o Client ID do usuário, porta fixa e token de renovação', () => {
    const drive = catalogEntry('google-drive')!
    const { server, secrets } = buildCatalogEntry(drive, {
      clientId: '123-abc.apps.googleusercontent.com',
      clientSecret: 'GOCSPX-x',
    })
    expect(secrets).toEqual({
      google_drive_client_id: '123-abc.apps.googleusercontent.com',
      google_drive_client_secret: 'GOCSPX-x',
    })
    const args = 'args' in server ? server.args! : []
    expect(args.slice(0, 4)).toEqual([
      '-y',
      'mcp-remote@latest',
      'https://drivemcp.googleapis.com/mcp/v1',
      '3340',
    ])
    // Segredos só como referência ao cofre, nunca o valor no project.yaml.
    expect(JSON.stringify(server)).not.toContain('GOCSPX-x')
    expect(JSON.parse(args[args.indexOf('--static-oauth-client-info') + 1]!)).toEqual({
      client_id: '${secret:google_drive_client_id}',
      client_secret: '${secret:google_drive_client_secret}',
    })
    expect(args).toContain('access_type=offline')
    expect(() => buildCatalogEntry(drive, { clientId: 'errado', clientSecret: 'x' })).toThrow(
      /googleusercontent/,
    )
  })

  it('PostHog e Resend entram pelo mcp-remote (login no navegador)', () => {
    for (const [id, url] of [
      ['posthog', 'https://mcp.posthog.com/mcp'],
      ['resend', 'https://mcp.resend.com/mcp'],
    ] as const)
      expect(buildCatalogEntry(catalogEntry(id)!, {}).server).toEqual({
        command: 'npx',
        args: ['-y', 'mcp-remote@latest', url],
      })
  })

  it('Railway entra pelo mcp-remote (login no navegador)', () => {
    expect(buildCatalogEntry(catalogEntry('railway')!, {}).server).toEqual({
      command: 'npx',
      args: ['-y', 'mcp-remote@latest', 'https://mcp.railway.com'],
    })
  })

  it('ClickUp entra pelo mcp-remote (login no navegador)', () => {
    expect(buildCatalogEntry(catalogEntry('clickup')!, {}).server).toEqual({
      command: 'npx',
      args: ['-y', 'mcp-remote@latest', 'https://mcp.clickup.com/mcp'],
    })
  })
})
