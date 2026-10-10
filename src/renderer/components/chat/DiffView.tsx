import { useMemo } from 'react'
import { structuredPatch } from 'diff'
import { ExternalLink } from 'lucide-react'
import { FileLink, useOpenFile } from '@/components/files/FileLinks'
import { cn } from '@/lib/utils'

interface Line {
  type: 'add' | 'del' | 'ctx' | 'hunk'
  text: string
  oldNo?: number
  newNo?: number
}

export function computeDiffLines(oldText: string | null, newText: string): Line[] {
  const patch = structuredPatch('a', 'b', oldText ?? '', newText, '', '', { context: 3 })
  const lines: Line[] = []
  for (const hunk of patch.hunks) {
    if (oldText !== null)
      lines.push({ type: 'hunk', text: `@@ -${hunk.oldStart} +${hunk.newStart} @@` })
    let oldNo = hunk.oldStart
    let newNo = hunk.newStart
    for (const raw of hunk.lines) {
      const marker = raw[0]
      const text = raw.slice(1)
      if (marker === '+') lines.push({ type: 'add', text, newNo: newNo++ })
      else if (marker === '-') lines.push({ type: 'del', text, oldNo: oldNo++ })
      else if (marker === ' ') lines.push({ type: 'ctx', text, oldNo: oldNo++, newNo: newNo++ })
    }
  }
  return lines
}

export function DiffView({
  path,
  oldText,
  newText,
}: {
  path: string
  oldText: string | null
  newText: string
}) {
  const lines = useMemo(() => computeDiffLines(oldText, newText), [oldText, newText])
  const added = lines.filter((l) => l.type === 'add').length
  const removed = lines.filter((l) => l.type === 'del').length
  const name = path.split(/[\\/]/).pop()
  const openFile = useOpenFile()

  return (
    <div className="overflow-hidden rounded-md border text-xs">
      <div className="flex items-center gap-2 border-b bg-muted/50 px-3 py-1.5">
        <FileLink path={path} className="truncate font-mono" title={`Abrir ${path} numa aba`}>
          {name}
        </FileLink>
        {oldText === null && <span className="text-muted-foreground">novo arquivo</span>}
        <span className="text-emerald-600 dark:text-emerald-400">+{added}</span>
        <span className="text-red-600 dark:text-red-400">−{removed}</span>
        <button
          type="button"
          className="ml-auto flex items-center gap-1 text-muted-foreground hover:text-foreground"
          onClick={() =>
            openFile ? void openFile(path) : void window.clawos.invoke('shell:openPath', path)
          }
          title="Abrir arquivo numa aba"
        >
          <ExternalLink className="size-3" /> Abrir
        </button>
      </div>
      <div className="max-h-96 overflow-auto font-mono">
        <table className="w-full border-collapse">
          <tbody>
            {lines.map((line, i) => (
              <tr
                key={i}
                className={cn(
                  line.type === 'add' && 'bg-emerald-500/10',
                  line.type === 'del' && 'bg-red-500/10',
                  line.type === 'hunk' && 'bg-muted/60 text-muted-foreground',
                )}
              >
                <td className="w-10 select-none px-2 text-right text-muted-foreground/60">
                  {line.oldNo ?? ''}
                </td>
                <td className="w-10 select-none px-2 text-right text-muted-foreground/60">
                  {line.newNo ?? ''}
                </td>
                <td
                  className={cn(
                    'w-4 select-none text-center',
                    line.type === 'add' && 'text-emerald-600 dark:text-emerald-400',
                    line.type === 'del' && 'text-red-600 dark:text-red-400',
                  )}
                >
                  {line.type === 'add' ? '+' : line.type === 'del' ? '−' : ''}
                </td>
                <td className="whitespace-pre pr-3 select-text">{line.text}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
