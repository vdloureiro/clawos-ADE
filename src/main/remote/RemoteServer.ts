import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { extname } from 'node:path'
import { Readable } from 'node:stream'
import { WebSocketServer, type WebSocket } from 'ws'
import { decodeWire, encodeWire, type ClientMessage, type ServerMessage } from '@shared/wire'
import { mlResponse, safeJoin } from '../ml/mlProtocol'
import { commands, onBroadcast } from './bus'
import type { RemoteManager } from './RemoteManager'

const COOKIE = 'clawos_device'

/**
 * Comandos que agiriam na tela do computador (janelas do sistema, Finder, área de
 * transferência do Mac) ou que administram o próprio acesso remoto: só pelo app desktop.
 */
export const BLOCKED_REMOTE = new Set([
  'dialog:pickFolder',
  'dialog:pickFiles',
  'shell:openPath',
  'shell:showItem',
  'clipboard:filePaths',
  'media:microphone',
  // Shell do computador: só no app desktop, nunca por um aparelho remoto.
  'terminal:open',
])

export function isBlockedRemote(channel: string): boolean {
  return BLOCKED_REMOTE.has(channel) || channel.startsWith('remote:')
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.wasm': 'application/wasm',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
}

const SECURITY_HEADERS = {
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(), geolocation=()',
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  for (const part of (header ?? '').split(';')) {
    const index = part.indexOf('=')
    if (index > 0)
      out[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim())
  }
  return out
}

/**
 * A página que abriu a conexão é do próprio Clawos? Protege contra outro site usar o
 * navegador do usuário para falar com o servidor (CSRF / WebSocket hijacking).
 */
export function sameOrigin(headers: IncomingMessage['headers']): boolean {
  const origin = headers.origin
  if (!origin) return false
  let originHost: string
  try {
    originHost = new URL(origin).host
  } catch {
    return false
  }
  const allowed = [headers.host, headers['x-forwarded-host']].flat().filter(Boolean)
  return allowed.includes(originHost)
}

/**
 * Servidor do acesso remoto: escuta só em 127.0.0.1 (nunca na rede). A ponte até o
 * celular é o Tailscale (`tailscale serve`) ou um túnel (ex.: Cloudflare), que chegam
 * por localhost. Serve a mesma interface do app e os mesmos comandos, via WebSocket,
 * para aparelhos pareados.
 */
export class RemoteServer {
  private server: Server | null = null
  private wss: WebSocketServer | null = null
  private sockets = new Set<WebSocket>()
  private offBroadcast: (() => void) | null = null
  /** Tentativas de pareamento no último minuto (limite contra força bruta). */
  private attempts: number[] = []

  constructor(
    private readonly manager: RemoteManager,
    private readonly rendererDir: string,
  ) {}

  get running(): boolean {
    return this.server !== null
  }

  get connected(): number {
    return this.sockets.size
  }

