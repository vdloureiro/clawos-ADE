import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import type { InvokeArgs, InvokeChannel, InvokeResult } from '@shared/ipc'
import { detectAll, resolveCli } from '../agents/detect'
import { getAgent } from '../agents/registry'
import { closeSession, createSession, getSession } from '../agents/sessions'
import { killTerminal, openTerminal, resizeTerminal, writeTerminal } from '../terminals/terminals'

type Handler<C extends InvokeChannel> = (
  ...args: InvokeArgs<C>
) => InvokeResult<C> | Promise<InvokeResult<C>>

function handle<C extends InvokeChannel>(channel: C, handler: Handler<C>): void {
  ipcMain.handle(channel, (_event, ...args) => handler(...(args as InvokeArgs<C>)))
}

export function registerIpcHandlers(): void {
  handle('app:info', () => ({
    name: app.getName(),
    version: app.getVersion(),
    platform: process.platform,
    versions: {
      electron: process.versions.electron,
      chrome: process.versions.chrome,
      node: process.versions.node,
    },
  }))

  handle('dialog:pickFolder', async () => {
    const window = BrowserWindow.getFocusedWindow()
    const options: Electron.OpenDialogOptions = {
      properties: ['openDirectory', 'createDirectory'],
    }
    const result = window
      ? await dialog.showOpenDialog(window, options)
      : await dialog.showOpenDialog(options)
    return result.canceled ? null : (result.filePaths[0] ?? null)
  })

  handle('shell:openPath', async (path) => {
    const error = await shell.openPath(path)
    if (error) throw new Error(error)
  })

  handle('agents:status', (refresh) => detectAll(refresh))

  handle('agents:login', async (agentId, cols, rows) => {
    const agent = getAgent(agentId)
    const cliPath = await resolveCli(agentId)
    return openTerminal(cliPath, agent.loginArgs, cols, rows)
  })

  handle('session:create', (agentId, cwd) => createSession(agentId, cwd))
  handle('session:prompt', (sessionId, text) => {
    // Não aguardamos o turno inteiro: o progresso chega por `session:event`.
    void getSession(sessionId).prompt(text)
  })
  handle('session:cancel', (sessionId) => getSession(sessionId).cancel())
  handle('session:permission', (sessionId, requestId, optionId) =>
    getSession(sessionId).respondPermission(requestId, optionId),
  )
  handle('session:close', (sessionId) => closeSession(sessionId))

  handle('terminal:input', (id, data) => writeTerminal(id, data))
  handle('terminal:resize', (id, cols, rows) => resizeTerminal(id, cols, rows))
  handle('terminal:kill', (id) => killTerminal(id))
}
