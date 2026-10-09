import { useMemo, useRef, useState, type DragEvent, type KeyboardEvent } from 'react'
import { ArrowUp, AtSign, FileText, Square, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { filterFiles, mentionAt, type Mention } from './mentions'

export interface SendPayload {
  text: string
  /** Caminhos absolutos de arquivos anexados ou mencionados com `@`. */
  attachments: string[]
}

export function ChatInput({
  disabled,
  working,
  cwd,
  loadFiles,
  onSend,
  onStop,
}: {
  disabled: boolean
  working: boolean
  cwd: string
  loadFiles: () => Promise<string[]>
  onSend: (payload: SendPayload) => void
  onStop: () => void
}) {
  const [text, setText] = useState('')
  const [attachments, setAttachments] = useState<string[]>([])
  const [files, setFiles] = useState<string[] | null>(null)
  const [mention, setMention] = useState<Mention | null>(null)
  const [selected, setSelected] = useState(0)
  const [dragging, setDragging] = useState(false)
  const ref = useRef<HTMLTextAreaElement>(null)

  const suggestions = useMemo(
    () => (mention && files ? filterFiles(files, mention.query) : []),
    [mention, files],
  )

  const updateMention = (value: string, caret: number) => {
    const found = mentionAt(value, caret)
    setMention(found)
    setSelected(0)
    if (found && files === null) void loadFiles().then(setFiles)
  }

  const pick = (file: string) => {
    if (!mention) return
    const before = text.slice(0, mention.start)
    const after = text.slice(mention.end)
    const value = `${before}@${file} ${after}`
    setText(value)
    setMention(null)
    const absolute = `${cwd.replace(/\/$/, '')}/${file}`
    setAttachments((a) => (a.includes(absolute) ? a : [...a, absolute]))
    requestAnimationFrame(() => {
      const caret = before.length + file.length + 2
      ref.current?.setSelectionRange(caret, caret)
      ref.current?.focus()
    })
  }

  const send = () => {
    const value = text.trim()
    if ((!value && attachments.length === 0) || disabled || working) return
    onSend({ text: value || 'Veja os arquivos anexados.', attachments })
    setText('')
    setAttachments([])
    setMention(null)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (mention && suggestions.length > 0) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        const delta = e.key === 'ArrowDown' ? 1 : -1
        setSelected((i) => (i + delta + suggestions.length) % suggestions.length)
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        pick(suggestions[selected]!)
        return
      }
      if (e.key === 'Escape') {
        setMention(null)
        return
      }
    }
    // Enter envia; Shift+Enter quebra linha; não envia durante composição (IME/acentos).
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      send()
    }
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const paths = [...e.dataTransfer.files].map((f) => window.clawos.pathForFile(f)).filter(Boolean)
    setAttachments((a) => [...a, ...paths.filter((p) => !a.includes(p))])
  }

  return (
    <div
      className="relative border-t p-3"
      onDragOver={(e) => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      {mention && suggestions.length > 0 && (
        <div className="absolute right-3 bottom-full left-3 z-20 mb-1 max-h-60 overflow-y-auto rounded-md border bg-popover p-1 shadow-lg">
          {suggestions.map((file, index) => (
            <button
              key={file}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault()
                pick(file)
              }}
              className={cn(
                'flex w-full items-center gap-2 rounded px-2 py-1 text-left font-mono text-xs',
                index === selected ? 'bg-accent' : 'hover:bg-accent/50',
              )}
            >
              <FileText className="size-3 shrink-0 text-muted-foreground" />
              <span className="truncate">{file}</span>
            </button>
          ))}
        </div>
      )}
      <div
        className={cn(
          'rounded-lg border bg-background px-3 py-2 focus-within:ring-2 focus-within:ring-ring/40',
          dragging && 'border-dashed border-ring bg-accent/30',
        )}
      >
        {attachments.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1">
            {attachments.map((path) => (
              <span
                key={path}
                className="flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]"
                title={path}
              >
                <FileText className="size-3" />
                {path.split(/[\\/]/).pop()}
                <button
                  type="button"
                  onClick={() => setAttachments((a) => a.filter((p) => p !== path))}
                  title="Remover"
                >
                  <X className="size-3" />
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="flex items-end gap-2">
          <textarea
            ref={ref}
            value={text}
            onChange={(e) => {
              setText(e.target.value)
              updateMention(e.target.value, e.target.selectionStart)
            }}
            onKeyDown={onKeyDown}
            onBlur={() => setMention(null)}
            placeholder={
              disabled
                ? 'Conectando ao agente…'
                : 'Peça algo ao agente — @ menciona arquivos, arraste para anexar'
            }
            rows={1}
            className="field-sizing-content max-h-48 min-h-6 flex-1 resize-none bg-transparent text-sm outline-none select-text placeholder:text-muted-foreground"
          />
          <button
            type="button"
            className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
            title="Mencionar arquivo"
            onClick={() => {
              const value = `${text}${text && !text.endsWith(' ') ? ' ' : ''}@`
              setText(value)
              updateMention(value, value.length)
              ref.current?.focus()
            }}
          >
            <AtSign className="size-4" />
          </button>
          {working ? (
            <Button
              size="icon"
              variant="secondary"
              className="size-7"
              onClick={onStop}
              title="Parar"
            >
              <Square className="size-3 fill-current" />
            </Button>
          ) : (
            <Button
              size="icon"
              className="size-7"
              onClick={send}
              disabled={disabled || (!text.trim() && attachments.length === 0)}
              title="Enviar"
            >
              <ArrowUp className="size-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
