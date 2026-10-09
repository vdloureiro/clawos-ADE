import { join } from 'node:path'
import { app, BrowserWindow, dialog, shell } from 'electron'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import { closeDb } from './db'
import { registerIpcHandlers } from './ipc'
import { buildMenu } from './menu'
import { getServices, initServices } from './services'
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
    // No Linux o ícone da janela vem daqui (macOS e Windows usam o do pacote).
    ...(process.platform === 'linux' && { icon: join(__dirname, '../../resources/icon.png') }),
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

  initServices()
  registerIpcHandlers()
  buildMenu()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

let quitConfirmed = false

// Pergunta antes de sair se houver agentes rodando.
app.on('before-quit', (event) => {
  if (quitConfirmed) return
  const active = getServices().sessions.activeCount()
  if (active === 0) return
  const choice = dialog.showMessageBoxSync({
    type: 'question',
    buttons: ['Sair', 'Cancelar'],
    defaultId: 1,
    cancelId: 1,
    message: `${active === 1 ? 'Há 1 sessão ativa' : `Há ${active} sessões ativas`}.`,
    detail: 'Os agentes serão encerrados. O histórico das conversas fica salvo.',
  })
  if (choice === 1) event.preventDefault()
  else quitConfirmed = true
})

app.on('will-quit', () => {
  getServices().sessions.stopAll()
  killAllTerminals()
  closeDb()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
