import { spawn, type ChildProcess } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { readFileSync, statSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Readable, Writable } from 'node:stream'
import * as acp from '@agentclientprotocol/sdk'
import type {
  AgentId,
  SessionConfigChoice,
  SessionConfigOption,
  SessionEvent,
  SessionStatus,
} from '@shared/types'
import type { CompiledSession } from '../compiler/ConfigCompiler'
import { resolveCli } from './detect'
import { normalizeConfigOptions, normalizePermissionOptions, normalizeUpdate } from './normalize'
import { openSession } from './openSession'
import { getAgent } from './registry'
import { getShellEnv } from './shellEnv'

const require = createRequire(__filename)

/**
 * No app empacotado os adaptadores (e suas dependências) ficam fora do asar, pois rodam
 * como processos Node separados. Converte `…/app.asar/…` em `…/app.asar.unpacked/…`.
 */
export function unpacked(path: string): string {
  return path.replace(/app\.asar([\\/])/, 'app.asar.unpacked$1')
}

function resolveAdapter(module: string): string {
  return unpacked(require.resolve(module))
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
  /** A conversa já tem mensagens (para avisar se o contexto do agente não puder ser retomado). */
  hasHistory: boolean
  /** Modelo, modo de permissão etc. escolhidos pelo usuário, aplicados ao abrir a sessão. */
  config: SessionConfigChoice
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
  /** Durante `session/load`, updates são o histórico sendo reenviado. */
  private replaying = false
  private configOptions: SessionConfigOption[] = []
  /** O agente aceita imagens no prompt (ACP `promptCapabilities.image`). */
  private acceptsImages = false

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
      const caps = init.agentCapabilities
      this.acceptsImages = caps?.promptCapabilities?.image === true
      const base = {
        cwd: this.cwd,
        mcpServers: compiled.mcpServers,
        ...(compiled.additionalDirectories.length > 0 && {
          additionalDirectories: compiled.additionalDirectories,
        }),
        _meta: compiled.meta,
      }

      // Resposta de session/new|resume|load, de onde vêm as opções de configuração.
      let response: { configOptions?: acp.SessionConfigOption[] | null } | undefined
      const keep = <T>(value: T): T => {
        response = value as typeof response
        return value
      }
      const opened = await openSession(resumeAcpSessionId, {
        // Retoma o contexto sem reenviar o histórico (a UI já o tem do banco).
        resume: caps?.sessionCapabilities?.resume
          ? async (sessionId) =>
              keep(
                await connection.agent.request(acp.methods.agent.session.resume, {
                  sessionId,
                  ...base,
                }),
              )
          : undefined,
        // `session/load` reenvia o histórico como updates; descartamos para não duplicar.
        load: caps?.loadSession
          ? async (sessionId) => {
              this.replaying = true
              try {
                return keep(
                  await connection.agent.request(acp.methods.agent.session.load, {
                    sessionId,
                    ...base,
                  }),
                )
              } finally {
                this.replaying = false
              }
            }
          : undefined,
        create: async () =>
          keep(await connection.agent.request(acp.methods.agent.session.new, base)),
      })
      this.acpSessionId = opened.sessionId
      if (opened.created) this.options.onAcpSessionId(opened.sessionId)
      if (opened.contextLost && this.options.hasHistory) {
        this.emit({
          type: 'notice',
          text: 'Não foi possível retomar o contexto anterior do agente; a conversa continua numa sessão nova.',
        })
      }
      for (const text of compiled.warnings) this.emit({ type: 'notice', text })
      this.configOptions = normalizeConfigOptions(response?.configOptions)
      await this.applyChoice(this.options.config)
      this.emit({ type: 'config_options', options: this.configOptions })
      this.setStatus('ready')
    } catch (error) {
      this.fail(error)
    }
  }

  async prompt(text: string, attachments: string[] = []): Promise<void> {
    if (!this.connection || !this.acpSessionId) throw new Error('Sessão ainda não está pronta.')
    this.emit({
      type: 'user_message',
      id: randomUUID(),
      text,
      ...(attachments.length > 0 && { attachments }),
    })
    this.setStatus('working')
    try {
      const result = await this.connection.agent.request(acp.methods.agent.session.prompt, {
        sessionId: this.acpSessionId,
        prompt: [{ type: 'text', text }, ...attachments.map((path) => this.attachmentBlock(path))],
      })
      this.emit({ type: 'turn_end', stopReason: result.stopReason })
      this.setStatus('ready')
    } catch (error) {
      if (this.closing) return
      this.emit({ type: 'error', message: describeError(error) })
      this.setStatus(this.process ? 'ready' : 'error')
    }
  }

  /**
   * Imagens vão como bloco de imagem (o modelo as vê direto); os demais arquivos viram
   * links de recurso e o agente lê o conteúdo com as próprias ferramentas.
   */
  private attachmentBlock(path: string): acp.ContentBlock {
    const mimeType = IMAGE_TYPES[extname(path).toLowerCase()]
    if (mimeType && this.acceptsImages) {
      try {
        if (statSync(path).size <= MAX_IMAGE_BYTES)
          return { type: 'image', mimeType, data: readFileSync(path).toString('base64') }
      } catch {
        // Arquivo sumiu: manda o link e o agente reporta.
      }
    }
    return { type: 'resource_link', uri: pathToFileURL(path).href, name: basename(path) }
  }

  /** Troca uma opção (modelo, modo de permissão…). Vale a partir do próximo turno. */
  async setConfig(configId: string, value: string, emit = true): Promise<SessionConfigOption[]> {
    if (!this.connection || !this.acpSessionId) throw new Error('Sessão ainda não está pronta.')
    const result = await this.connection.agent.request(acp.methods.agent.session.setConfigOption, {
      sessionId: this.acpSessionId,
      configId,
      value,
    })
    this.configOptions = normalizeConfigOptions(result.configOptions)
    if (emit) this.emit({ type: 'config_options', options: this.configOptions })
    return this.configOptions
  }

  /**
   * Reaplica as escolhas do usuário (por categoria). O modelo vai primeiro, pois os
   * níveis de raciocínio disponíveis dependem dele. Valores que o agente não oferece
   * mais (ex.: modelo descontinuado) são ignorados.
   */
  private async applyChoice(choice: SessionConfigChoice): Promise<void> {
    const order = ['model', 'thought_level', 'mode']
    const categories = Object.keys(choice).sort(
      (a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99),
    )
    for (const category of categories) {
      const value = choice[category]
      const option = this.configOptions.find((o) => o.category === category)
      if (!value || !option || option.currentValue === value) continue
      if (!option.options.some((o) => o.value === value)) continue
      try {
        await this.setConfig(option.id, value, false)
      } catch {
        // Mantém o padrão do agente; o usuário pode trocar pela barra do chat.
      }
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
    const { compiled } = this.options

    let child: ChildProcess
    if (agent.acp.kind === 'adapter') {
      // Roda o adaptador com o Node embutido no Electron (ver agentHost.ts).
      child = spawn(
        process.execPath,
        [unpacked(join(__dirname, 'agentHost.js')), resolveAdapter(agent.acp.module)],
        {
          cwd: this.cwd,
          env: {
            ...shellEnv,
            ...compiled.env,
            ...agent.acp.env(cliPath),
            ELECTRON_RUN_AS_NODE: '1',
          },
          stdio: ['pipe', 'pipe', 'pipe'],
        },
      )
    } else {
      child = spawn(cliPath, compiled.args ?? agent.acp.args, {
        cwd: this.cwd,
        env: { ...shellEnv, ...compiled.env },
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
        if (this.replaying) return
        const { update } = ctx.params
        // O agente pode mudar de modo sozinho (ex.: o Claude sai do modo plano).
        if (update.sessionUpdate === 'current_mode_update') {
          this.configOptions = this.configOptions.map((o) =>
            o.category === 'mode' ? { ...o, currentValue: update.currentModeId } : o,
          )
          this.emit({ type: 'config_options', options: this.configOptions })
          return
        }
        for (const event of normalizeUpdate(update)) {
          if (event.type === 'config_options') this.configOptions = event.options
          this.emit(event)
        }
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
    let message = describeError(error)
    // -32000 = auth_required no ACP: acrescenta como resolver neste agente.
    if ((error as { code?: unknown })?.code === -32000)
      message += `\n\n${getAgent(this.agentId).authHelp}`
    this.emit({ type: 'error', message })
    this.setStatus('error')
  }
}

const IMAGE_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
}

/** Limite das APIs dos modelos para uma imagem no prompt. */
const MAX_IMAGE_BYTES = 5 * 1024 * 1024

/** Mensagem legível, incluindo o detalhe que o ACP manda em `data` (ex.: stderr do CLI). */
export function describeError(error: unknown): string {
  if (error && typeof error === 'object') {
    const { message, data } = error as { message?: unknown; data?: unknown }
    if (typeof data === 'string' && data.trim()) return data.trim()
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
