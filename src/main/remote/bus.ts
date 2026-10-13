import { BrowserWindow } from 'electron'

/**
 * Eventos do main para as interfaces abertas: as janelas do app e os aparelhos
 * conectados pelo acesso remoto.
 */
type Listener = (channel: string, payload: unknown) => void

const remoteListeners = new Set<Listener>()

export function broadcast(channel: string, payload: unknown): void {
  for (const window of BrowserWindow.getAllWindows()) window.webContents.send(channel, payload)
  for (const listener of remoteListeners) listener(channel, payload)
}

export function onBroadcast(listener: Listener): () => void {
  remoteListeners.add(listener)
  return () => remoteListeners.delete(listener)
}

/** Comandos (invoke) registrados, para o servidor remoto chamar os mesmos handlers. */
export type CommandHandler = (...args: unknown[]) => unknown

export const commands = new Map<string, CommandHandler>()
