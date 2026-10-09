/**
 * Tipos compartilhados entre main e renderer.
 *
 * A UI só conhece os eventos normalizados daqui (`SessionEvent`), nunca o formato
 * bruto de cada agente. A tradução ACP → SessionEvent vive em `main/agents/normalize.ts`.
 */
export type { AppInfo, ClawosApi } from './ipc'

export type AgentId = 'claude'

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

export type SessionEvent =
  | { type: 'status_change'; status: SessionStatus; detail?: string }
  | { type: 'user_message'; id: string; text: string }
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
  | { type: 'error'; message: string }

export interface SessionInfo {
  id: string
  agentId: AgentId
  cwd: string
}
