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
  fields: CatalogField[]
  /** Nome do segredo usado por cada campo `secret`. */
  secretName?: (field: string) => string
  build: (values: Record<string, string>) => McpServerConfig
}

const secretRef = (name: string) => `\${secret:${name}}`

export const MCP_CATALOG: CatalogEntry[] = [
  {
    id: 'filesystem',
    name: 'Filesystem',
    description: 'Ler, buscar e editar arquivos da pasta do projeto.',
    docsUrl: 'https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem',
    fields: [],
    build: () => ({ command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem', '.'] }),
  },
  {
    id: 'github',
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
    name: 'Playwright',
    description: 'Navegador controlado pelo agente: abrir páginas, clicar, testar fluxos.',
    docsUrl: 'https://github.com/microsoft/playwright-mcp',
    fields: [],
    build: () => ({ command: 'npx', args: ['-y', '@playwright/mcp@latest'] }),
  },
  {
    id: 'context7',
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
    name: 'Memory',
    description: 'Memória persistente em grafo de conhecimento entre conversas.',
    docsUrl: 'https://github.com/modelcontextprotocol/servers/tree/main/src/memory',
    fields: [],
    build: () => ({ command: 'npx', args: ['-y', '@modelcontextprotocol/server-memory'] }),
  },
]

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
