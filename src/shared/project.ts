import { z } from 'zod'
import { AGENT_IDS } from './agents'
import { RESPONSE_LANGUAGES } from './language'

/**
 * Schema de `<projeto>/.clawos/project.yaml` — fonte única de verdade da configuração
 * do projeto. Valores sensíveis entram como `${secret:nome}` e são resolvidos em runtime
 * a partir do safeStorage; nunca ficam no YAML.
 */
const stringRecord = z.record(z.string(), z.string())

export const stdioMcpSchema = z.object({
  type: z.literal('stdio').optional(),
  command: z.string().min(1),
  args: z.array(z.string()).optional(),
  env: stringRecord.optional(),
})

export const remoteMcpSchema = z.object({
  type: z.enum(['http', 'sse']),
  url: z.string().min(1),
  headers: stringRecord.optional(),
})

export const mcpServerSchema = z.union([stdioMcpSchema, remoteMcpSchema])

export const agentSettingsSchema = z.object({
  enabled: z.boolean().optional(),
  /**
   * Claude: carregar também a configuração global do usuário (~/.claude: CLAUDE.md,
   * skills, permissões). Padrão: false — o projeto fica isolado. Ignorado pelos demais.
   */
  inheritUserConfig: z.boolean().optional(),
})

export const projectConfigSchema = z.object({
  name: z.string().optional(),
  defaultAgent: z.enum(AGENT_IDS).optional(),
  instructions: z.string().optional(),
  /** Idioma das respostas dos agentes (padrão: pt-BR). */
  language: z.enum(RESPONSE_LANGUAGES).optional(),
  skills: z.array(z.string()).optional(),
  mcpServers: z
    .record(z.string().regex(/^[\w-]+$/, 'use letras, números, - ou _'), mcpServerSchema)
    .optional(),
  agents: z.record(z.string(), agentSettingsSchema).optional(),
})

export type McpServerConfig = z.infer<typeof mcpServerSchema>
export type ProjectConfig = z.infer<typeof projectConfigSchema>

export function isRemoteMcp(server: McpServerConfig): server is z.infer<typeof remoteMcpSchema> {
  return server.type === 'http' || server.type === 'sse'
}

const SECRET_PATTERN = /\$\{secret:([\w-]+)\}/g

/** Nomes de segredos referenciados em um texto. */
export function secretRefs(value: string): string[] {
  return [...value.matchAll(SECRET_PATTERN)].map((m) => m[1]!)
}

/** Substitui `${secret:nome}` usando `lookup`; lança erro listando os segredos ausentes. */
export function resolveSecrets(value: string, lookup: (name: string) => string | null): string {
  const missing: string[] = []
  const result = value.replace(SECRET_PATTERN, (_, name: string) => {
    const secret = lookup(name)
    if (secret === null) {
      missing.push(name)
      return ''
    }
    return secret
  })
  if (missing.length > 0) throw new MissingSecretsError(missing)
  return result
}

export class MissingSecretsError extends Error {
  constructor(readonly names: string[]) {
    super(
      `Segredo(s) não configurado(s): ${names.join(', ')}. Defina em Configurações do projeto → Segredos.`,
    )
  }
}
