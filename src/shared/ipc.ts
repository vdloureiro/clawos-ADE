/**
 * Contrato tipado de IPC entre main e renderer.
 * Todo canal novo é declarado aqui; preload e main só aceitam canais desta lista.
 */
import type { AgentId, AgentStatus, SessionEvent, SessionInfo } from './types'

export interface AppInfo {
  name: string
  version: string
  platform: NodeJS.Platform
  versions: { electron: string; chrome: string; node: string }
}

/** Canais request/response (renderer → main). */
export interface InvokeChannels {
  'app:info': { args: []; result: AppInfo }
  'dialog:pickFolder': { args: []; result: string | null }

  'agents:status': { args: [refresh?: boolean]; result: AgentStatus[] }

  'session:create': { args: [agentId: AgentId, cwd: string]; result: SessionInfo }
  'session:prompt': { args: [sessionId: string, text: string]; result: void }
  'session:cancel': { args: [sessionId: string]; result: void }
  'session:permission': {
    args: [sessionId: string, requestId: string, optionId: string | null]
    result: void
  }
  'session:close': { args: [sessionId: string]; result: void }

  'terminal:create': {
    args: [options: { command: string; args: string[]; cwd?: string; cols: number; rows: number }]
    result: string
  }
  'terminal:input': { args: [terminalId: string, data: string]; result: void }
  'terminal:resize': { args: [terminalId: string, cols: number, rows: number]; result: void }
  'terminal:kill': { args: [terminalId: string]; result: void }
}

/** Canais de evento (main → renderer). */
export interface EventChannels {
  'session:event': { sessionId: string; event: SessionEvent }
  'terminal:data': { terminalId: string; data: string }
  'terminal:exit': { terminalId: string; exitCode: number }
}

export type InvokeChannel = keyof InvokeChannels
export type InvokeArgs<C extends InvokeChannel> = InvokeChannels[C]['args']
export type InvokeResult<C extends InvokeChannel> = InvokeChannels[C]['result']
export type EventChannel = keyof EventChannels

export const EVENT_CHANNELS: readonly EventChannel[] = [
  'session:event',
  'terminal:data',
  'terminal:exit',
]

/** API exposta ao renderer em `window.clawos`. */
export interface ClawosApi {
  invoke<C extends InvokeChannel>(channel: C, ...args: InvokeArgs<C>): Promise<InvokeResult<C>>
  /** Assina um evento do main. Retorna a função para cancelar a assinatura. */
  on<C extends EventChannel>(channel: C, listener: (payload: EventChannels[C]) => void): () => void
}
