import { join } from 'node:path'
import { app, BrowserWindow, safeStorage } from 'electron'
import { getDb } from './db'
import { ProjectManager } from './projects/ProjectManager'
import { SecretStore } from './secrets/SecretStore'
import { SessionManager } from './sessions/SessionManager'
import { SessionRepo } from './sessions/SessionRepo'

/** Instâncias únicas do processo main, criadas após `app.whenReady()`. */
export interface Services {
  projects: ProjectManager
  secrets: SecretStore
  sessions: SessionManager
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
    send: (channel, payload) => {
      for (const window of BrowserWindow.getAllWindows()) window.webContents.send(channel, payload)
    },
  })
  services = { projects, secrets, sessions }
  return services
}

export function getServices(): Services {
  if (!services) throw new Error('Serviços ainda não inicializados.')
  return services
}
