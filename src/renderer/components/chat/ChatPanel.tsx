import { useEffect, useLayoutEffect, useRef } from 'react'
import { Folder, Loader2, Square } from 'lucide-react'
import type { SessionStatus } from '@shared/types'
import { Button } from '@/components/ui/button'
import type { ChatItem } from '@/lib/chat'
import { cn } from '@/lib/utils'
import { useSessionsStore } from '@/stores/sessions'
import { ChatInput } from './ChatInput'
import { Markdown } from './Markdown'
import { PermissionCard } from './PermissionCard'
import { PlanView } from './PlanView'
import { ThoughtBlock } from './ThoughtBlock'
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
  const chat = useSessionsStore((s) => s.sessions[sessionId])
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

  if (!chat) return null

  const { status, items, info } = chat
  const working = status === 'working' || status === 'awaiting_permission'
  const last = items.at(-1)
  const showThinking =
    status === 'working' && last?.kind !== 'assistant' && last?.kind !== 'thought'

  const send = (text: string) => {
    stickToBottom.current = true
    void window.clawos.invoke('session:prompt', sessionId, text)
  }
  const stop = () => void window.clawos.invoke('session:cancel', sessionId)
  const respond = (requestId: string, optionId: string | null) =>
    void window.clawos.invoke('session:permission', sessionId, requestId, optionId)

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center gap-3 border-b px-4 py-2">
        <span className="flex size-6 items-center justify-center rounded bg-orange-500/15 text-xs font-semibold text-orange-600 dark:text-orange-400">
          C
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">Claude</div>
          <div
            className="flex items-center gap-1 truncate text-[11px] text-muted-foreground"
            title={info.cwd}
          >
            <Folder className="size-3 shrink-0" />
            <span className="truncate">{info.cwd}</span>
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

      <div ref={scrollRef} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-3xl flex-col gap-3 px-4 py-4">
          {status === 'starting' && items.length === 0 && (
            <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Iniciando sessão com o Claude…
            </div>
          )}
          {items.map((item, index) => (
            <ChatItemView
              key={`${item.kind}-${item.id}`}
              item={item}
              isLast={index === items.length - 1}
              working={working}
              cwd={info.cwd}
              onRespond={respond}
            />
          ))}
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
        disabled={status === 'starting' || status === 'error' || status === 'closed'}
        working={working}
        onSend={send}
        onStop={stop}
      />
    </div>
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