  start(port: number): Promise<void> {
    if (this.server) return Promise.resolve()
    const server = createServer((req, res) => void this.route(req, res))
    const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 * 1024 })
    server.on('upgrade', (req, socket, head) => {
      const url = new URL(req.url ?? '/', 'http://local')
      const token = parseCookies(req.headers.cookie)[COOKIE]
      const device = this.manager.verify(token)
      if (url.pathname !== '/api/ws' || !device || !sameOrigin(req.headers)) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
        socket.destroy()
        return
      }
      wss.handleUpgrade(req, socket, head, (ws) =>
        this.attach(Object.assign(ws, { clawosToken: token })),
      )
    })
    this.offBroadcast = onBroadcast((event, payload) => {
      const message = encodeWire({ event, payload } satisfies ServerMessage)
      for (const ws of this.sockets) if (ws.readyState === ws.OPEN) ws.send(message)
    })
    this.server = server
    this.wss = wss
    return new Promise((resolve, reject) => {
      server.once('error', (error) => {
        this.stop()
        reject(error)
      })
      server.listen(port, '127.0.0.1', () => resolve())
    })
  }

  stop(): void {
    this.offBroadcast?.()
    this.offBroadcast = null
    for (const ws of this.sockets) ws.close(1001, 'Acesso remoto desligado')
    this.sockets.clear()
    this.wss?.close()
    this.server?.close()
    this.server = null
    this.wss = null
  }

  /** Desconecta na hora os aparelhos que não são mais válidos (após revogar). */
  dropRevoked(): void {
    for (const ws of this.sockets) {
      const token = (ws as WebSocket & { clawosToken?: string }).clawosToken
      if (!this.manager.verify(token)) ws.close(4401, 'Aparelho desconectado')
    }
  }

  private attach(ws: WebSocket & { clawosToken?: string }): void {
    this.sockets.add(ws)
    ws.on('close', () => this.sockets.delete(ws))
    ws.on('message', (data) => void this.handleMessage(ws, data.toString()))
  }

  private async handleMessage(ws: WebSocket, text: string): Promise<void> {
    let message: ClientMessage
    try {
      message = decodeWire<ClientMessage>(text)
    } catch {
      return
    }
    const { id, channel, args } = message
    const reply = (msg: ServerMessage): void => {
      if (ws.readyState === ws.OPEN) ws.send(encodeWire(msg))
    }
    const handler = typeof channel === 'string' ? commands.get(channel) : undefined
    if (!handler || !Array.isArray(args))
      return reply({ id, ok: false, error: 'Comando desconhecido.' })
    if (isBlockedRemote(channel))
      return reply({
        id,
        ok: false,
        error: 'Indisponível no acesso remoto (use o app no computador).',
      })
    try {
      reply({ id, ok: true, result: await handler(...args) })
    } catch (error) {
      reply({ id, ok: false, error: (error as Error).message ?? String(error) })
    }
  }

  private async route(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://local')
    for (const [key, value] of Object.entries(SECURITY_HEADERS)) res.setHeader(key, value)
    try {
      if (url.pathname === '/api/pair' && req.method === 'POST') return await this.pair(req, res)
      if (url.pathname === '/api/session') {
        const device = this.manager.verify(parseCookies(req.headers.cookie)[COOKIE])
        return json(res, 200, { paired: Boolean(device), device: device?.name ?? null })
      }
      if (url.pathname.startsWith('/ml/')) {
        // Modelo de voz: só para aparelhos pareados.
        if (!this.manager.verify(parseCookies(req.headers.cookie)[COOKIE]))
          return json(res, 401, { error: 'Não pareado.' })
        const [, , host, ...rest] = url.pathname.split('/')
        const response = await mlResponse(
          this.rendererDir,
          host ?? '',
          rest.join('/'),
          header(req, 'range') ?? null,
        )
        return await sendResponse(res, response)
      }
      if (req.method !== 'GET' && req.method !== 'HEAD')
        return json(res, 405, { error: 'Método não permitido.' })
      return this.serveStatic(req, res, url.pathname)
    } catch (error) {
      json(res, 500, { error: (error as Error).message })
    }
  }

  private async pair(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!sameOrigin(req.headers)) return json(res, 403, { error: 'Origem não permitida.' })
    const now = Date.now()
    this.attempts = this.attempts.filter((t) => now - t < 60_000)
    if (this.attempts.length >= 10)
      return json(res, 429, { error: 'Muitas tentativas. Espere um minuto.' })
    this.attempts.push(now)
    const body = await readBody(req, 4096)
    let data: { code?: unknown; name?: unknown }
    try {
      data = JSON.parse(body) as typeof data
    } catch {
      return json(res, 400, { error: 'Pedido inválido.' })
    }
    const result =
      typeof data.code === 'string'
        ? this.manager.pair(data.code, typeof data.name === 'string' ? data.name : '')
        : null
    if (!result)
      return json(res, 401, {
        error: 'Código inválido ou expirado. Gere um novo QR code no Clawos do computador.',
      })
    const https = header(req, 'x-forwarded-proto') === 'https'
    res.setHeader(
      'Set-Cookie',
      `${COOKIE}=${encodeURIComponent(result.token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=31536000${https ? '; Secure' : ''}`,
    )
    json(res, 200, { ok: true, device: result.device.name })
  }

  private serveStatic(req: IncomingMessage, res: ServerResponse, pathname: string): void {
    const relative =
      pathname === '/' ? 'index.html' : decodeURIComponent(pathname).replace(/^\/+/, '')
    const file = safeJoin(this.rendererDir, relative)
    const target = file && existsSync(file) && statSync(file).isFile() ? file : null
    const index = safeJoin(this.rendererDir, 'index.html')!
    const path = target ?? index
    if (path === index) {
      // A página roda no navegador: a CSP precisa liberar o WebSocket deste endereço.
      const host = header(req, 'x-forwarded-host') ?? header(req, 'host') ?? ''
      const html = readFileSync(index, 'utf8').replace(
        "connect-src 'self' clawos-ml:",
        `connect-src 'self' ws://${host} wss://${host}`,
      )
      res.writeHead(200, { 'Content-Type': MIME['.html']!, 'Cache-Control': 'no-store' })
      res.end(req.method === 'HEAD' ? undefined : html)
      return
    }
    res.writeHead(200, {
      'Content-Type': MIME[extname(path)] ?? 'application/octet-stream',
      'Content-Length': statSync(path).size,
      'Cache-Control': 'public, max-age=31536000, immutable',
    })
    if (req.method === 'HEAD') return void res.end()
    createReadStream(path).pipe(res)
  }
}

function header(req: IncomingMessage, name: string): string | undefined {
  const value = req.headers[name]
  return Array.isArray(value) ? value[0] : value
}

function json(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
  res.end(JSON.stringify(data))
}

function readBody(req: IncomingMessage, limit: number): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > limit) {
        reject(new Error('Pedido grande demais.'))
        req.destroy()
      } else chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

async function sendResponse(res: ServerResponse, response: Response): Promise<void> {
  const headers: Record<string, string> = {}
  response.headers.forEach((value, key) => {
    headers[key] = value
  })
  res.writeHead(response.status, headers)
  if (!response.body) return void res.end()
  Readable.fromWeb(response.body as import('node:stream/web').ReadableStream).pipe(res)
}
