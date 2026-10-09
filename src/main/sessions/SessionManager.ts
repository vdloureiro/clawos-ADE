import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { applyEvent, createChatState, type ChatState } from '@shared/chat'
import type { AgentId, SessionEvent, SessionInfo, SessionSummary } from '@shared/types'
import { AgentSession } from '../agents/AgentSession'
import { compile, type CompiledSession } from '../compiler/ConfigCompiler'
import { materialize } from '../compiler/materialize'
import type { ProjectManager } from '../projects/ProjectManager'
import type { SecretStore } from '../secrets/SecretStore'
import type { SessionRepo } from './SessionRepo'

interface LiveSession {
  agent: AgentSession | null
  chat: ChatState
  saveTimer: NodeJS.Timeout | null
}

export interface SessionManagerDeps {
  projects: ProjectManager
  secrets: SecretStore
  repo: SessionRepo
  /** Diretório (fora dos projetos) para arquivos gerados por sessão. */
  generatedRoot: string
  /** Envia um evento para o renderer. */
  send: (channel: 'session:event' | 'sessions:changed', payload: unknown) => void
  /** Avisa o usuário (notificação do SO) que uma sessão terminou ou precisa de aprovação. */
  notify: (session: SessionInfo, kind: 'finished' | 'permission', detail: string) => void
  /** Branch git atual da pasta, ou null. */
  branchOf: (cwd: string) => Promise<string | null>
  /** MCPs globais do usuário no agente (o compilador os desliga na sessão). */
  globalMcpNames: (agentId: AgentId) => Promise<string[]>
}

const NEW_TITLE = 'Nova conversa'

/**
 * Dono das sessões: cria, compila a configuração do projeto, mantém o estado do chat
 * agregado em memória (para persistir e para o renderer reabrir), e salva no SQLite.
 * Sessões continuam vivas independentemente do projeto que a UI está mostrando.
 */
export class SessionManager {
  private readonly live = new Map<string, LiveSession>()

  constructor(private readonly deps: SessionManagerDeps) {}

  list(projectId: string): SessionSummary[] {
    return this.deps.repo.list(projectId).map(({ summary }) => this.withLiveStatus(summary))
  }

  listAll(): SessionSummary[] {
    return this.deps.repo.listAll().map(({ summary }) => this.withLiveStatus(summary))
  }

  create(projectId: string, agentId?: AgentId): SessionSummary {
    const project = this.deps.projects.get(projectId)
    const id = randomUUID()
    this.deps.repo.create({
      id,
      projectId,
      agentId: agentId ?? project.defaultAgent,
      title: NEW_TITLE,
    })
    this.deps.projects.touch(projectId)
    const { summary } = this.deps.repo.get(id)
    this.startAgent(summary, null, [])
    this.changed(projectId)
    return this.withLiveStatus(summary)
  }

  /** Estado do chat para exibir. Sessões encerradas são retomadas ao abrir. */
  open(id: string): ChatState {
    const existing = this.live.get(id)
    if (existing) return existing.chat
    const { summary, acpSessionId } = this.deps.repo.get(id)
    const items = this.deps.repo.loadItems(id)
    this.startAgent(summary, acpSessionId, items)
    this.changed(summary.projectId)
    return this.live.get(id)!.chat
  }

  prompt(id: string, text: string, attachments: string[] = []): void {
    const session = this.requireAgent(id)
    const live = this.live.get(id)!
    if (live.chat.info.title === NEW_TITLE) {
      const title = text.replace(/\s+/g, ' ').trim().slice(0, 60)
      live.chat = { ...live.chat, info: { ...live.chat.info, title } }
      this.deps.repo.update(id, { title })
      this.changed(live.chat.info.projectId)
    }
    void session.prompt(text, attachments)
  }

  cancel(id: string): Promise<void> {
    return this.requireAgent(id).cancel()
  }

  respondPermission(id: string, requestId: string, optionId: string | null): void {
    this.requireAgent(id).respondPermission(requestId, optionId)
  }

  rename(id: string, title: string): void {
    const clean = title.trim()
    if (!clean) return
    this.deps.repo.update(id, { title: clean })
    const live = this.live.get(id)
    if (live) live.chat = { ...live.chat, info: { ...live.chat.info, title: clean } }
    this.changed(this.deps.repo.get(id).summary.projectId)
  }

  /** Encerra o processo do agente; o histórico fica salvo. */
  stop(id: string): void {
    const live = this.live.get(id)
    if (!live) return
    live.agent?.close()
    this.flush(id)
    this.live.delete(id)
    this.changed(live.chat.info.projectId)
  }

