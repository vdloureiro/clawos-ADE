import { useEffect, useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Comando com botão de copiar que confirma a cópia (o ícone vira ✓ "Copiado"). */
export function CopyCommand({ command, className }: { command: string; className?: string }) {
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 1600)
    return () => clearTimeout(timer)
  }, [copied])
  return (
    <button
      type="button"
      title="Copiar comando"
      onClick={() => void navigator.clipboard.writeText(command).then(() => setCopied(true))}
      className={cn(
        'group flex w-full min-w-0 items-center gap-2 rounded-md border bg-muted/60 px-2 py-1.5 text-left font-mono text-[11px] transition-colors hover:bg-muted',
        copied && 'border-emerald-500/50',
        className,
      )}
    >
      <span className="text-muted-foreground select-none">$</span>
      <span className="min-w-0 flex-1 truncate">{command}</span>
      <span
        className={cn(
          'flex shrink-0 items-center gap-1 font-sans text-[11px]',
          copied ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground',
        )}
      >
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
        {copied ? 'Copiado' : 'Copiar'}
      </span>
    </button>
  )
}
