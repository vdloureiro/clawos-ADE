import { join } from 'node:path'
import { app, BrowserWindow, Notification, safeStorage } from 'electron'
import type { SessionInfo } from '@shared/types'
import { globalMcpNames } from './agents/detect'
import { getDb } from './db'
import { LayoutRepo } from './layouts/LayoutRepo'
import { currentBranch } from './projects/files'
import { ProjectManager } from './projects/ProjectManager'
import { SecretStore } from './secrets/SecretStore'
import { SessionManager } from './sessions/SessionManager'
import { SessionRepo } from './sessions/SessionRepo'

/** Instâncias únicas do processo main, criadas após `app.whenReady()`. */
export interface Services {
  projects: ProjectManager
  secrets: SecretStore
  sessions: SessionManager
  layouts: LayoutRepo
}

function sendToAll(channel: string, payload: unknown): void {
  for (const window of BrowserWindow.getAllWindows()) window.webContents.send(channel, payload)
}

/** Notificação do SO quando a janela não está em foco; o clique abre a sessão. */
function notify(session: SessionInfo, kind: 'finished' | 'permission', detail: string): void {
  const focused = BrowserWindow.getAllWindows().some((w) => w.isFocused())
  if (focused || !Notification.isSupported()) return
  const notification = new Notification({
    title:
      kind === 'permission'
        ? `${session.title} — aguardando aprovação`
        : `${session.title} — concluído`,
    body: detail.replace(/\s+/g, ' ').slice(0, 180),
    silent: false,
  })
  notification.on('click', () => {
    const window = BrowserWindow.getAllWindows()[0]
    if (window) {
      if (window.isMinimized()) window.restore()
      window.show()
      window.focus()
    }
    sendToAll('session:focus', { projectId: session.projectId, sessionId: session.id })
  })
  notification.show()
}

let services: Services | null = null

export function initServices(): Services {
  const db = getDb()
  const projects = new ProjectManager(db)
  const secrets = new SecretStore(db, {
    isAvailable: () => safeStorage.isEncryptionAvailable(),
    encrypt: (value) => safeStorage.encryptString(value),
    decrypt: (value) => safeStorage.decryptString(value),
  })
  const sessions = new SessionManager({
    projects,
    secrets,
    repo: new SessionRepo(db),
    generatedRoot: join(app.getPath('userData'), 'generated'),
    send: sendToAll,
    notify,
    branchOf: currentBranch,
    globalMcpNames,
  })
  services = { projects, secrets, sessions, layouts: new LayoutRepo(db) }
  return services
}

export function getServices(): Services {
  if (!services) throw new Error('Serviços ainda não inicializados.')
  return services
}
