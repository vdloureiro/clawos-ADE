import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type DragEvent,
  type KeyboardEvent,
} from 'react'
import { ArrowUp, AtSign, FileText, ImageIcon, Paperclip, Square, X } from 'lucide-react'
import type { SessionConfigOption } from '@shared/types'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { ConfigPickers } from './ConfigPickers'
import { filterFiles, mentionAt, type Mention } from './mentions'
import { VoiceButton } from './VoiceButton'

const IMAGE_EXT = /\.(png|jpe?g|gif|webp)$/i

export interface SendPayload {
  text: string
  /** Caminhos absolutos de arquivos anexados ou mencionados com `@`. */
  attachments: string[]
}

export function ChatInput({
  disabled,
  unavailable = false,
  working,
  cwd,
  loadFiles,
  configOptions = [],
  onConfigChange,
  onSend,
  onStop,
}: {
  disabled: boolean
  /** Sessão em erro ou encerrada (e não apenas conectando). */
  unavailable?: boolean
  working: boolean
  cwd: string
  loadFiles: () => Promise<string[]>
  /** Modelo, permissões etc. que o agente oferece nesta sessão. */
  configOptions?: SessionConfigOption[]
  onConfigChange?: (configId: string, value: string) => Promise<void>
  onSend: (payload: SendPayload) => void
  onStop: () => void
}) {
  const [text, setText] = useState('')
  const [attachments, setAttachments] = useState<string[]>([])
  const [files, setFiles] = useState<string[] | null>(null)
  const [mention, setMention] = useState<Mention | null>(null)
  const [selected, setSelected] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** Miniaturas das imagens coladas (caminho → blob URL). */
  const [previews, setPreviews] = useState<Record<string, string>>({})
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!error) return
    const timer = setTimeout(() => setError(null), 8000)
    return () => clearTimeout(timer)
  }, [error])

  const addAttachments = (paths: string[]) =>
    setAttachments((a) => [...a, ...paths.filter((p) => p && !a.includes(p))])

  const removeAttachment = (path: string) => {
    setAttachments((a) => a.filter((p) => p !== path))
    setPreviews(({ [path]: url, ...rest }) => {
      if (url) URL.revokeObjectURL(url)
      return rest
    })
  }

  const pickFiles = async () => {
    addAttachments(await window.clawos.invoke('dialog:pickFiles'))
    ref.current?.focus()
  }

  /**
   * Colar: arquivos copiados no Finder/Explorer viram anexos pelo caminho original;
   * conteúdo sem arquivo (ex.: print de tela) é gravado e anexado.
   */
  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const data = e.clipboardData
    const files = [...data.files]
    if (files.length === 0 && !data.types.includes('Files')) return
    e.preventDefault()
    void (async () => {
      try {
        const fromSystem = await window.clawos.invoke('clipboard:filePaths')
        if (fromSystem.length > 0) return addAttachments(fromSystem)
        for (const file of files) {
          const path = window.clawos.pathForFile(file)
          if (path) {
            addAttachments([path])
            continue
          }
          const name = file.name && file.name !== 'image.png' ? file.name : pastedName(file.type)
          const saved = await window.clawos.invoke(
            'attachments:save',
            name,
            new Uint8Array(await file.arrayBuffer()),
          )
          addAttachments([saved])
          if (file.type.startsWith('image/'))
            setPreviews((p) => ({ ...p, [saved]: URL.createObjectURL(file) }))
        }
      } catch (err) {
        setError(`Não foi possível colar o arquivo: ${(err as Error).message}`)
      }
    })()
  }

  const insertDictation = (dictated: string) => {
    setText((current) => {
      const separator = current && !/\s$/.test(current) ? ' ' : ''
      return `${current}${separator}${dictated}`
    })
    requestAnimationFrame(() => {
      const el = ref.current
      if (!el) return
      el.focus()
      el.setSelectionRange(el.value.length, el.value.length)
    })
  }

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
    setPreviews({})
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
    addAttachments([...e.dataTransfer.files].map((f) => window.clawos.pathForFile(f)))
  }

  return (
    <div
      className="@container relative border-t p-3"
      onDragOver={(e) => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      {error && (
        <div className="mb-2 flex items-start gap-2 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs text-red-600 dark:text-red-400">
          <span className="flex-1">{error}</span>
          <button type="button" onClick={() => setError(null)} title="Fechar">
            <X className="size-3" />
          </button>
        </div>
      )}
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
            {attachments.map((path) =>
              previews[path] ? (
                <span key={path} className="group relative" title={path}>
                  <img
                    src={previews[path]}
                    alt=""
                    className="size-14 rounded-md border object-cover"
                  />
                  <button
                    type="button"
                    className="absolute -top-1.5 -right-1.5 rounded-full border bg-background p-0.5 opacity-0 shadow group-hover:opacity-100"
                    onClick={() => removeAttachment(path)}
                    title="Remover"
                  >
                    <X className="size-3" />
                  </button>
                </span>
              ) : (
                <span
                  key={path}
                  className="flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]"
                  title={path}
                >
                  {IMAGE_EXT.test(path) ? (
                    <ImageIcon className="size-3" />
                  ) : (
                    <FileText className="size-3" />
                  )}
                  {path.split(/[\\/]/).pop()}
                  <button type="button" onClick={() => removeAttachment(path)} title="Remover">
                    <X className="size-3" />
                  </button>
                </span>
              ),
            )}
          </div>
        )}
        <textarea
          ref={ref}
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            updateMention(e.target.value, e.target.selectionStart)
          }}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          onBlur={() => setMention(null)}
          placeholder={
            unavailable
              ? 'Sessão indisponível — veja o erro acima'
              : disabled
                ? 'Conectando ao agente…'
                : 'Peça algo ao agente…'
          }
          rows={1}
          className="field-sizing-content max-h-48 min-h-6 w-full resize-none bg-transparent text-sm outline-none select-text placeholder:text-muted-foreground"
        />
        <div className="mt-1.5 flex min-w-0 items-center gap-0.5">
          <button
            type="button"
            className="shrink-0 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
            title="Anexar arquivos"
            onClick={() => void pickFiles()}
          >
            <Paperclip className="size-4" />
          </button>
          <button
            type="button"
            className="shrink-0 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
            title="Mencionar arquivo do projeto"
            onClick={() => {
              const value = `${text}${text && !text.endsWith(' ') ? ' ' : ''}@`
              setText(value)
              updateMention(value, value.length)
              ref.current?.focus()
            }}
          >
            <AtSign className="size-4" />
          </button>
          <VoiceButton onText={insertDictation} onError={setError} />
          {configOptions.length > 0 && onConfigChange && (
            <div className="ml-1 flex min-w-0 flex-1 items-center gap-0.5 overflow-hidden border-l pl-1.5">
              <ConfigPickers
                options={configOptions}
                disabled={disabled}
                onChange={async (configId, value) => {
                  try {
                    await onConfigChange(configId, value)
                  } catch (err) {
                    setError((err as Error).message)
                  }
                }}
              />
            </div>
          )}
          <div className="ml-auto shrink-0 pl-1">
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
    </div>
  )
}

/** Nome para conteúdo colado sem nome de arquivo (ex.: print de tela). */
function pastedName(mime: string): string {
  const ext =
    mime
      .split('/')[1]
      ?.replace('jpeg', 'jpg')
      .replace(/[^a-z0-9]/g, '') || 'bin'
  const stamp = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '')
  return `colado-${stamp}.${ext}`
}
