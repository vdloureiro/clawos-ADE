import { AGENT_META } from '@shared/agents'
import type { AgentId } from '@shared/types'
import { cn } from '@/lib/utils'

export function AgentIcon({ agentId, className }: { agentId: AgentId; className?: string }) {
  const meta = AGENT_META[agentId]
  return (
    <span
      className={cn(
        'flex size-6 shrink-0 items-center justify-center rounded text-xs font-semibold',
        className,
      )}
      style={{ background: `${meta.color}26`, color: meta.color }}
      title={meta.name}
    >
      {meta.letter}
    </span>
  )
}
