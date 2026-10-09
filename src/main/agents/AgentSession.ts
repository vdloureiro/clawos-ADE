import { spawn, type ChildProcess } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { Readable, Writable } from 'node:stream'
import * as acp from '@agentclientprotocol/sdk'
import type { AgentId, SessionEvent, SessionInfo, SessionStatus } from '@shared/types'
import { resolveCli } from './detect'
import { normalizePermissionOptions, normalizeUpdate } from './normalize'
import { getAgent } from './registry'
import { getShellEnv } from './shellEnv'

const require = createRequire(__filename)

/** Caminho do adaptador embutido; fora do asar no app empacotado. */
function resolveAdapter(module: string): string {
  return require.resolve(module).replace(`app.asar${'/'}`, `app.asar.unpacked/`)
}

type PermissionResolver = (optionId: string | null) => void

/**
 * Uma sessão de chat = um processo de agente ACP.
 *
 * Responsável por spawn, handshake, `session/new`, prompts, permissões, cancelamento e
 * encerramento. Tudo que sai daqui para a UI passa por `emit` como `SessionEvent`.
 */
export class AgentSession {
  readonly id = randomUUID()
  private process: ChildProcess | null = null
  private connection: acp.ClientConnection | null = null
  private acpSessionId: string | null = null
  private status: SessionStatus = 'starting'
  private readonly pendingPermissions = new Map<string, PermissionResolver>()
  private readonly stderrTail: string[] = []
  private closing = false

  constructor(
    readonly agentId: AgentId,
    readonly cwd: string,
    private readonly emit: (event: SessionEvent) => void,
  ) {}

  get info(): SessionInfo {
    return { id: this.id, agentId: this.agentId, cwd: this.cwd }
  }

  async start(): Promise<void> {
    this.setStatus('starting')
    try {
      const connection = await this.spawnAgent()
      await connection.agent.request(acp.methods.agent.initialize, {
        protocolVersion: acp.PROTOCOL_VERSION,
        clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false },
        clientInfo: { name: 'clawos', title: 'Clawos', version: '0.0.1' },
      })
      const session = await connection.agent.request(acp.methods.agent.session.new, {
        cwd: this.cwd,
        mcpServers: [],
      })
      this.acpSessionId = session.sessionId
      this.setStatus('ready')
    } catch (error) {
      this.fail(error)
    }
  }

  async prompt(text: string): Promise<void> {
    if (!this.connection || !this.acpSessionId) throw new Error('Sessão ainda não está pronta.')
    this.emit({ type: 'user_message', id: randomUUID(), text })
    this.setStatus('working')
    try {
      const result = await this.connection.agent.request(acp.methods.agent.session.prompt, {
        sessionId: this.acpSessionId,
        prompt: [{ type: 'text', text }],
      })
      this.emit({ type: 'turn_end', stopReason: result.stopReason })
      this.setStatus('ready')
    } catch (error) {
      if (this.closing) return
      this.emit({ type: 'error', message: describeError(error) })
      this.setStatus(this.process ? 'ready' : 'error')
    }
  }

  async cancel(): Promise<void> {
    // Permissões pendentes precisam ser respondidas como "cancelled" (exigência do ACP).
    for (const [requestId, resolve] of this.pendingPermissions) {
      resolve(null)
      this.pendingPermissions.delete(requestId)
    }
    if (this.connection && this.acpSessionId) {
      await this.connection.agent.notify(acp.methods.agent.session.cancel, {
        sessionId: this.acpSessionId,
      })
    }
  }

  respondPermission(requestId: string, optionId: string | null): void {
    const resolve = this.pendingPermissions.get(requestId)
    if (!resolve) return
    this.pendingPermissions.delete(requestId)
    resolve(optionId)
  }

  close(): void {
    this.closing = true
    for (const resolve of this.pendingPermissions.values()) resolve(null)
    this.pendingPermissions.clear()
    this.connection?.close()
    this.process?.kill()
    this.process = null
    this.setStatus('closed')
  }

  private async spawnAgent(): Promise<acp.ClientConnection> {
    const agent = getAgent(this.agentId)
    const cliPath = await resolveCli(this.agentId)
    const shellEnv = await getShellEnv()

    let child: ChildProcess
    if (agent.acp.kind === 'adapter') {
      // Roda o adaptador com o Node embutido no Electron (ver agentHost.ts).
      child = spawn(
        process.execPath,
        [join(__dirname, 'agentHost.js'), resolveAdapter(agent.acp.module)],
        {
          cwd: this.cwd,
          env: { ...shellEnv, ...agent.acp.env(cliPath), ELECTRON_RUN_AS_NODE: '1' },
          stdio: ['pipe', 'pipe', 'pipe'],
        },
      )
    } else {
      child = spawn(cliPath, agent.acp.args, {
        cwd: this.cwd,
        env: shellEnv,
        stdio: ['pipe', 'pipe', 'pipe'],
      })
    }
    this.process = child

    child.stderr?.on('data', (chunk: Buffer) => {
      for (const line of chunk.toString().split('\n')) {
        if (!line.trim()) continue
        this.stderrTail.push(line)
        if (this.stderrTail.length > 30) this.stderrTail.shift()
      }
    })
    child.on('error', (error) => this.fail(error))
    child.on('exit', (code, signal) => {
      this.process = null
      if (this.closing) return
      const tail = this.stderrTail.slice(-8).join('\n')
      this.fail(
        new Error(`O agente encerrou (código ${code ?? signal}).${tail ? `\n${tail}` : ''}`),
      )
    })

    const stream = acp.ndJsonStream(
      Writable.toWeb(child.stdin!),
      Readable.toWeb(child.stdout!) as ReadableStream<Uint8Array>,
    )

    this.connection = acp
      .client({ name: 'clawos' })
      .onNotification(acp.methods.client.session.update, (ctx) => {
        for (const event of normalizeUpdate(ctx.params.update)) this.emit(event)
      })
      .onRequest(acp.methods.client.session.requestPermission, async (ctx) => {
        const requestId = randomUUID()
        const optionId = await new Promise<string | null>((resolve) => {
          this.pendingPermissions.set(requestId, resolve)
          this.emit({
            type: 'permission_request',
            requestId,
            toolCallId: ctx.params.toolCall.toolCallId,
            title: ctx.params.toolCall.title ?? 'Permissão',
            options: normalizePermissionOptions(ctx.params.options),
          })
          this.setStatus('awaiting_permission')
        })
        this.emit({ type: 'permission_resolved', requestId, optionId })
        if (!this.closing) this.setStatus('working')
        return optionId
          ? { outcome: { outcome: 'selected', optionId } }
          : { outcome: { outcome: 'cancelled' } }
      })
      .connect(stream)

    return this.connection
  }

  private setStatus(status: SessionStatus, detail?: string): void {
    if (this.status === status && !detail) return
    this.status = status
    this.emit({ type: 'status_change', status, detail })
  }

  private fail(error: unknown): void {
    if (this.closing) return
    this.emit({ type: 'error', message: describeError(error) })
    this.setStatus('error')
  }
}

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object' && 'message' in error) return String(error.message)
  return String(error)
}
