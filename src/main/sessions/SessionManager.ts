import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { applyEvent, createChatState, type ChatState } from '@shared/chat'
import type {
  AgentId,
  MergeResult,
  SessionEvent,
  SessionInfo,
  SessionMode,
  SessionSummary,
  WorktreeDiff,
} from '@shared/types'
import { AgentSession } from '../agents/AgentSession'
import type { GlobalMcp } from '../agents/registry'
import { compile, type CompiledSession } from '../compiler/ConfigCompiler'
import { materialize } from '../compiler/materialize'
import type { ProjectManager } from '../projects/ProjectManager'
import type { SecretStore } from '../secrets/SecretStore'
import type { WorktreeManager } from '../worktrees/WorktreeManager'
import { EditTracker } from './EditTracker'
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
  worktrees: WorktreeManager
  /** MCPs globais do usuário no agente (o compilador os desliga na sessão). */
  globalMcps: (agentId: AgentId) => Promise<GlobalMcp[]>
}

const NEW_TITLE = 'Nova conversa'

/**
 * Dono das sessões: cria, compila a configuração do projeto, mantém o estado do chat
 * agregado em memória (para persistir e para o renderer reabrir), e salva no SQLite.
 * Sessões continuam vivas independentemente do projeto que a UI está mostrando.
 */
export class SessionManager {
  private readonly live = new Map<string, LiveSession>()
  private readonly edits = new EditTracker()

  constructor(private readonly deps: SessionManagerDeps) {}

  list(projectId: string): SessionSummary[] {
    return this.deps.repo.list(projectId).map(({ summary }) => this.withLiveStatus(summary))
  }

  listAll(): SessionSummary[] {
    return this.deps.repo.listAll().map(({ summary }) => this.withLiveStatus(summary))
  }

  async create(
    projectId: string,
    agentId?: AgentId,
    mode: SessionMode = 'shared',
  ): Promise<SessionSummary> {
    const project = this.deps.projects.get(projectId)
    const id = randomUUID()
    const worktree =
      mode === 'worktree' ? await this.deps.worktrees.create(project.path, id) : undefined
    this.deps.repo.create({
      id,
      projectId,
      agentId: agentId ?? project.defaultAgent,
      title: NEW_TITLE,
      worktree,
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

  /** Reinicia o processo do agente (após erro ou queda), retomando a conversa. */
  restart(id: string): ChatState {
    this.stop(id)
    return this.open(id)
  }

  /** Encerra o processo do agente; o histórico fica salvo. */
  stop(id: string): void {
    const live = this.live.get(id)
    if (!live) return
    live.agent?.close()
    this.flush(id)
    this.live.delete(id)
    this.edits.forget(id)
    this.changed(live.chat.info.projectId)
  }

  /** Apaga a conversa; numa sessão em worktree, descarta também a worktree e a branch. */
  async delete(id: string): Promise<void> {
    const stored = this.deps.repo.get(id)
    const live = this.live.get(id)
    if (live) {
      live.agent?.close()
      if (live.saveTimer) clearTimeout(live.saveTimer)
      this.live.delete(id)
    }
    this.edits.forget(id)
    if (stored.worktree) await this.deps.worktrees.discard(stored.projectPath, stored.worktree)
    this.deps.repo.delete(id)
    this.changed(stored.summary.projectId)
  }

  // -------------------------------------------------------------------------
  // Worktrees

  async worktreeDiff(id: string): Promise<WorktreeDiff> {
    return this.deps.worktrees.diff(this.requireWorktree(id).worktree)
  }

  async worktreeMerge(id: string): Promise<MergeResult> {
    const { worktree, projectPath, summary } = this.requireWorktree(id)
    const title = this.live.get(id)?.chat.info.title ?? summary.title
    const result = await this.deps.worktrees.merge(projectPath, worktree, title)
    const conflicts =
      result.conflicts.length > 0 ? ` Arquivos em conflito: ${result.conflicts.join(', ')}.` : ''
    this.handleEvent(id, { type: 'notice', text: `${result.message}${conflicts}` })
    return result
  }

  worktreePath(id: string): string {
    return this.requireWorktree(id).worktree.path
  }

  private requireWorktree(id: string) {
    const stored = this.deps.repo.get(id)
    if (!stored.worktree) throw new Error('Esta sessão não usa worktree isolada.')
    return { ...stored, worktree: stored.worktree }
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
    const globalMcp = await this.deps.globalMcps(summary.agentId)
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
      globalMcp,
    })
    materialize(join(this.deps.generatedRoot, summary.id), compiled)
    return compiled
  }

  private handleEvent(id: string, event: SessionEvent): void {
    const live = this.live.get(id)
    if (!live) return
    live.chat = applyEvent(live.chat, event)
    this.deps.send('session:event', { sessionId: id, event })
    this.trackEdits(id, live, event)

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

  /** Avisa quando outra sessão na mesma pasta já editou o arquivo que esta acabou de editar. */
  private trackEdits(id: string, live: LiveSession, event: SessionEvent): void {
    const toolCallId =
      event.type === 'tool_call_update'
        ? event.toolCallId
        : event.type === 'tool_call_start'
          ? event.toolCall.id
          : null
    if (!toolCallId) return
    const item = live.chat.items.find((i) => i.kind === 'tool' && i.id === toolCallId)
    if (item?.kind !== 'tool') return
    const { toolCall } = item
    if (toolCall.status !== 'completed' || !['edit', 'delete', 'move'].includes(toolCall.kind))
      return
    if (this.deps.repo.get(id).worktree) return // worktree isolada: sem risco

    const files = new Set([
      ...toolCall.locations,
      ...toolCall.content.flatMap((c) => (c.type === 'diff' ? [c.path] : [])),
    ])
    for (const file of files) {
      for (const otherId of this.edits.record(file, id)) {
        const other = this.live.get(otherId)
        if (!other || other.chat.info.cwd !== live.chat.info.cwd) continue
        const text = (title: string) =>
          `Atenção: ${file} também foi editado pela sessão "${title}" nesta mesma pasta. Para trabalho em paralelo no mesmo código, prefira uma worktree isolada.`
        this.handleEvent(id, { type: 'notice', text: text(other.chat.info.title) })
        this.handleEvent(otherId, { type: 'notice', text: text(live.chat.info.title) })
      }
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
