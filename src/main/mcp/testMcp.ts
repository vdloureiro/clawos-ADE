import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import type { McpServer } from '@agentclientprotocol/sdk'

export interface McpTestResult {
  ok: boolean
  tools: string[]
  error: string | null
}

/**
 * Conecta a um MCP (já compilado, com segredos resolvidos) e lista suas ferramentas.
 * Usado pelo botão "Testar conexão" nas configurações do projeto.
 */
export async function testMcpServer(
  server: McpServer,
  cwd: string,
  env: NodeJS.ProcessEnv,
  timeoutMs = 30_000,
): Promise<McpTestResult> {
  const client = new Client({ name: 'clawos', version: '0.0.1' })
  let transport
  if ('type' in server && (server.type === 'http' || server.type === 'sse')) {
    const headers = Object.fromEntries(server.headers.map((h) => [h.name, h.value]))
    const url = new URL(server.url)
    transport =
      server.type === 'http'
        ? new StreamableHTTPClientTransport(url, { requestInit: { headers } })
        : new SSEClientTransport(url, { requestInit: { headers } })
  } else if ('command' in server) {
    transport = new StdioClientTransport({
      command: server.command,
      args: server.args,
      cwd,
      env: {
        ...(Object.fromEntries(Object.entries(env).filter(([, v]) => v !== undefined)) as Record<
          string,
          string
        >),
        ...Object.fromEntries(server.env.map((e) => [e.name, e.value])),
      },
      stderr: 'ignore',
    })
  } else {
    return { ok: false, tools: [], error: 'Tipo de MCP não suportado.' }
  }

  let timer: NodeJS.Timeout | undefined
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`Sem resposta em ${timeoutMs / 1000}s.`)),
        timeoutMs,
      )
    })
    await Promise.race([client.connect(transport), timeout])
    const { tools } = await Promise.race([client.listTools(), timeout])
    return { ok: true, tools: tools.map((t) => t.name), error: null }
  } catch (error) {
    return { ok: false, tools: [], error: (error as Error).message }
  } finally {
    clearTimeout(timer)
    await client.close().catch(() => undefined)
  }
}
