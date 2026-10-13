/**
 * Contrato tipado de IPC entre main e renderer.
 * Todo canal novo é declarado aqui; preload e main só aceitam canais desta lista.
 */
import type { ChatState } from './chat'
import type { McpServerConfig, ProjectConfig } from './project'
import type {
  AgentId,
  AgentStatus,
  FileContent,
  LayoutPreset,
  MergeResult,
  FolderInspection,
  NewProjectInput,
  PermissionDefault,
  ProjectFolder,
  RemoteStatus,
  SidebarArrangement,
  Project,
  SessionConfigOption,
  SessionEvent,
  SessionMode,
  SessionSummary,
  Task,
  TaskPatch,
  NewTaskInput,
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
  /** Id do catálogo cujo login é feito pelo Claude Code (o Clawos não testa). */
  claudeLogin?: string
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
  'shell:showItem': { args: [path: string]; result: void }
  /** Lê um arquivo para a aba de visualização. */
  'files:read': { args: [path: string]; result: FileContent }
  /** Caminhos citados pelo agente → absolutos, se existirem (null se não). */
  'files:resolve': { args: [paths: string[], cwd: string]; result: (string | null)[] }
  /** Salva a edição; `expectedMtime` (null = forçar) evita sobrescrever mudança externa. */
  'files:write': {
    args: [path: string, text: string, expectedMtime: number | null]
    result: { ok: true; mtime: number } | { ok: false; conflict: true; mtime: number }
  }
  'files:watch': { args: [path: string]; result: void }
  /** Pastas dentro de `path` (padrão: pasta do usuário), para escolher pasta pelo navegador. */
  'fs:listDirs': {
    args: [path: string | null]
    result: { path: string; parent: string | null; dirs: string[] }
  }
  // Acesso remoto (só pelo app desktop; bloqueados para aparelhos remotos)
  'remote:status': { args: []; result: RemoteStatus }
  'remote:setEnabled': { args: [enabled: boolean]; result: RemoteStatus }
  'remote:newPairing': { args: []; result: RemoteStatus }
  'remote:revoke': { args: [deviceId: string]; result: RemoteStatus }
  'remote:setupTailscale': { args: []; result: RemoteStatus }
  'remote:stopTailscale': { args: []; result: RemoteStatus }
  'files:unwatch': { args: [path: string]; result: void }

  'agents:status': { args: [refresh?: boolean]; result: AgentStatus[] }
  /** Abre um terminal rodando o comando oficial de login do agente. Retorna o id do terminal. */
  'agents:login': { args: [agentId: AgentId, cols: number, rows: number]; result: string }
  /**
   * Login de um MCP do catálogo que só o Claude Code pode fazer (ex.: Meta Ads): registra
   * o servidor no Claude Code, se preciso, e roda `claude mcp login`. Retorna o terminal.
   */
  'agents:mcpLogin': { args: [mcpId: string, cols: number, rows: number]; result: string }
  /** Roda o instalador oficial do CLI num terminal (id do terminal). */
  'agents:install': { args: [agentId: AgentId, cols: number, rows: number]; result: string }

  'projects:list': { args: []; result: Project[] }
  /** Sem caminho, abre o seletor de pasta. Retorna null se o usuário cancelar. */
  'projects:add': { args: [path?: string]; result: Project | null }
  /** Analisa uma pasta para o assistente de novo projeto. */
  'projects:inspect': { args: [path: string]; result: FolderInspection }
  'projects:create': { args: [input: NewProjectInput]; result: Project }
  'projects:update': {
    args: [
      id: string,
      patch: { name?: string; color?: string; permissionDefault?: PermissionDefault | null },
    ]
    result: Project
  }
  /** Ordem completa da barra lateral: pastas (com seus projetos) e projetos soltos. */
  'projects:arrange': { args: [items: SidebarArrangement]; result: void }
  'folders:list': { args: []; result: ProjectFolder[] }
  'folders:create': { args: [name: string]; result: ProjectFolder }
  'folders:update': {
    args: [id: string, patch: { name?: string; collapsed?: boolean }]
    result: ProjectFolder
  }
  /** Apaga a pasta (os projetos voltam soltos; nada é apagado do disco). */
  'folders:delete': { args: [id: string]; result: void }
  'projects:reorder': { args: [ids: string[]]; result: void }
  'projects:remove': { args: [id: string]; result: void }
  'projects:getConfig': { args: [id: string]; result: ProjectConfigResult }
  'projects:saveConfig': { args: [id: string, config: ProjectConfig]; result: void }
  'projects:testMcp': { args: [id: string, serverName: string]; result: McpTestResult }
  /** MCPs globais (de todos os projetos) e se estão ligados neste projeto. */
  'projects:sharedMcps': { args: [projectId: string]; result: { name: string; enabled: boolean }[] }
  'projects:setSharedMcp': {
    args: [projectId: string, name: string, enabled: boolean]
    result: void
  }
  // MCPs ativos em todos os projetos (Configurações do Clawos)
  'mcp:sharedList': {
    args: []
    result: { servers: Record<string, McpServerConfig>; secrets: string[] }
  }
  'mcp:sharedSave': {
    args: [name: string, server: McpServerConfig, secrets: Record<string, string>]
    result: void
  }
  'mcp:sharedRemove': { args: [name: string]; result: void }
  'mcp:sharedTest': { args: [name: string]; result: McpTestResult }
  /** Testa um MCP ainda não salvo (assistente de projeto), com os tokens digitados. */
  'mcp:testConfig': {
    args: [server: McpServerConfig, secrets: Record<string, string>, cwd: string | null]
    result: McpTestResult
  }
  /** Instala uma skill do catálogo na pasta do projeto; devolve o caminho para `skills`. */
  'skills:install': { args: [projectPath: string, id: string]; result: string }
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
  /** Escolhe arquivos para anexar à mensagem. */
  'dialog:pickFiles': { args: []; result: string[] }
  /** Arquivos copiados no Finder/Explorer (o colar do navegador só traz o nome). */
  'clipboard:filePaths': { args: []; result: string[] }
  /** Grava um conteúdo colado (ex.: print de tela) e devolve o caminho para anexar. */
  'attachments:save': { args: [name: string, data: Uint8Array]; result: string }
  /** Pede acesso ao microfone (macOS); true se liberado. */
  'media:microphone': { args: []; result: boolean }
  'session:setConfig': {
    args: [sessionId: string, configId: string, value: string]
    result: SessionConfigOption[]
  }
  'session:permission': {
    args: [sessionId: string, requestId: string, optionId: string | null]
    result: void
  }
  'session:rename': { args: [sessionId: string, title: string]; result: void }
  'session:stop': { args: [sessionId: string]; result: void }
  'session:restart': { args: [sessionId: string]; result: ChatState }
  'session:delete': { args: [sessionId: string]; result: void }

  /** Tarefas de um projeto, ou de todos com `null`. */
  'tasks:list': { args: [projectId: string | null]; result: Task[] }
  'tasks:counts': { args: []; result: Record<string, number> }
  'tasks:create': { args: [input: NewTaskInput]; result: Task }
  'tasks:update': { args: [id: string, patch: TaskPatch]; result: Task }
  'tasks:delete': { args: [id: string]; result: void }
  'tasks:reorder': { args: [ids: string[]]; result: void }
  /** Abre uma conversa nova com o agente já executando a tarefa. */
  'tasks:delegate': {
    args: [id: string, agentId: AgentId, mode: SessionMode]
    result: { task: Task; session: SessionSummary }
  }

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
  'files:changed': { path: string }
  'session:event': { sessionId: string; event: SessionEvent }
  /** A lista de sessões de um projeto mudou (nova, título, status). */
  'sessions:changed': { projectId: string }
  /** Tarefas de um projeto mudaram. */
  'tasks:changed': { projectId: string }
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
  'files:changed',
  'sessions:changed',
  'session:focus',
  'app:command',
  'tasks:changed',
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
