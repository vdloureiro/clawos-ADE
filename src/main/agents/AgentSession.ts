import { spawn, type ChildProcess } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { Readable, Writable } from 'node:stream'
import * as acp from '@agentclientprotocol/sdk'
import type { AgentId, SessionEvent, SessionStatus } from '@shared/types'
import type { CompiledSession } from '../compiler/ConfigCompiler'
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

export interface AgentSessionOptions {
  id: string
  agentId: AgentId
  cwd: string
  /** Configuração do projeto já traduzida para este agente. */
  compiled: CompiledSession
  /** Id da sessão ACP anterior, para retomar a conversa (`session/resume`). */
  resumeAcpSessionId: string | null
  emit: (event: SessionEvent) => void
  /** Chamado quando o agente atribui o id da sessão ACP (para persistir). */
  onAcpSessionId: (acpSessionId: string) => void
}

/**
 * Uma sessão de chat = um processo de agente ACP.
 *
 * Responsável por spawn, handshake, `session/new`, prompts, permissões, cancelamento e
 * encerramento. Tudo que sai daqui para a UI passa por `emit` como `SessionEvent`.
 */
export class AgentSession {
  readonly id: string
  readonly agentId: AgentId
  readonly cwd: string
  private readonly emit: (event: SessionEvent) => void
  private process: ChildProcess | null = null
  private connection: acp.ClientConnection | null = null
  private acpSessionId: string | null = null
  private status: SessionStatus = 'starting'
  private readonly pendingPermissions = new Map<string, PermissionResolver>()
  private readonly stderrTail: string[] = []
  private closing = false

  constructor(private readonly options: AgentSessionOptions) {
    this.id = options.id
    this.agentId = options.agentId
    this.cwd = options.cwd
    this.emit = options.emit
  }

  async start(): Promise<void> {
    this.setStatus('starting')
    try {
      const connection = await this.spawnAgent()
      const init = await connection.agent.request(acp.methods.agent.initialize, {
        protocolVersion: acp.PROTOCOL_VERSION,
        clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false },
        clientInfo: { name: 'clawos', title: 'Clawos', version: '0.0.1' },
      })
      const { compiled, resumeAcpSessionId } = this.options
      const canResume = Boolean(init.agentCapabilities?.sessionCapabilities?.resume)

      if (resumeAcpSessionId && canResume) {
        // Retoma o contexto da conversa sem reenviar o histórico (a UI já o tem do banco).
        await connection.agent.request(acp.methods.agent.session.resume, {
          sessionId: resumeAcpSessionId,
          cwd: this.cwd,
          mcpServers: compiled.mcpServers,
          _meta: compiled.meta,
        })
        this.acpSessionId = resumeAcpSessionId
      } else {
        const session = await connection.agent.request(acp.methods.agent.session.new, {
          cwd: this.cwd,
          mcpServers: compiled.mcpServers,
          _meta: compiled.meta,
        })
        this.acpSessionId = session.sessionId
        this.options.onAcpSessionId(session.sessionId)
        if (resumeAcpSessionId) {
          this.emit({
            type: 'error',
            message: 'Este agente não suporta retomar conversas; o contexto anterior foi perdido.',
          })
        }
      }
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

/** Mensagem legível, incluindo o detalhe que o ACP manda em `data` (ex.: stderr do CLI). */
export function describeError(error: unknown): string {
  if (error && typeof error === 'object') {
    const { message, data } = error as { message?: unknown; data?: unknown }
    const details =
      data && typeof data === 'object' && 'details' in data
        ? String((data as { details: unknown }).details)
        : null
    if (details)
      return message && message !== 'Internal error' ? `${String(message)}: ${details}` : details
    if (message) return String(message)
  }
  return String(error)
}
