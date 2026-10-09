import { join } from 'node:path'
import { app, BrowserWindow, shell } from 'electron'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import { closeAllSessions } from './agents/sessions'
import { registerIpcHandlers } from './ipc'
import { killAllTerminals } from './terminals/terminals'

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    show: false,
    title: 'Clawos',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    backgroundColor: '#0b0b0c',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  window.on('ready-to-show', () => window.show())

  // Links externos abrem no navegador do sistema, nunca dentro do app.
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) void shell.openExternal(url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    void window.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('dev.clawos.app')

  app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window))

  registerIpcHandlers()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('will-quit', () => {
  closeAllSessions()
  killAllTerminals()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
