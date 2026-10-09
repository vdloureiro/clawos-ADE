import { ShieldQuestion } from 'lucide-react'
import type { PermissionOptionView } from '@shared/types'
import { Button } from '@/components/ui/button'
import type { ChatItem } from '@shared/chat'

type PermissionItem = Extract<ChatItem, { kind: 'permission' }>

function variantFor(option: PermissionOptionView) {
  if (option.kind === 'allow_once') return 'default' as const
  if (option.kind === 'allow_always') return 'secondary' as const
  return 'outline' as const
}

export function PermissionCard({
  item,
  onRespond,
}: {
  item: PermissionItem
  onRespond: (optionId: string | null) => void
}) {
  const pending = item.resolution === undefined
  const chosen = item.options.find((o) => o.id === item.resolution)

  if (!pending) {
    const allowed = chosen?.kind.startsWith('allow')
    return (
      <div className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
        <ShieldQuestion className="size-3.5" />
        <span className="truncate">
          {chosen ? (allowed ? 'Aprovado' : 'Recusado') : 'Cancelado'}: {item.title}
          {chosen && <span className="opacity-70"> — {chosen.name}</span>}
        </span>
      </div>
    )
  }

  return (
    <div className="rounded-md border border-amber-500/50 bg-amber-500/5 p-3">
      <div className="mb-2 flex items-center gap-2 text-sm font-medium">
        <ShieldQuestion className="size-4 text-amber-600 dark:text-amber-400" />
        Permitir?
      </div>
      <p className="mb-3 font-mono text-xs break-all text-muted-foreground">{item.title}</p>
      <div className="flex flex-wrap gap-2">
        {item.options.map((option) => (
          <Button
            key={option.id}
            size="sm"
            variant={variantFor(option)}
            onClick={() => onRespond(option.id)}
            title={option.kind}
          >
            {option.name}
          </Button>
        ))}
      </div>
    </div>
  )
}
