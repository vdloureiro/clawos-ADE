import { CheckCircle2, Circle, CircleDot } from 'lucide-react'
import type { PlanEntryView } from '@shared/types'
import { cn } from '@/lib/utils'

export function PlanView({ entries }: { entries: PlanEntryView[] }) {
  return (
    <div className="rounded-md border bg-card p-3">
      <div className="mb-2 text-xs font-medium text-muted-foreground">Plano</div>
      <ul className="space-y-1 text-sm">
        {entries.map((entry, i) => (
          <li key={i} className="flex items-start gap-2">
            {entry.status === 'completed' ? (
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            ) : entry.status === 'in_progress' ? (
              <CircleDot className="mt-0.5 size-4 shrink-0 text-blue-500" />
            ) : (
              <Circle className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            )}
            <span
              className={cn(entry.status === 'completed' && 'text-muted-foreground line-through')}
            >
              {entry.content}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
