import { useEffect, useMemo, useRef } from 'react'
import {
  DockviewReact,
  themeDark,
  themeLight,
  type DockviewApi,
  type DockviewReadyEvent,
  type IDockviewHeaderActionsProps,
  type IDockviewPanelHeaderProps,
  type IDockviewPanelProps,
  type IWatermarkPanelProps,
} from 'dockview-react'
import 'dockview-react/dist/styles/dockview.css'
import { FileText, Maximize2, Minimize2, Plus, X } from 'lucide-react'
import { AGENT_META } from '@shared/agents'
import { AgentLogo } from '@/components/agents/AgentLogo'
import { ChatPanel } from '@/components/chat/ChatPanel'
import { FilePanel } from '@/components/files/FilePanel'
import { Button } from '@/components/ui/button'
import { ErrorBoundary } from '@/components/ui/error-boundary'
import {
  closeSessionPanel,
  newSessionInDock,
  registerDock,
  sessionTitle,
  unregisterDock,
} from '@/lib/dock'
import { fileName, isFilePanel } from '@/lib/filePanels'
import { sanitizeLayout } from '@/lib/layout'
import { cn } from '@/lib/utils'
import { useDirtyFiles } from '@/stores/dirtyFiles'
import { useSessionsStore } from '@/stores/sessions'
import { useThemeStore } from '@/stores/theme'

interface ChatParams {
  sessionId: string
}

function ChatDockPanel({ params }: IDockviewPanelProps<ChatParams>) {
  return (
    <ErrorBoundary label="Este painel encontrou um erro.">
      <ChatPanel sessionId={params.sessionId} />
    </ErrorBoundary>
  )
}

interface FileParams {
  path: string
  line?: number
  nonce?: number
}

function makeFileDockPanel(projectId: string) {
  return function FileDockPanel({ api, params }: IDockviewPanelProps<FileParams>) {
    return (
      <ErrorBoundary label="Não foi possível mostrar este arquivo.">
        <FilePanel
          path={params.path}
          line={params.line}
          nonce={params.nonce}
          projectId={projectId}
          onClose={() => api.close()}
        />
      </ErrorBoundary>
    )
  }
}

function FileTab({ api, params }: IDockviewPanelHeaderProps<FileParams>) {
  const dirty = useDirtyFiles((s) => Boolean(s.dirty[params.path]))
  return (
    <div
      className="group flex h-full max-w-56 items-center gap-1.5 px-2.5 text-xs"
      title={params.path}
    >
      <FileText className="size-3 shrink-0 text-muted-foreground" />
      <span className="truncate">{fileName(params.path)}</span>
      <button
        type="button"
        className={cn(
          'ml-1 rounded p-0.5 hover:bg-accent',
          // Sempre visível: arquivos abertos ao lado precisam de um jeito óbvio de fechar.
          dirty ? 'text-amber-500' : 'opacity-60 hover:opacity-100',
        )}
        title={dirty ? 'Alterações não salvas — fechar' : 'Fechar'}
        onClick={(e) => {
          e.stopPropagation()
          if (dirty && !confirm(`Descartar as alterações não salvas em ${fileName(params.path)}?`))
            return
          api.close()
        }}
      >
        {dirty ? (
          <span className="block size-3 text-center leading-3 group-hover:hidden">●</span>
        ) : null}
        <X className={cn('size-3', dirty && 'hidden group-hover:block')} />
      </button>
    </div>
  )
}

const STATUS_DOT: Record<string, string> = {
  starting: 'bg-muted-foreground animate-pulse',
  ready: 'bg-emerald-500',
  working: 'bg-blue-500 animate-pulse',
  awaiting_permission: 'bg-amber-500',
  error: 'bg-red-500',
  closed: 'bg-muted-foreground/40',
}

function ChatTab({ api, params }: IDockviewPanelHeaderProps<ChatParams>) {
  const chat = useSessionsStore((s) => s.chats[params.sessionId])
  const projectId = chat?.info.projectId
  return (
    <div className="group flex h-full max-w-56 items-center gap-1.5 px-2.5 text-xs">
      <span
        className={cn('size-1.5 shrink-0 rounded-full', STATUS_DOT[chat?.status ?? 'starting'])}
      />
      {chat && (
        <AgentLogo
          agentId={chat.info.agentId}
          className="size-3 shrink-0 text-foreground/80"
          aria-label={AGENT_META[chat.info.agentId].name}
        />
      )}
      <span className="truncate">{chat?.info.title ?? api.title}</span>
      <button
        type="button"
        className="ml-1 rounded p-0.5 opacity-0 group-hover:opacity-70 hover:bg-accent hover:opacity-100"
        title="Fechar painel (encerra o agente; o histórico fica salvo)"
        onClick={(e) => {
          e.stopPropagation()
          if (projectId) void closeSessionPanel(projectId, params.sessionId)
          else api.close()
        }}
      >
        <X className="size-3" />
      </button>
    </div>
  )
}

