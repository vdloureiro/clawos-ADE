import { useState } from 'react'
import {
  ArrowRightLeft,
  Brain,
  Check,
  ChevronRight,
  FilePen,
  FileText,
  Globe,
  Loader2,
  Search,
  SquareTerminal,
  Trash2,
  Wrench,
  X,
  type LucideIcon,
} from 'lucide-react'
import type { ToolCallView, ToolKind } from '@shared/types'
import { FileLink } from '@/components/files/FileLinks'
import { cn } from '@/lib/utils'
import { DiffView } from './DiffView'
import { Markdown } from './Markdown'

const ICONS: Record<ToolKind, LucideIcon> = {
  read: FileText,
  edit: FilePen,
  delete: Trash2,
  move: ArrowRightLeft,
  search: Search,
  execute: SquareTerminal,
  think: Brain,
  fetch: Globe,
  switch_mode: ArrowRightLeft,
  other: Wrench,
}

/** Ferramentas cujo `locations` aponta arquivos que vale abrir. */
const FILE_KINDS = new Set<ToolKind>(['read', 'edit', 'move', 'other'])

function StatusIcon({ status }: { status: ToolCallView['status'] }) {
  if (status === 'completed')
    return <Check className="size-3.5 text-emerald-600 dark:text-emerald-400" />
  if (status === 'failed') return <X className="size-3.5 text-red-600 dark:text-red-400" />
  return <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
}

/** Comando do Bash, quando houver, para mostrar na visão expandida. */
function commandOf(input: unknown): string | null {
  if (
    input &&
    typeof input === 'object' &&
    'command' in input &&
    typeof input.command === 'string'
  ) {
    return input.command
  }
  return null
}

/** Encurta caminhos absolutos dentro da pasta da sessão para relativos. */
export function relativize(text: string, cwd: string): string {
  if (!cwd) return text
  const base = cwd.endsWith('/') ? cwd : `${cwd}/`
  return text.split(base).join('')
}

export function ToolCallCard({ toolCall, cwd }: { toolCall: ToolCallView; cwd: string }) {
  const [open, setOpen] = useState(false)
  const Icon = ICONS[toolCall.kind] ?? Wrench
  const diffs = toolCall.content.filter((c) => c.type === 'diff')
  const texts = toolCall.content.filter((c) => c.type === 'text')
  const command = toolCall.kind === 'execute' ? commandOf(toolCall.input) : null
  const hasDetails = texts.length > 0 || command !== null || toolCall.output !== undefined
  // Arquivos lidos/criados/editados viram links (os com diff já têm o link no cabeçalho).
  const withDiff = new Set(diffs.map((d) => d.path))
  const files =
    FILE_KINDS.has(toolCall.kind) && toolCall.status !== 'failed'
      ? [...new Set(toolCall.locations)].filter((f) => !withDiff.has(f))
      : []

  return (
    <div className="rounded-md border bg-card text-card-foreground">
      <button
        type="button"
        onClick={() => hasDetails && setOpen(!open)}
        className={cn(
          'flex w-full items-center gap-2 px-3 py-2 text-left text-xs',
          hasDetails && 'hover:bg-accent/50',
        )}
      >
        <ChevronRight
          className={cn(
            'size-3 shrink-0 transition-transform',
            open && 'rotate-90',
            !hasDetails && 'opacity-0',
          )}
        />
        <Icon className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate font-mono" title={toolCall.title}>
          {relativize(toolCall.title, cwd)}
        </span>
        <StatusIcon status={toolCall.status} />
      </button>

      {files.length > 0 && (
        <div className="-mt-1 flex flex-wrap gap-1 px-3 pb-2 pl-8">
          {files.map((file) => (
            <FileLink
              key={file}
              path={file}
              className="flex max-w-full items-center gap-1 truncate rounded border bg-muted/40 px-1.5 py-0.5 font-mono text-[11px] text-blue-600 hover:bg-accent dark:text-blue-400"
            >
              <FileText className="size-3 shrink-0" />
              <span className="truncate">{relativize(file, cwd)}</span>
            </FileLink>
          ))}
        </div>
      )}

      {diffs.length > 0 && (
        <div className="space-y-2 px-3 pb-3">
          {diffs.map((d, i) => (
            <DiffView key={i} path={d.path} oldText={d.oldText} newText={d.newText} />
          ))}
        </div>
      )}

      {open && (
        <div className="space-y-2 border-t px-3 py-2 select-text">
          {command && (
            <pre className="overflow-x-auto rounded bg-muted/60 p-2 font-mono text-xs">
              $ {command}
            </pre>
          )}
          {texts.map((t, i) => (
            <Markdown key={i} text={t.text} />
          ))}
          {texts.length === 0 && toolCall.output !== undefined && (
            <pre className="max-h-72 overflow-auto rounded bg-muted/60 p-2 font-mono text-xs">
              {toolCall.output}
            </pre>
          )}
        </div>
      )}
    </div>
  )
}
