import { BrowserWindow } from 'electron'
import type { AgentId, SessionEvent, SessionInfo } from '@shared/types'
import { AgentSession } from './AgentSession'

/** Sessões ativas. Continuam vivas independentemente do que a UI estiver mostrando. */
const sessions = new Map<string, AgentSession>()

function broadcast(sessionId: string, event: SessionEvent): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send('session:event', { sessionId, event })
  }
}

export function createSession(agentId: AgentId, cwd: string): SessionInfo {
  // `id` só existe após o construtor; o emit é chamado depois disso.
  const session: AgentSession = new AgentSession(agentId, cwd, (event) =>
    broadcast(session.id, event),
  )
  sessions.set(session.id, session)
  void session.start()
  return session.info
}

export function getSession(id: string): AgentSession {
  const session = sessions.get(id)
  if (!session) throw new Error(`Sessão não encontrada: ${id}`)
  return session
}

export function closeSession(id: string): void {
  sessions.get(id)?.close()
  sessions.delete(id)
}

export function closeAllSessions(): void {
  for (const id of [...sessions.keys()]) closeSession(id)
}