function makeWatermark(projectId: string) {
  return function EmptyDock({ group }: IWatermarkPanelProps) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
        <span>Nenhum agente neste painel.</span>
        <Button
          size="sm"
          variant="outline"
          onClick={() => void newSessionInDock(projectId, { groupId: group?.id })}
        >
          <Plus /> Agente
        </Button>
      </div>
    )
  }
}

function makeGroupActions(projectId: string) {
  return function GroupActions({ api, group }: IDockviewHeaderActionsProps) {
    const maximized = api.isMaximized()
    const files = group.panels.filter((p) => isFilePanel(p.id))
    return (
      <div className="flex h-full items-center gap-0.5 px-1">
        {files.length > 0 && (
          <button
            type="button"
            className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
            title={files.length > 1 ? 'Fechar todos os arquivos deste grupo' : 'Fechar arquivo'}
            onClick={() => {
              const dirty = useDirtyFiles.getState().dirty
              const unsaved = files.filter((p) => dirty[(p.params as FileParams).path])
              if (
                unsaved.length > 0 &&
                !confirm(
                  `Há ${unsaved.length} arquivo(s) com alterações não salvas. Fechar mesmo assim?`,
                )
              )
                return
              for (const panel of files) panel.api.close()
            }}
          >
            <X className="size-3.5" />
          </button>
        )}
        <button
          type="button"
          className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          title="Novo agente neste grupo"
          onClick={() => void newSessionInDock(projectId, { groupId: group.id })}
        >
          <Plus className="size-3.5" />
        </button>
        <button
          type="button"
          className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          title={maximized ? 'Restaurar' : 'Maximizar'}
          onClick={() => (maximized ? api.exitMaximized() : api.maximize())}
        >
          {maximized ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
        </button>
      </div>
    )
  }
}

const tabComponents = { chat: ChatTab, file: FileTab }

/**
 * Dock de um projeto. Fica montado (escondido) ao trocar de projeto para que painéis,
 * scroll e streaming continuem intactos.
 */
export function DockWorkspace({ projectId, visible }: { projectId: string; visible: boolean }) {
  const theme = useThemeStore((s) => s.theme)
  const apiRef = useRef<DockviewApi | null>(null)
  const watermark = useMemo(() => makeWatermark(projectId), [projectId])
  const groupActions = useMemo(() => makeGroupActions(projectId), [projectId])
  const components = useMemo(
    () => ({ chat: ChatDockPanel, file: makeFileDockPanel(projectId) }),
    [projectId],
  )

  const onReady = async ({ api }: DockviewReadyEvent) => {
    apiRef.current = api
    const json = await window.clawos.invoke('layouts:get', projectId)
    if (json) {
      try {
        const sessions = useSessionsStore.getState()
        const known = new Set((sessions.summaries[projectId] ?? []).map((s) => s.id))
        const layout = sanitizeLayout(JSON.parse(json), (id) => known.has(id), sessionTitle)
        api.fromJSON(layout)
        for (const panel of api.panels) if (!isFilePanel(panel.id)) void sessions.load(panel.id)
      } catch {
        api.clear()
      }
    }

    let timer: ReturnType<typeof setTimeout> | undefined
    api.onDidLayoutChange(() => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        void window.clawos.invoke('layouts:save', projectId, JSON.stringify(api.toJSON()))
      }, 400)
    })
    api.onDidActivePanelChange(({ panel }) => {
      // Abas de arquivo não mudam a conversa ativa.
      if (panel && isFilePanel(panel.id)) return
      useSessionsStore.getState().setActive(projectId, panel?.id ?? null)
    })
    registerDock(projectId, api)
  }

  useEffect(() => () => unregisterDock(projectId), [projectId])

  // Títulos das abas acompanham renomeações e o título automático.
  const summaries = useSessionsStore((s) => s.summaries[projectId])
  useEffect(() => {
    const api = apiRef.current
    if (!api) return
    for (const summary of summaries ?? []) {
      const panel = api.getPanel(summary.id)
      if (panel && panel.title !== summary.title) panel.api.setTitle(summary.title)
    }
  }, [summaries])

  return (
    <div className={cn('clawos-dock absolute inset-0', !visible && 'invisible')}>
      <DockviewReact
        components={components}
        tabComponents={tabComponents}
        watermarkComponent={watermark}
        rightHeaderActionsComponent={groupActions}
        defaultRenderer="always"
        disableFloatingGroups
        theme={theme === 'dark' ? themeDark : themeLight}
        onReady={(event) => void onReady(event)}
      />
    </div>
  )
}
