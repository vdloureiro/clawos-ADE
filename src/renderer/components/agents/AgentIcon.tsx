import { AGENT_META } from '@shared/agents'
import type { AgentId } from '@shared/types'
import { AgentLogo } from '@/components/agents/AgentLogo'
import { cn } from '@/lib/utils'

export function AgentIcon({ agentId, className }: { agentId: AgentId; className?: string }) {
  return (
    <span
      className={cn(
        'flex size-6 shrink-0 items-center justify-center rounded-md bg-foreground/[0.07] text-foreground ring-1 ring-foreground/10',
        className,
      )}
      title={AGENT_META[agentId].name}
    >
      <AgentLogo agentId={agentId} className="size-[62%]" />
    </span>
  )
}
