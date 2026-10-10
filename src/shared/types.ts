/**
 * Tipos compartilhados entre main e renderer.
 *
 * A UI só conhece os eventos normalizados daqui (`SessionEvent`), nunca o formato
 * bruto de cada agente. A tradução ACP → SessionEvent vive em `main/agents/normalize.ts`.
 */
export type { AppInfo, ClawosApi } from './ipc'
export type { ChatItem, ChatState } from './chat'

export type { AgentId } from './agents'
import type { AgentId } from './agents'

// ---------------------------------------------------------------------------
// Status dos agentes (detecção de CLI)
// ---------------------------------------------------------------------------

export interface AgentStatus {
  id: AgentId
  name: string
  installed: boolean
  version: string | null
  /** `null` quando não dá para saber sem abrir uma sessão. */
  loggedIn: boolean | null
  /** Detalhe legível (ex.: método de login, erro de detecção). */
  detail: string | null
  installHint: string
  installUrl: string
}

// ---------------------------------------------------------------------------
// Sessões
// ---------------------------------------------------------------------------

export type SessionStatus =
  'starting' | 'ready' | 'working' | 'awaiting_permission' | 'error' | 'closed'

export type ToolKind =
  | 'read'
  | 'edit'
  | 'delete'
  | 'move'
  | 'search'
  | 'execute'
  | 'think'
  | 'fetch'
  | 'switch_mode'
  | 'other'

export type ToolStatus = 'pending' | 'in_progress' | 'completed' | 'failed'

export type ToolContent =
  | { type: 'text'; text: string }
  | { type: 'diff'; path: string; oldText: string | null; newText: string }
  | { type: 'terminal'; terminalId: string }

export interface ToolCallView {
  id: string
  title: string
  kind: ToolKind
  status: ToolStatus
  content: ToolContent[]
  locations: string[]
  /** Entrada bruta da ferramenta (ex.: `{ command }` no Bash), para a visão expandida. */
  input?: unknown
  output?: string
}

export interface PlanEntryView {
  content: string
  status: 'pending' | 'in_progress' | 'completed'
  priority: 'high' | 'medium' | 'low'
}

export type PermissionKind = 'allow_once' | 'allow_always' | 'reject_once' | 'reject_always'

export interface PermissionOptionView {
  id: string
  name: string
  kind: PermissionKind
}

export type StopReason = 'end_turn' | 'max_tokens' | 'max_turn_requests' | 'refusal' | 'cancelled'

/**
 * Opção de configuração da sessão exposta pelo agente (ACP `configOptions`): modelo,
 * modo de permissão, nível de raciocínio… Só as do tipo lista de escolha.
 */
export interface SessionConfigOption {
  id: string
  name: string
  /** `model`, `mode`, `thought_level`… (categorias do ACP). */
  category: string | null
  currentValue: string
  options: { value: string; name: string; description?: string }[]
}

/** Valores escolhidos pelo usuário, por categoria (ex.: `{ model: 'sonnet', mode: 'default' }`). */
export type SessionConfigChoice = Partial<Record<string, string>>

export type SessionEvent =
  | { type: 'status_change'; status: SessionStatus; detail?: string }
  | { type: 'user_message'; id: string; text: string; attachments?: string[] }
  | { type: 'text_delta'; messageId: string; text: string }
  | { type: 'thought_delta'; messageId: string; text: string }
  | { type: 'tool_call_start'; toolCall: ToolCallView }
  | { type: 'tool_call_update'; toolCallId: string; patch: Partial<Omit<ToolCallView, 'id'>> }
  | { type: 'plan'; entries: PlanEntryView[] }
  | {
      type: 'permission_request'
      requestId: string
      toolCallId: string
      title: string
      options: PermissionOptionView[]
    }
  | { type: 'permission_resolved'; requestId: string; optionId: string | null }
  | { type: 'turn_end'; stopReason: StopReason }
  /** Aviso informativo (ex.: limitações de configuração deste agente). */
  | { type: 'notice'; text: string }
  | { type: 'config_options'; options: SessionConfigOption[] }
  | { type: 'error'; message: string }

export interface SessionInfo {
  id: string
  projectId: string
  agentId: AgentId
  cwd: string
  title: string
}

export type SessionMode = 'shared' | 'worktree'

/** Linha da lista de conversas de um projeto. `live` = processo do agente rodando. */
export interface SessionSummary extends SessionInfo {
  mode: SessionMode
  /** Branch de origem da worktree (modo `worktree`). */
  baseBranch: string | null
  /** Branch git da pasta da sessão, quando houver. */
  branch: string | null
  status: SessionStatus
  live: boolean
  createdAt: number
  updatedAt: number
}

// ---------------------------------------------------------------------------
// Projetos
// ---------------------------------------------------------------------------

export interface Project {
  id: string
  name: string
  path: string
  color: string
  defaultAgent: AgentId
  createdAt: number
  lastOpenedAt: number | null
  sortOrder: number
}

export const PROJECT_COLORS = [
  '#f97316',
  '#3b82f6',
  '#22c55e',
  '#a855f7',
  '#ec4899',
  '#eab308',
  '#14b8a6',
  '#ef4444',
] as const

export interface LayoutPreset {
  id: string
  name: string
  /** `SerializedDockview` em JSON. */
  json: string
}

// ---------------------------------------------------------------------------
// Worktrees

export interface WorktreeFile {
  path: string
  status: 'A' | 'M' | 'D'
  oldText: string | null
  newText: string | null
  binary: boolean
}

export interface WorktreeDiff {
  branch: string
  baseBranch: string
  files: WorktreeFile[]
}

export interface MergeResult {
  ok: boolean
  message: string
  conflicts: string[]
}

// ---------------------------------------------------------------------------
// Assistente de novo projeto

export interface FolderInspection {
  path: string
  suggestedName: string
  isGit: boolean
  /** A pasta já está na lista do Clawos. */
  alreadyAdded: Project | null
  /** project.yaml existente (config vazia se não houver). */
  config: { config: import('./project').ProjectConfig; error: string | null; exists: boolean }
  /** Arquivos de instruções na raiz (CLAUDE.md, AGENTS.md, GEMINI.md). */
  instructionFiles: string[]
  /** Skills encontradas no projeto (./.agents/skills/x, ./.claude/skills/y…). */
  skills: string[]
}

export interface NewProjectInput {
  path: string
  name: string
  color: string
  config: import('./project').ProjectConfig
  /** Segredos a guardar no cofre do sistema: nome → valor. */
  secrets: Record<string, string>
  /** Gravar .clawos/project.yaml (só quando há algo a configurar). */
  writeConfig: boolean
}

// ---------------------------------------------------------------------------
// Tarefas

export type TaskStatus = 'todo' | 'doing' | 'done'
/** 1 = mais alta (P1) … 4 = sem prioridade (P4), como no Todoist. */
export type TaskPriority = 1 | 2 | 3 | 4

export interface Task {
  id: string
  projectId: string
  title: string
  notes: string
  status: TaskStatus
  priority: TaskPriority
  /** Data no formato AAAA-MM-DD. */
  dueDate: string | null
  sortOrder: number
  /** Conversa para a qual a tarefa foi delegada. */
  sessionId: string | null
  createdAt: number
  updatedAt: number
  completedAt: number | null
}

export interface NewTaskInput {
  projectId: string
  title: string
  notes?: string
  priority?: TaskPriority
  dueDate?: string | null
}

export type TaskPatch = Partial<
  Pick<Task, 'title' | 'notes' | 'status' | 'priority' | 'dueDate' | 'projectId'>
>
