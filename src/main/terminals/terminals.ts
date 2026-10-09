import { randomUUID } from 'node:crypto'
import { BrowserWindow } from 'electron'
import * as pty from 'node-pty'
import { getShellEnv } from '../agents/shellEnv'

/**
 * Terminais reais (node-pty). Usados só para login de CLI e, no futuro, como painel
 * opcional — conversas com agentes nunca passam por aqui.
 */
const terminals = new Map<string, pty.IPty>()

function send(channel: 'terminal:data' | 'terminal:exit', payload: unknown): void {
  for (const window of BrowserWindow.getAllWindows()) window.webContents.send(channel, payload)
}

export async function openTerminal(
  file: string,
  args: string[],
  cols: number,
  rows: number,
  cwd = process.env['HOME'] ?? process.cwd(),
): Promise<string> {
  const env = await getShellEnv()
  const id = randomUUID()
  const term = pty.spawn(file, args, {
    name: 'xterm-256color',
    cols,
    rows,
    cwd,
    env: env as Record<string, string>,
  })
  terminals.set(id, term)
  term.onData((data) => send('terminal:data', { terminalId: id, data }))
  term.onExit(({ exitCode }) => {
    terminals.delete(id)
    send('terminal:exit', { terminalId: id, exitCode })
  })
  return id
}

export function writeTerminal(id: string, data: string): void {
  terminals.get(id)?.write(data)
}

export function resizeTerminal(id: string, cols: number, rows: number): void {
  terminals.get(id)?.resize(Math.max(cols, 1), Math.max(rows, 1))
}

export function killTerminal(id: string): void {
  terminals.get(id)?.kill()
  terminals.delete(id)
}

export function killAllTerminals(): void {
  for (const id of [...terminals.keys()]) killTerminal(id)
}