  delete(id: string): void {
    const { summary } = this.deps.repo.get(id)
    const live = this.live.get(id)
    if (live) {
      live.agent?.close()
      if (live.saveTimer) clearTimeout(live.saveTimer)
      this.live.delete(id)
    }
    this.deps.repo.delete(id)
    this.changed(summary.projectId)
  }

  activeCount(): number {
    return [...this.live.values()].filter((l) => l.agent).length
  }

  stopAll(): void {
    for (const id of [...this.live.keys()]) this.stop(id)
  }

  // -------------------------------------------------------------------------

  private startAgent(
    summary: SessionSummary,
    resumeAcpSessionId: string | null,
    items: ChatState['items'],
  ): void {
    const live: LiveSession = {
      agent: null,
      chat: { ...createChatState(summary), items },
      saveTimer: null,
    }
    this.live.set(summary.id, live)

    const emit = (event: SessionEvent) => this.handleEvent(summary.id, event)

    void this.deps.branchOf(summary.cwd).then((branch) => {
      if (branch === summary.branch) return
      this.deps.repo.update(summary.id, { branch })
      this.changed(summary.projectId)
    })

    void this.compileFor(summary).then(
      (compiled) => {
        if (this.live.get(summary.id) !== live) return // fechada enquanto compilava
        live.agent = new AgentSession({
          id: summary.id,
          agentId: summary.agentId,
          cwd: summary.cwd,
          compiled,
          resumeAcpSessionId,
          emit,
          onAcpSessionId: (acpSessionId) => this.deps.repo.update(summary.id, { acpSessionId }),
        })
        void live.agent.start()
      },
      (error: Error) => {
        emit({ type: 'error', message: error.message })
        emit({ type: 'status_change', status: 'error' })
      },
    )
  }

  private async compileFor(summary: SessionSummary): Promise<CompiledSession> {
    const project = this.deps.projects.get(summary.projectId)
    const globalMcpNames = await this.deps.globalMcpNames(summary.agentId)
    const { config, error } = this.deps.projects.readConfig(project.path)
    if (error) throw new Error(error)
    const compiled = compile({
      agentId: summary.agentId,
      projectPath: project.path,
      config,
      secret: (name) => this.deps.secrets.get(project.id, name),
      readText: (path) => {
        try {
          return readFileSync(path, 'utf8')
        } catch {
          return null
        }
      },
      generatedDir: join(this.deps.generatedRoot, summary.id),
      globalMcpNames,
    })
    materialize(join(this.deps.generatedRoot, summary.id), compiled)
    return compiled
  }

  private handleEvent(id: string, event: SessionEvent): void {
    const live = this.live.get(id)
    if (!live) return
    live.chat = applyEvent(live.chat, event)
    this.deps.send('session:event', { sessionId: id, event })

    if (event.type === 'status_change') {
      this.deps.repo.update(id, { status: event.status })
      this.changed(live.chat.info.projectId)
    }
    if (event.type === 'permission_request') {
      this.deps.notify(live.chat.info, 'permission', event.title)
    }
    if (event.type === 'turn_end' && event.stopReason !== 'cancelled') {
      const last = live.chat.items.findLast((i) => i.kind === 'assistant')
      this.deps.notify(
        live.chat.info,
        'finished',
        last?.kind === 'assistant' ? last.text : 'Turno concluído.',
      )
    }
    if (event.type === 'turn_end' || event.type === 'error') {
      this.flush(id)
    } else {
      this.scheduleSave(id)
    }
  }

  private scheduleSave(id: string): void {
    const live = this.live.get(id)
    if (!live || live.saveTimer) return
    live.saveTimer = setTimeout(() => this.flush(id), 1000)
  }

  private flush(id: string): void {
    const live = this.live.get(id)
    if (!live) return
    if (live.saveTimer) clearTimeout(live.saveTimer)
    live.saveTimer = null
    this.deps.repo.saveItems(id, live.chat.items)
  }

  private requireAgent(id: string): AgentSession {
    const agent = this.live.get(id)?.agent
    if (!agent) throw new Error('A sessão não está ativa.')
    return agent
  }

  private withLiveStatus(summary: SessionSummary): SessionSummary {
    const live = this.live.get(summary.id)
    if (!live) return summary
    return {
      ...summary,
      title: live.chat.info.title,
      status: live.chat.status,
      live: Boolean(live.agent),
    }
  }

  private changed(projectId: string): void {
    this.deps.send('sessions:changed', { projectId })
  }
}
