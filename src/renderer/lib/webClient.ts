import type { ClawosApi, EventChannel } from '@shared/ipc'
import { decodeWire, encodeWire, type ServerMessage } from '@shared/wire'

/**
 * Cliente do acesso remoto: no navegador (celular, tablet), não existe a ponte do
 * Electron (`window.clawos`). Este cliente implementa a mesma API sobre WebSocket,
 * reconectando sozinho se a conexão cair.
 */
type Pending = { resolve: (value: unknown) => void; reject: (error: Error) => void }

export type ConnectionState = 'connecting' | 'online' | 'offline' | 'unauthorized'

let connectionListener: ((state: ConnectionState) => void) | null = null

export function onConnectionChange(listener: (state: ConnectionState) => void): void {
  connectionListener = listener
}

export function installWebClient(): void {
  const pending = new Map<number, Pending>()
  const listeners = new Map<string, Set<(payload: unknown) => void>>()
  const queue: string[] = []
  let nextId = 1
  let socket: WebSocket | null = null
  let retry = 500

  const setState = (state: ConnectionState) => connectionListener?.(state)

  const connect = () => {
    setState('connecting')
    const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/ws`
    const ws = new WebSocket(url)
    socket = ws
    ws.onopen = () => {
      retry = 500
      setState('online')
      for (const message of queue.splice(0)) ws.send(message)
    }
    ws.onmessage = (event) => {
      const message = decodeWire<ServerMessage>(String(event.data))
      if ('event' in message) {
        for (const listener of listeners.get(message.event) ?? []) listener(message.payload)
        return
      }
      const waiting = pending.get(message.id)
      if (!waiting) return
      pending.delete(message.id)
      if (message.ok) waiting.resolve(message.result)
      else waiting.reject(new Error(message.error))
    }
    ws.onclose = (event) => {
      socket = null
      // Pedidos em andamento falham (a interface mostra o erro e pode tentar de novo).
      for (const [id, waiting] of pending) {
        waiting.reject(new Error('Conexão com o computador perdida.'))
        pending.delete(id)
      }
      if (event.code === 4401 || event.code === 1008) {
        setState('unauthorized')
        return
      }
      setState('offline')
      setTimeout(connect, retry)
      retry = Math.min(retry * 2, 10_000)
    }
  }

  const api: ClawosApi = {
    invoke: (channel, ...args) =>
      new Promise((resolve, reject) => {
        const id = nextId++
        pending.set(id, { resolve: resolve as (value: unknown) => void, reject })
        const message = encodeWire({ id, channel, args })
        if (socket?.readyState === WebSocket.OPEN) socket.send(message)
        else queue.push(message)
      }),
    on: (channel, listener) => {
      const set = listeners.get(channel as EventChannel) ?? new Set()
      set.add(listener as (payload: unknown) => void)
      listeners.set(channel, set)
      return () => set.delete(listener as (payload: unknown) => void)
    },
    // No navegador não há caminho de arquivo: anexos são enviados (ver lib/platform).
    pathForFile: () => '',
  }

  Object.assign(window, { clawos: api, __clawosRemote: true })
  connect()
}

/** O aparelho já está pareado com este computador? */
export async function remoteSession(): Promise<{ paired: boolean; device: string | null }> {
  const res = await fetch('/api/session', { credentials: 'same-origin' })
  return (await res.json()) as { paired: boolean; device: string | null }
}

export async function pairDevice(code: string, name: string): Promise<void> {
  const res = await fetch('/api/pair', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, name }),
  })
  if (!res.ok)
    throw new Error(((await res.json()) as { error?: string }).error ?? 'Falha ao parear.')
}
