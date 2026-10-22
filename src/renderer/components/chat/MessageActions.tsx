import { useEffect, useState } from 'react'
import { Check, ChevronDown, ChevronUp, Copy, ListTodo, Pin, PinOff, X } from 'lucide-react'
import type { PinnedMessage } from '@shared/types'
import { cn, copyText } from '@/lib/utils'

const action =
  'flex items-center gap-1 rounded px-1.5 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40'

/** Ações no fim de cada resposta do agente: copiar tudo, fixar e organizar em tarefas. */
export function MessageActions({
  text,
  pinned,
  canOrganize,
  onTogglePin,
  onOrganize,
}: {
  text: string
  pinned: boolean
  canOrganize: boolean
  onTogglePin: () => void
  onOrganize: () => void
}) {
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 1600)
    return () => clearTimeout(timer)
  }, [copied])

  return (
    <div className="-ml-1.5 flex flex-wrap items-center gap-0.5">
      <button
        type="button"
        className={cn(action, copied && 'text-emerald-600 dark:text-emerald-400')}
        title="Copiar a resposta inteira (Markdown)"
        onClick={() => void copyText(text).then(() => setCopied(true))}
      >
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
        {copied ? 'Copiado' : 'Copiar'}
      </button>
      <button
        type="button"
        className={cn(action, pinned && 'text-foreground')}
        title={pinned ? 'Desafixar' : 'Fixar no topo da conversa'}
        onClick={onTogglePin}
      >
        {pinned ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}
        {pinned ? 'Desafixar' : 'Fixar'}
      </button>
      <button
        type="button"
        className={action}
        disabled={!canOrganize}
        title={
          canOrganize
            ? 'Pede ao agente para transformar as atividades desta resposta em tarefas do quadro'
            : 'Espere o agente terminar'
        }
        onClick={onOrganize}
      >
        <ListTodo className="size-3.5" /> Organizar em tarefas
      </button>
    </div>
  )
}

/** Faixa no topo da conversa com as mensagens fixadas (clique leva até a mensagem). */
export function PinnedBanner({
  pins,
  onJump,
  onUnpin,
}: {
  pins: PinnedMessage[]
  onJump: (pin: PinnedMessage) => void
  onUnpin: (pin: PinnedMessage) => void
}) {
  const [index, setIndex] = useState(0)
  if (pins.length === 0) return null
  const current = pins[Math.min(index, pins.length - 1)]!
  const preview = current.text
    .replace(/[#*_`>[\]]/g, '')
    .replace(/\s+/g, ' ')
    .trim()

  return (
    <div className="flex shrink-0 items-center gap-2 border-b bg-muted/40 px-3 py-1.5 text-xs">
      <Pin className="size-3.5 shrink-0 text-muted-foreground" />
      <button
        type="button"
        className="min-w-0 flex-1 truncate text-left hover:underline"
        title="Ir até a mensagem fixada"
        onClick={() => onJump(current)}
      >
        {pins.length > 1 && (
          <span className="mr-1.5 text-muted-foreground">
            {Math.min(index, pins.length - 1) + 1}/{pins.length}
          </span>
        )}
        {preview}
      </button>
      {pins.length > 1 && (
        <span className="flex shrink-0">
          <button
            type="button"
            className="rounded p-0.5 text-muted-foreground hover:bg-accent"
            title="Fixada anterior"
            onClick={() => setIndex((i) => (i - 1 + pins.length) % pins.length)}
          >
            <ChevronUp className="size-3.5" />
          </button>
          <button
            type="button"
            className="rounded p-0.5 text-muted-foreground hover:bg-accent"
            title="Próxima fixada"
            onClick={() => setIndex((i) => (i + 1) % pins.length)}
          >
            <ChevronDown className="size-3.5" />
          </button>
        </span>
      )}
      <button
        type="button"
        className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-accent"
        title="Desafixar"
        onClick={() => onUnpin(current)}
      >
        <X className="size-3.5" />
      </button>
    </div>
  )
}
