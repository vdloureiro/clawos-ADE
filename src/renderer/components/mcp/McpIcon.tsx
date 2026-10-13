import { BookOpen, Brain, FolderTree, MonitorPlay, Plug, type LucideIcon } from 'lucide-react'
import {
  siCloudflare,
  siGithub,
  siLinear,
  siNotion,
  siSentry,
  siStripe,
  siSupabase,
  siVercel,
} from 'simple-icons'
import { cn } from '@/lib/utils'

/**
 * Logos das marcas em uma cor só (Simple Icons, CC0), seguindo o preto e branco do
 * Clawos: a cor vem do texto (`currentColor`), então acompanha o tema claro/escuro.
 * As marcas pertencem aos seus donos; usadas só para identificar o serviço.
 */
const BRANDS: Record<string, { path: string; title: string }> = {
  github: siGithub,
  supabase: siSupabase,
  vercel: siVercel,
  linear: siLinear,
  notion: siNotion,
  stripe: siStripe,
  sentry: siSentry,
  cloudflare: siCloudflare,
}

/** Serviços sem logo no Simple Icons ou locais: ícone neutro. */
const FALLBACK: Record<string, LucideIcon> = {
  context7: BookOpen,
  playwright: MonitorPlay,
  filesystem: FolderTree,
  memory: Brain,
}

export function McpIcon({ id, className }: { id: string; className?: string }) {
  const brand = BRANDS[id]
  const Fallback = FALLBACK[id] ?? Plug
  return (
    <span
      className={cn(
        'flex size-8 shrink-0 items-center justify-center rounded-lg border bg-background text-foreground',
        className,
      )}
    >
      {brand ? (
        <svg
          viewBox="0 0 24 24"
          fill="currentColor"
          className="size-[55%]"
          aria-label={brand.title}
        >
          <path d={brand.path} />
        </svg>
      ) : (
        <Fallback className="size-[55%]" />
      )}
    </span>
  )
}
