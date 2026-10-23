import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Folder, GitBranch, Loader2, RotateCcw, Square } from 'lucide-react'
import { AGENT_META } from '@shared/agents'
import type { PinnedMessage, SessionStatus } from '@shared/types'
import { AgentIcon } from '@/components/agents/AgentIcon'
import { FileLink, FileLinkProvider } from '@/components/files/FileLinks'
import { Button } from '@/components/ui/button'
import type { ChatItem } from '@shared/chat'
import { cn } from '@/lib/utils'
import { useSessionsStore } from '@/stores/sessions'
import { useUiStore } from '@/stores/ui'
import { ChatInput, type SendPayload } from './ChatInput'
import { organizeTasksPrompt, turnEnds } from '@/lib/chatTurns'
import { Markdown } from './Markdown'
import { MessageActions, PinnedBanner } from './MessageActions'
import { PermissionCard } from './PermissionCard'
import { PlanView } from './PlanView'
import { ThoughtBlock } from './ThoughtBlock'
import { WorktreeBar } from './WorktreeBar'
import { relativize, ToolCallCard } from './ToolCallCard'

const STATUS: Record<SessionStatus, { label: string; className: string }> = {
  starting: { label: 'Conectando…', className: 'bg-muted-foreground animate-pulse' },
  ready: { label: 'Pronto', className: 'bg-emerald-500' },
  working: { label: 'Trabalhando', className: 'bg-blue-500 animate-pulse' },
  awaiting_permission: { label: 'Aguardando aprovação', className: 'bg-amber-500' },
  error: { label: 'Erro', className: 'bg-red-500' },
  closed: { label: 'Encerrada', className: 'bg-muted-foreground' },
}

export function ChatPanel({ sessionId }: { sessionId: string }) {
  const chat = useSessionsStore((s) => s.chats[sessionId])
  const rename = useSessionsStore((s) => s.rename)
  const restart = useSessionsStore((s) => s.restart)
  const openGlobalSettings = useUiStore((s) => s.setGlobalSettingsOpen)
  const summary = useSessionsStore((s) =>
    chat ? s.summaries[chat.info.projectId]?.find((x) => x.id === sessionId) : undefined,
  )
  const branch = summary?.mode === 'worktree' ? null : summary?.branch
  const [editingTitle, setEditingTitle] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const stickToBottom = useRef(true)

  const onScroll = () => {
    const el = scrollRef.current
    if (!el) return
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
  }

  useLayoutEffect(() => {
    const el = scrollRef.current
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight
  }, [chat?.items])

  useEffect(() => {
    stickToBottom.current = true
  }, [sessionId])

  // Mensagens fixadas desta conversa.
  const [pins, setPins] = useState<PinnedMessage[]>([])
  useEffect(() => {
    let alive = true
    void window.clawos.invoke('pins:list', sessionId).then((list) => alive && setPins(list))
    return () => {
      alive = false
    }
  }, [sessionId])

  const items = chat?.items
  const busy = chat?.status === 'working' || chat?.status === 'awaiting_permission'
  const ends = useMemo(() => turnEnds(items ?? [], busy), [items, busy])

  if (!chat) return null

  const { status, info } = chat
  const working = busy
  const allItems = chat.items
  const last = allItems.at(-1)
  const showThinking =
    status === 'working' && last?.kind !== 'assistant' && last?.kind !== 'thought'

  const send = ({ text, attachments }: SendPayload) => {
    stickToBottom.current = true
    void window.clawos.invoke('session:prompt', sessionId, text, attachments)
  }
  const stop = () => void window.clawos.invoke('session:cancel', sessionId)

  const togglePin = async (index: number, text: string) => {
    const existing = pins.find((p) => p.itemIndex === index)
    if (existing) {
      await window.clawos.invoke('pins:remove', existing.id)
      setPins((list) => list.filter((p) => p.id !== existing.id))
    } else {
      const pin = await window.clawos.invoke('pins:add', sessionId, index, text)
      setPins((list) => [pin, ...list])
    }
  }
  const unpin = async (pin: PinnedMessage) => {
    await window.clawos.invoke('pins:remove', pin.id)
    setPins((list) => list.filter((p) => p.id !== pin.id))
  }
  const jumpTo = (pin: PinnedMessage) => {
    const el = scrollRef.current?.querySelector<HTMLElement>(`[data-item="${pin.itemIndex}"]`)
    if (!el) return
    stickToBottom.current = false
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el.classList.add('clawos-flash')
    setTimeout(() => el.classList.remove('clawos-flash'), 1600)
  }
  const respond = (requestId: string, optionId: string | null) =>
    void window.clawos.invoke('session:permission', sessionId, requestId, optionId)

  return (
    <FileLinkProvider value={{ projectId: info.projectId, cwd: info.cwd, panelId: sessionId }}>
      <div className="flex h-full min-h-0 flex-col">
        <header className="flex items-center gap-3 border-b px-3 py-1.5">
          <AgentIcon agentId={info.agentId} />
          <div className="min-w-0 flex-1">
            {editingTitle ? (
              <input
                autoFocus
                defaultValue={info.title}
                className="w-full rounded border bg-background px-1 text-sm font-medium outline-none"
                onBlur={(e) => {
                  void rename(sessionId, e.target.value)
                  setEditingTitle(false)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur()
                  if (e.key === 'Escape') setEditingTitle(false)
                }}
              />
            ) : (
              <div
                className="truncate text-sm font-medium"
                onDoubleClick={() => setEditingTitle(true)}
                title="Duplo clique para renomear"
              >
                {info.title}{' '}
                <span className="font-normal text-muted-foreground">
                  · {AGENT_META[info.agentId].name}
                </span>
              </div>
            )}
            <div
              className="flex items-center gap-1 truncate text-[11px] text-muted-foreground"
              title={info.cwd}
            >
              <Folder className="size-3 shrink-0" />
              <span className="truncate">{info.cwd}</span>
              {branch && (
                <>
                  <GitBranch className="ml-2 size-3 shrink-0" />
                  <span className="shrink-0">{branch}</span>
                </>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className={cn('size-2 rounded-full', STATUS[status].className)} />
            {STATUS[status].label}
          </div>
          {working && (
            <Button size="sm" variant="outline" onClick={stop}>
              <Square className="size-3 fill-current" /> Parar
            </Button>
          )}
        </header>
        {summary?.mode === 'worktree' && <WorktreeBar summary={summary} busy={working} />}

        <PinnedBanner pins={pins} onJump={jumpTo} onUnpin={(pin) => void unpin(pin)} />
        <div ref={scrollRef} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto flex max-w-3xl flex-col gap-3 px-4 py-4">
            {status === 'starting' && allItems.length === 0 && (
              <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Iniciando sessão com o{' '}
                {AGENT_META[info.agentId].name}…
              </div>
            )}
            {allItems.map((item, index) => {
              const end = ends.get(index)
              return (
                <div
                  key={`${item.kind}-${item.id}-${index}`}
                  data-item={index}
                  className="rounded-md"
                >
                  <ChatItemView
                    item={item}
                    isLast={index === allItems.length - 1}
                    working={working}
                    cwd={info.cwd}
                    onRespond={respond}
                  />
                  {end && (
                    <div className="mt-1.5">
                      <MessageActions
                        text={end.text}
                        pinned={pins.some((p) => p.itemIndex === index)}
                        canOrganize={!working && status === 'ready'}
                        onTogglePin={() => void togglePin(index, end.text)}
                        onOrganize={() =>
                          send({ text: organizeTasksPrompt(end.text), attachments: [] })
                        }
                      />
                    </div>
                  )}
                </div>
              )
            })}
            {(status === 'error' || status === 'closed') && (
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => void restart(sessionId)}>
                  <RotateCcw /> Reiniciar sessão
                </Button>
                <Button size="sm" variant="ghost" onClick={() => openGlobalSettings(true)}>
                  Agentes e login
                </Button>
              </div>
            )}
            {showThinking && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="flex gap-1">
                  <span className="size-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.3s]" />
                  <span className="size-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.15s]" />
                  <span className="size-1.5 animate-bounce rounded-full bg-current" />
                </span>
                Pensando…
              </div>
            )}
          </div>
        </div>

        <ChatInput
          // Com erro ou encerrada dá para escrever: enviar religa o agente.
          disabled={status === 'starting'}
          unavailable={status === 'error' || status === 'closed'}
          working={working}
          cwd={info.cwd}
          loadFiles={() => window.clawos.invoke('projects:files', info.projectId)}
          configOptions={chat.configOptions}
          onConfigChange={async (configId, value) => {
            await window.clawos.invoke('session:setConfig', sessionId, configId, value)
          }}
          onSend={send}
          onStop={stop}
        />
      </div>
    </FileLinkProvider>
  )
}

