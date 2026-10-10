/**
 * Contrato tipado de IPC entre main e renderer.
 * Todo canal novo é declarado aqui; preload e main só aceitam canais desta lista.
 */
import type { ChatState } from './chat'
import type { ProjectConfig } from './project'
import type {
  AgentId,
  AgentStatus,
  LayoutPreset,
  MergeResult,
  FolderInspection,
  NewProjectInput,
  Project,
  SessionEvent,
  SessionMode,
  SessionSummary,
  WorktreeDiff,
} from './types'

export interface AppInfo {
  name: string
  version: string
  platform: NodeJS.Platform
  versions: { electron: string; chrome: string; node: string }
}

export interface ProjectConfigResult {
  config: ProjectConfig
  error: string | null
  exists: boolean
}

export interface McpTestResult {
  ok: boolean
  tools: string[]
  error: string | null
}

/** Comandos disparados pelo menu da aplicação. */
export type AppCommand =
  | 'new-agent'
  | 'add-project'
  | 'close-panel'
  | 'stop-agent'
  | 'palette'
  | 'settings'
  | 'project-settings'
  | 'toggle-theme'
  | `project-${number}`

/** Canais request/response (renderer → main). */
export interface InvokeChannels {
  'app:info': { args: []; result: AppInfo }
  'dialog:pickFolder': { args: [title?: string]; result: string | null }
  /** Abre um arquivo no app padrão do sistema. */
  'shell:openPath': { args: [path: string]; result: void }

  'agents:status': { args: [refresh?: boolean]; result: AgentStatus[] }
  /** Abre um terminal rodando o comando oficial de login do agente. Retorna o id do terminal. */
  'agents:login': { args: [agentId: AgentId, cols: number, rows: number]; result: string }

  'projects:list': { args: []; result: Project[] }
  /** Sem caminho, abre o seletor de pasta. Retorna null se o usuário cancelar. */
  'projects:add': { args: [path?: string]; result: Project | null }
  /** Analisa uma pasta para o assistente de novo projeto. */
  'projects:inspect': { args: [path: string]; result: FolderInspection }
  'projects:create': { args: [input: NewProjectInput]; result: Project }
  'projects:update': {
    args: [id: string, patch: { name?: string; color?: string }]
    result: Project
  }
  'projects:reorder': { args: [ids: string[]]; result: void }
  'projects:remove': { args: [id: string]; result: void }
  'projects:getConfig': { args: [id: string]; result: ProjectConfigResult }
  'projects:saveConfig': { args: [id: string, config: ProjectConfig]; result: void }
  'projects:testMcp': { args: [id: string, serverName: string]; result: McpTestResult }
  /** Caminhos relativos dos arquivos do projeto (para o `@` do chat). */
  'projects:files': { args: [id: string]; result: string[] }

  'layouts:get': { args: [projectId: string]; result: string | null }
  'layouts:save': { args: [projectId: string, json: string]; result: void }
  'presets:list': { args: []; result: LayoutPreset[] }
  'presets:save': { args: [name: string, json: string]; result: LayoutPreset }
  'presets:delete': { args: [id: string]; result: void }

  /** Só nomes: valores de segredos nunca chegam ao renderer. */
  'secrets:list': { args: [projectId: string]; result: string[] }
  'secrets:set': { args: [projectId: string, name: string, value: string]; result: void }
  'secrets:delete': { args: [projectId: string, name: string]; result: void }

  'sessions:list': { args: [projectId: string]; result: SessionSummary[] }
  'sessions:listAll': { args: []; result: SessionSummary[] }
  'session:create': {
    args: [projectId: string, agentId?: AgentId, mode?: SessionMode]
    result: SessionSummary
  }
  'session:open': { args: [sessionId: string]; result: ChatState }
  'session:prompt': {
    args: [sessionId: string, text: string, attachments?: string[]]
    result: void
  }
  'session:cancel': { args: [sessionId: string]; result: void }
  'session:permission': {
    args: [sessionId: string, requestId: string, optionId: string | null]
    result: void
  }
  'session:rename': { args: [sessionId: string, title: string]; result: void }
  'session:stop': { args: [sessionId: string]; result: void }
  'session:restart': { args: [sessionId: string]; result: ChatState }
  'session:delete': { args: [sessionId: string]; result: void }

  'worktree:diff': { args: [sessionId: string]; result: WorktreeDiff }
  'worktree:merge': { args: [sessionId: string]; result: MergeResult }
  /** Abre a pasta da worktree no editor (VS Code/Cursor se instalados) ou no Finder. */
  'worktree:openEditor': { args: [sessionId: string]; result: void }

  'terminal:input': { args: [terminalId: string, data: string]; result: void }
  'terminal:resize': { args: [terminalId: string, cols: number, rows: number]; result: void }
  'terminal:kill': { args: [terminalId: string]; result: void }
}

/** Canais de evento (main → renderer). */
export interface EventChannels {
  'session:event': { sessionId: string; event: SessionEvent }
  /** A lista de sessões de um projeto mudou (nova, título, status). */
  'sessions:changed': { projectId: string }
  /** Comando do menu da aplicação (atalhos de teclado). */
  'app:command': { command: AppCommand }
  /** Clique numa notificação: trazer esta sessão para o foco. */
  'session:focus': { projectId: string; sessionId: string }
  'terminal:data': { terminalId: string; data: string }
  'terminal:exit': { terminalId: string; exitCode: number }
}

export type InvokeChannel = keyof InvokeChannels
export type InvokeArgs<C extends InvokeChannel> = InvokeChannels[C]['args']
export type InvokeResult<C extends InvokeChannel> = InvokeChannels[C]['result']
export type EventChannel = keyof EventChannels

export const EVENT_CHANNELS: readonly EventChannel[] = [
  'session:event',
  'sessions:changed',
  'session:focus',
  'app:command',
  'terminal:data',
  'terminal:exit',
]

/** API exposta ao renderer em `window.clawos`. */
export interface ClawosApi {
  invoke<C extends InvokeChannel>(channel: C, ...args: InvokeArgs<C>): Promise<InvokeResult<C>>
  /** Assina um evento do main. Retorna a função para cancelar a assinatura. */
  on<C extends EventChannel>(channel: C, listener: (payload: EventChannels[C]) => void): () => void
  /** Caminho absoluto de um arquivo solto via drag-and-drop. */
  pathForFile(file: File): string
}
