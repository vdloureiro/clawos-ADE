import type { McpServerConfig } from './project'

/**
 * MCPs populares para adicionar com um clique ao criar ou configurar um projeto.
 * Pacotes e endereços conferidos nas documentações oficiais (out/2026). Tokens nunca
 * vão para o project.yaml: viram `${secret:nome}` e são guardados no cofre do sistema.
 */
export interface CatalogField {
  key: string
  label: string
  placeholder?: string
  /** Guardado como segredo do projeto (criptografado pelo sistema). */
  secret?: boolean
  optional?: boolean
  help?: string
}

export interface CatalogEntry {
  id: string
  name: string
  description: string
  docsUrl: string
  /**
   * Como conecta: `token` (chave colada aqui), `oauth` (login no navegador na primeira
   * conexão, via mcp-remote), `claude` (o servidor só libera o login para clientes
   * aprovados, como o Claude Code: ele mesmo faz o login e guarda o acesso) ou `none`.
   */
  auth: 'token' | 'oauth' | 'claude' | 'none'
  fields: CatalogField[]
  /** Nome do segredo usado por cada campo `secret`. */
  secretName?: (field: string) => string
  build: (values: Record<string, string>) => McpServerConfig
}

const secretRef = (name: string) => `\${secret:${name}}`

/**
 * MCP remoto com login OAuth: o `mcp-remote` abre o navegador na primeira conexão e
 * guarda o acesso em ~/.mcp-auth (fora do projeto e do Clawos). Funciona em qualquer agente.
 */
export const META_ADS_URL = 'https://mcp.facebook.com/ads'

/**
 * Servidor remoto sem token cujo login só o Claude Code consegue fazer (lista de clientes
 * aprovados do provedor). O Clawos não testa nem toca nesse acesso: fica com o Claude.
 */
export function needsClaudeLogin(server: McpServerConfig): boolean {
  return (
    'url' in server &&
    server.url === META_ADS_URL &&
    !Object.keys(server.headers ?? {}).some((h) => h.toLowerCase() === 'authorization')
  )
}

const viaOAuth = (url: string): McpServerConfig => ({
  command: 'npx',
  args: ['-y', 'mcp-remote@latest', url],
})

const EXTRA: CatalogEntry[] = [
  {
    id: 'meta-ads',
    name: 'Meta Ads',
    auth: 'claude',
    description:
      'Campanhas, conjuntos, anúncios, públicos, catálogos e métricas do Facebook e Instagram Ads (servidor oficial da Meta).',
    docsUrl:
      'https://developers.facebook.com/documentation/ads-commerce/ads-ai-connectors/ads-mcp-server/ads-mcp-server-get-started',
    fields: [
      {
        key: 'token',
        label: 'Token de acesso da Meta',
        placeholder: 'EAA…',
        secret: true,
        optional: true,
        help: 'Sem token, o login é feito pelo Claude na primeira conversa (a Meta só libera o login para clientes aprovados, como o Claude). Com um token de usuário (permissões ads_mcp_management, ads_read e ads_management), funciona também no Codex.',
      },
    ],
    secretName: () => 'meta_ads_token',
    build: (values) =>
      values['token']?.trim()
        ? {
            type: 'http',
            url: META_ADS_URL,
            headers: { Authorization: `Bearer ${secretRef('meta_ads_token')}` },
          }
        : { type: 'http', url: META_ADS_URL },
  },
  {
    id: 'railway',
    name: 'Railway',
    auth: 'oauth',
    description:
      'Projetos, serviços, deploys, logs, variáveis e bancos da Railway (servidor oficial). Login com a sua conta.',
    docsUrl: 'https://docs.railway.com/ai/remote-mcp-server',
    fields: [],
    build: () => viaOAuth('https://mcp.railway.com'),
  },
  {
    id: 'clickup',
    name: 'ClickUp',
    auth: 'oauth',
    description:
      'Tarefas, listas, documentos, comentários e controle de tempo do ClickUp (servidor oficial). Login com a sua conta.',
    docsUrl: 'https://help.clickup.com/hc/en-us/articles/33335772678423-What-is-ClickUp-MCP',
    fields: [],
    build: () => viaOAuth('https://mcp.clickup.com/mcp'),
  },
  {
    id: 'vercel',
    name: 'Vercel',
    auth: 'oauth',
    description: 'Projetos, deploys, logs e documentação da Vercel. Login com a sua conta Vercel.',
    docsUrl: 'https://vercel.com/docs/agent-resources/vercel-mcp',
    fields: [],
    build: () => viaOAuth('https://mcp.vercel.com'),
  },
  {
    id: 'linear',
    name: 'Linear',
    auth: 'token',
    description: 'Issues, projetos e ciclos do Linear (servidor remoto oficial).',
    docsUrl: 'https://linear.app/docs/mcp',
    fields: [
      {
        key: 'token',
        label: 'API key',
        placeholder: 'lin_api_…',
        secret: true,
        help: 'Em linear.app → Settings → Security & access → Personal API keys.',
      },
    ],
    secretName: () => 'linear_token',
    build: () => ({
      type: 'http',
      url: 'https://mcp.linear.app/mcp',
      headers: { Authorization: `Bearer ${secretRef('linear_token')}` },
    }),
  },
  {
    id: 'sentry',
    name: 'Sentry',
    auth: 'token',
    description: 'Erros, issues e rastros de performance das suas aplicações no Sentry.',
    docsUrl: 'https://github.com/getsentry/sentry-mcp',
    fields: [
      {
        key: 'token',
        label: 'User auth token',
        placeholder: 'sntryu_…',
        secret: true,
        help: 'Em sentry.io → User settings → Auth tokens (escopos org:read, project:read, event:read).',
      },
    ],
    secretName: () => 'sentry_token',
    build: () => ({
      command: 'npx',
      args: ['-y', '@sentry/mcp-server@latest'],
      env: { SENTRY_ACCESS_TOKEN: secretRef('sentry_token') },
    }),
  },
  {
    id: 'higgsfield',
    name: 'Higgsfield',
    auth: 'oauth',
    description:
      'Gere imagens e vídeos com IA (dezenas de modelos) direto da conversa. Login com a sua conta Higgsfield.',
    docsUrl: 'https://higgsfield.ai/mcp',
    fields: [],
    build: () => viaOAuth('https://mcp.higgsfield.ai/mcp'),
  },
  {
    id: 'cloudflare',
    name: 'Cloudflare',
    auth: 'oauth',
    description: 'Workers, DNS, KV, R2 e toda a API da Cloudflare. Login com a sua conta.',
    docsUrl:
      'https://developers.cloudflare.com/agents/model-context-protocol/cloudflare/servers-for-cloudflare/',
    fields: [],
    build: () => viaOAuth('https://mcp.cloudflare.com/mcp'),
  },
]

