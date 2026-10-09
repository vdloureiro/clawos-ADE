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
import { Maximize2, Minimize2, Plus, X } from 'lucide-react'
import { AGENT_META } from '@shared/agents'
import { ChatPanel } from '@/components/chat/ChatPanel'
import { Button } from '@/components/ui/button'
import {
  closeSessionPanel,
  newSessionInDock,
  registerDock,
  sessionTitle,
  unregisterDock,
} from '@/lib/dock'
import { sanitizeLayout } from '@/lib/layout'
import { cn } from '@/lib/utils'
import { useSessionsStore } from '@/stores/sessions'
import { useThemeStore } from '@/stores/theme'

interface ChatParams {
  sessionId: string
}

function ChatDockPanel({ params }: IDockviewPanelProps<ChatParams>) {
  return <ChatPanel sessionId={params.sessionId} />
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
        <span
          className="text-[10px] font-semibold"
          style={{ color: AGENT_META[chat.info.agentId].color }}
        >
          {AGENT_META[chat.info.agentId].letter}
        </span>
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
    return (
      <div className="flex h-full items-center gap-0.5 px-1">
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

const components = { chat: ChatDockPanel }
const tabComponents = { chat: ChatTab }

/**
 * Dock de um projeto. Fica montado (escondido) ao trocar de projeto para que painéis,
 * scroll e streaming continuem intactos.
 */
export function DockWorkspace({ projectId, visible }: { projectId: string; visible: boolean }) {
  const theme = useThemeStore((s) => s.theme)
  const apiRef = useRef<DockviewApi | null>(null)
  const watermark = useMemo(() => makeWatermark(projectId), [projectId])
  const groupActions = useMemo(() => makeGroupActions(projectId), [projectId])

  const onReady = async ({ api }: DockviewReadyEvent) => {
    apiRef.current = api
    const json = await window.clawos.invoke('layouts:get', projectId)
    if (json) {
      try {
        const sessions = useSessionsStore.getState()
        const known = new Set((sessions.summaries[projectId] ?? []).map((s) => s.id))
        const layout = sanitizeLayout(JSON.parse(json), (id) => known.has(id), sessionTitle)
        api.fromJSON(layout)
        for (const panel of api.panels) void sessions.load(panel.id)
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