function ChatItemView({
  item,
  isLast,
  working,
  cwd,
  onRespond,
}: {
  item: ChatItem
  isLast: boolean
  working: boolean
  cwd: string
  onRespond: (requestId: string, optionId: string | null) => void
}) {
  switch (item.kind) {
    case 'user':
      return (
        <div className="ml-auto max-w-[85%] rounded-lg bg-secondary px-3 py-2 text-sm whitespace-pre-wrap select-text">
          {item.text}
          {item.attachments && item.attachments.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {item.attachments.map((path) => (
                <FileLink
                  key={path}
                  path={path}
                  className="rounded bg-background/60 px-1.5 py-0.5 font-mono text-[11px]"
                  title={path}
                >
                  {relativize(path, cwd)}
                </FileLink>
              ))}
            </div>
          )}
        </div>
      )
    case 'assistant':
      return (
        <div className="select-text">
          <Markdown text={item.text} />
        </div>
      )
    case 'thought':
      return <ThoughtBlock text={item.text} active={isLast && working} />
    case 'tool':
      return <ToolCallCard toolCall={item.toolCall} cwd={cwd} />
    case 'permission':
      return (
        <PermissionCard
          item={{ ...item, title: relativize(item.title, cwd) }}
          onRespond={(optionId) => onRespond(item.id, optionId)}
        />
      )
    case 'plan':
      return <PlanView entries={item.entries} />
    case 'notice':
      return <div className="text-center text-xs text-muted-foreground">{item.text}</div>
    case 'error':
      return (
        <div className="rounded-md border border-red-500/40 bg-red-500/5 p-3 font-mono text-xs whitespace-pre-wrap text-red-700 select-text dark:text-red-300">
          {item.message}
        </div>
      )
  }
}