const BASE: CatalogEntry[] = [
  {
    id: 'filesystem',
    auth: 'none',
    name: 'Filesystem',
    description: 'Ler, buscar e editar arquivos da pasta do projeto.',
    docsUrl: 'https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem',
    fields: [],
    build: () => ({ command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem', '.'] }),
  },
  {
    id: 'github',
    auth: 'token',
    name: 'GitHub',
    description: 'Issues, pull requests, código e Actions (servidor remoto oficial do GitHub).',
    docsUrl: 'https://github.com/github/github-mcp-server',
    fields: [
      {
        key: 'token',
        label: 'Personal access token',
        placeholder: 'github_pat_…',
        secret: true,
        help: 'Crie em github.com/settings/tokens com acesso aos repositórios desejados.',
      },
    ],
    secretName: () => 'github_token',
    build: () => ({
      type: 'http',
      url: 'https://api.githubcopilot.com/mcp/',
      headers: { Authorization: `Bearer ${secretRef('github_token')}` },
    }),
  },
  {
    id: 'supabase',
    auth: 'token',
    name: 'Supabase',
    description: 'Banco de dados, tabelas, migrations e logs de um projeto Supabase.',
    docsUrl: 'https://github.com/supabase-community/supabase-mcp',
    fields: [
      {
        key: 'projectRef',
        label: 'Project ref',
        placeholder: 'abcdefghijklmnopqrst',
        help: 'Em Project Settings → General.',
      },
      {
        key: 'token',
        label: 'Access token',
        placeholder: 'sbp_…',
        secret: true,
        help: 'Em supabase.com/dashboard/account/tokens.',
      },
      { key: 'readOnly', label: 'Somente leitura (recomendado)', placeholder: 'sim' },
    ],
    secretName: () => 'supabase_token',
    build: (v) => ({
      command: 'npx',
      args: [
        '-y',
        '@supabase/mcp-server-supabase',
        `--project-ref=${v['projectRef']?.trim() ?? ''}`,
        ...(v['readOnly'] === 'não' ? [] : ['--read-only']),
      ],
      env: { SUPABASE_ACCESS_TOKEN: secretRef('supabase_token') },
    }),
  },
  {
    id: 'playwright',
    auth: 'none',
    name: 'Playwright',
    description: 'Navegador controlado pelo agente: abrir páginas, clicar, testar fluxos.',
    docsUrl: 'https://github.com/microsoft/playwright-mcp',
    fields: [],
    build: () => ({ command: 'npx', args: ['-y', '@playwright/mcp@latest'] }),
  },
  {
    id: 'context7',
    auth: 'none',
    name: 'Context7',
    description: 'Documentação atualizada de bibliotecas e frameworks direto no contexto.',
    docsUrl: 'https://github.com/upstash/context7',
    fields: [
      {
        key: 'apiKey',
        label: 'API key',
        placeholder: 'ctx7sk-…',
        secret: true,
        optional: true,
        help: 'Opcional — aumenta os limites. Em context7.com/dashboard.',
      },
    ],
    secretName: () => 'context7_key',
    build: (v) => ({
      command: 'npx',
      args: [
        '-y',
        '@upstash/context7-mcp',
        ...(v['apiKey'] ? ['--api-key', secretRef('context7_key')] : []),
      ],
    }),
  },
  {
    id: 'notion',
    auth: 'token',
    name: 'Notion',
    description: 'Ler e editar páginas e bancos de dados do Notion.',
    docsUrl: 'https://github.com/makenotion/notion-mcp-server',
    fields: [
      {
        key: 'token',
        label: 'Token da integração',
        placeholder: 'ntn_…',
        secret: true,
        help: 'Crie uma integração em notion.so/profile/integrations e compartilhe as páginas com ela.',
      },
    ],
    secretName: () => 'notion_token',
    build: () => ({
      command: 'npx',
      args: ['-y', '@notionhq/notion-mcp-server'],
      env: { NOTION_TOKEN: secretRef('notion_token') },
    }),
  },
  {
    id: 'stripe',
    auth: 'token',
    name: 'Stripe',
    description: 'Clientes, pagamentos, produtos e assinaturas da sua conta Stripe.',
    docsUrl: 'https://github.com/stripe/agent-toolkit',
    fields: [
      {
        key: 'apiKey',
        label: 'Chave secreta',
        placeholder: 'sk_test_… ou rk_…',
        secret: true,
        help: 'Prefira uma chave restrita (rk_) com só as permissões necessárias.',
      },
    ],
    secretName: () => 'stripe_key',
    build: () => ({
      command: 'npx',
      args: ['-y', '@stripe/mcp', `--api-key=${secretRef('stripe_key')}`],
    }),
  },
  {
    id: 'memory',
    auth: 'none',
    name: 'Memory',
    description: 'Memória persistente em grafo de conhecimento entre conversas.',
    docsUrl: 'https://github.com/modelcontextprotocol/servers/tree/main/src/memory',
    fields: [],
    build: () => ({ command: 'npx', args: ['-y', '@modelcontextprotocol/server-memory'] }),
  },
]

/** Ordem do catálogo: os mais usados primeiro. */
const ORDER = [
  'github',
  'supabase',
  'vercel',
  'railway',
  'meta-ads',
  'clickup',
  'linear',
  'notion',
  'stripe',
  'sentry',
  'cloudflare',
  'higgsfield',
  'context7',
  'playwright',
  'filesystem',
  'memory',
]

export const MCP_CATALOG: CatalogEntry[] = [...BASE, ...EXTRA].sort(
  (a, b) => ORDER.indexOf(a.id) - ORDER.indexOf(b.id),
)

export function catalogEntry(id: string): CatalogEntry | undefined {
  return MCP_CATALOG.find((e) => e.id === id)
}

export interface CatalogSelection {
  /** Nome do MCP no project.yaml. */
  name: string
  server: McpServerConfig
  /** Segredos a guardar: nome → valor. */
  secrets: Record<string, string>
}

/** Monta a entrada do project.yaml e os segredos a partir dos valores digitados. */
export function buildCatalogEntry(
  entry: CatalogEntry,
  values: Record<string, string>,
): CatalogSelection {
  const missing = entry.fields.filter(
    (f) => !f.optional && f.key !== 'readOnly' && !values[f.key]?.trim(),
  )
  if (missing.length > 0)
    throw new Error(`${entry.name}: preencha ${missing.map((f) => f.label).join(', ')}.`)
  const secrets: Record<string, string> = {}
  for (const field of entry.fields) {
    const value = values[field.key]?.trim()
    if (field.secret && value && entry.secretName) secrets[entry.secretName(field.key)] = value
  }
  return { name: entry.id, server: entry.build(values), secrets }
}
