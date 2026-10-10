/**
 * Abre a sessão ACP de uma conversa: retoma a anterior quando possível e, se o agente
 * não a conhecer (ex.: o Claude só grava a sessão após a primeira mensagem), cria uma
 * nova em vez de falhar para sempre com "Resource not found".
 */
export interface SessionRequests {
  resume?: (sessionId: string) => Promise<unknown>
  /** `session/load`: reenvia o histórico; quem chama deve descartar esses updates. */
  load?: (sessionId: string) => Promise<unknown>
  create: () => Promise<{ sessionId: string }>
}

export interface OpenedSession {
  sessionId: string
  /** true quando havia uma sessão anterior e ela não pôde ser retomada. */
  contextLost: boolean
  /** true quando foi criada uma sessão nova (o id precisa ser persistido). */
  created: boolean
}

/** Código JSON-RPC "Resource not found" do ACP. */
const RESOURCE_NOT_FOUND = -32002

export function isSessionNotFound(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const { code, message } = error as { code?: unknown; message?: unknown }
  return (
    code === RESOURCE_NOT_FOUND ||
    (typeof message === 'string' && /resource not found|session not found/i.test(message))
  )
}

export async function openSession(
  previousId: string | null,
  requests: SessionRequests,
): Promise<OpenedSession> {
  if (previousId) {
    const reopen = requests.resume ?? requests.load
    if (reopen) {
      try {
        await reopen(previousId)
        return { sessionId: previousId, contextLost: false, created: false }
      } catch (error) {
        if (!isSessionNotFound(error)) throw error
      }
    }
  }
  const { sessionId } = await requests.create()
  return { sessionId, contextLost: previousId !== null, created: true }
}
