import { isRemoteMcp, type McpServerConfig } from '@shared/project'

/** Representação editável de um MCP no formulário (listas como texto, uma por linha). */
export interface McpForm {
  name: string
  type: 'stdio' | 'http' | 'sse'
  command: string
  args: string
  env: string
  url: string
  headers: string
}

export const emptyMcpForm: McpForm = {
  name: '',
  type: 'stdio',
  command: '',
  args: '',
  env: '',
  url: '',
  headers: '',
}

export function toForm(name: string, server: McpServerConfig): McpForm {
  if (isRemoteMcp(server)) {
    return {
      ...emptyMcpForm,
      name,
      type: server.type,
      url: server.url,
      headers: Object.entries(server.headers ?? {})
        .map(([k, v]) => `${k}: ${v}`)
        .join('\n'),
    }
  }
  return {
    ...emptyMcpForm,
    name,
    type: 'stdio',
    command: server.command,
    args: (server.args ?? []).join('\n'),
    env: Object.entries(server.env ?? {})
      .map(([k, v]) => `${k}=${v}`)
      .join('\n'),
  }
}

function lines(text: string): string[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
}

function pairs(text: string, separator: string): Record<string, string> | undefined {
  const entries = lines(text).map((line) => {
    const index = line.indexOf(separator)
    if (index <= 0) throw new Error(`Linha inválida (use CHAVE${separator}valor): ${line}`)
    return [line.slice(0, index).trim(), line.slice(index + separator.length).trim()] as const
  })
  return entries.length > 0 ? Object.fromEntries(entries) : undefined
}

/** Converte o formulário em entrada do project.yaml. Lança erro com mensagem legível. */
export function fromForm(form: McpForm): [string, McpServerConfig] {
  const name = form.name.trim()
  if (!/^[\w-]+$/.test(name)) throw new Error('Nome: use letras, números, - ou _.')
  if (form.type === 'stdio') {
    if (!form.command.trim()) throw new Error('Informe o comando.')
    const args = lines(form.args)
    const env = pairs(form.env, '=')
    return [
      name,
      { command: form.command.trim(), ...(args.length && { args }), ...(env && { env }) },
    ]
  }
  if (!form.url.trim()) throw new Error('Informe a URL.')
  const headers = pairs(form.headers, ':')
  return [name, { type: form.type, url: form.url.trim(), ...(headers && { headers }) }]
}
