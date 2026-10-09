import { useState } from 'react'
import { Brain, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

export function ThoughtBlock({ text, active }: { text: string; active: boolean }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="text-xs text-muted-foreground">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 hover:text-foreground"
      >
        <ChevronRight className={cn('size-3 transition-transform', open && 'rotate-90')} />
        <Brain className="size-3.5" />
        <span className={cn(active && 'animate-pulse')}>{active ? 'Pensando…' : 'Pensamento'}</span>
      </button>
      {open && (
        <p className="mt-1 ml-5 border-l pl-3 whitespace-pre-wrap italic select-text">{text}</p>
      )}
    </div>
  )
}
