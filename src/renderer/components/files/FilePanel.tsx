import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  Check,
  Code2,
  Copy,
  Eye,
  FileQuestion,
  FileText,
  FolderOpen,
  Loader2,
  SquareArrowOutUpRight,
} from 'lucide-react'
import type { FileContent } from '@shared/types'
import { Markdown } from '@/components/chat/Markdown'
import { Button } from '@/components/ui/button'
import { fileName } from '@/lib/filePanels'
import { highlight, langForPath } from '@/lib/highlight'
import { cn } from '@/lib/utils'
import { FileLinkProvider } from './FileLinks'

/** Acima disso, sem destaque de sintaxe (fica lento); só texto com número de linha. */
const MAX_HIGHLIGHT_CHARS = 300_000

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Mesmo formato do shiki (`span.line`), para os números de linha via CSS. */
function plainHtml(text: string): string {
  const lines = text.split('\n').map((l) => `<span class="line">${escapeHtml(l)}</span>`)
  return `<pre><code>${lines.join('\n')}</code></pre>`
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/**
 * Aba que mostra um arquivo citado pelo agente: código com destaque e número de linha,
 * Markdown renderizado (com opção de ver o código) e imagens. Atualiza sozinha quando o
 * arquivo muda no disco.
 */
export function FilePanel({
  path,
  line,
  nonce,
  projectId,
}: {
  path: string
  line?: number
  nonce?: number
  projectId: string
}) {
  const [file, setFile] = useState<FileContent | null>(null)
  const [flash, setFlash] = useState(false)
  const [copied, setCopied] = useState(false)
  const lang = langForPath(path)
  const isMarkdown = lang === 'md' || lang === 'markdown' || lang === 'mdx'
  const [preview, setPreview] = useState(true)
  const codeRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let first = true
    const refresh = () =>
      window.clawos.invoke('files:read', path).then((content) => {
        setFile(content)
        if (first) {
          first = false
          return
        }
        setFlash(true)
        setTimeout(() => setFlash(false), 1200)
      })
    void refresh()
    void window.clawos.invoke('files:watch', path)
    const off = window.clawos.on('files:changed', (e) => {
      if (e.path === path) void refresh()
    })
    return () => {
      off()
      void window.clawos.invoke('files:unwatch', path)
    }
  }, [path])

  const text = file?.kind === 'text' ? (file.text ?? '') : null
  // Destaque de sintaxe é assíncrono; enquanto não chega (ou se o arquivo for grande
  // demais), mostra o texto puro com número de linha.
  const [highlighted, setHighlighted] = useState<{ text: string; html: string } | null>(null)
  useEffect(() => {
    if (text === null || text.length > MAX_HIGHLIGHT_CHARS) return
    let alive = true
    void highlight(text, lang).then((result) => {
      if (alive && result) setHighlighted({ text, html: result })
    })
    return () => {
      alive = false
    }
  }, [text, lang])
  const html = useMemo(() => {
    if (text === null) return null
    return highlighted?.text === text ? highlighted.html : plainHtml(text)
  }, [text, highlighted])

  const showCode = text !== null && (!isMarkdown || !preview)

  // Rola até a linha pedida (ex.: link `schema.sql:42`) e a destaca.
  useLayoutEffect(() => {
    if (!showCode || !line || !html || !codeRef.current) return
    const lines = codeRef.current.querySelectorAll('.line')
    for (const el of lines) el.classList.remove('target')
    const target = lines[line - 1]
    if (!target) return
    target.classList.add('target')
    target.scrollIntoView({ block: 'center' })
  }, [showCode, line, nonce, html])

  const copy = async () => {
    if (text === null) return
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1200)
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center gap-2 border-b px-3 py-1.5">
        <FileText className="size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{fileName(path)}</div>
          <div className="truncate text-[11px] text-muted-foreground" title={path}>
            {path}
            {file && file.kind !== 'missing' && <> · {formatSize(file.size)}</>}
            {flash && <span className="ml-1.5 text-emerald-500">· atualizado</span>}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          {isMarkdown && text !== null && (
            <ToolButton
              title={preview ? 'Ver código' : 'Ver formatado'}
              onClick={() => setPreview(!preview)}
            >
              {preview ? <Code2 className="size-3.5" /> : <Eye className="size-3.5" />}
            </ToolButton>
          )}
          {text !== null && (
            <ToolButton title="Copiar conteúdo" onClick={() => void copy()}>
              {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
            </ToolButton>
          )}
          <ToolButton
            title="Abrir no app padrão"
            onClick={() => void window.clawos.invoke('shell:openPath', path)}
          >
            <SquareArrowOutUpRight className="size-3.5" />
          </ToolButton>
          <ToolButton
            title="Mostrar no Finder"
            onClick={() => void window.clawos.invoke('shell:showItem', path)}
          >
            <FolderOpen className="size-3.5" />
          </ToolButton>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-auto select-text">
        {!file && (
          <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Abrindo…
          </div>
        )}
        {file?.kind === 'text' && isMarkdown && preview && (
          <div className="mx-auto max-w-3xl px-6 py-5">
            <FileLinkProvider value={{ projectId, cwd: path.replace(/[\\/][^\\/]*$/, '') }}>
              <Markdown text={text ?? ''} />
            </FileLinkProvider>
          </div>
        )}
        {showCode && (
          <div
            ref={codeRef}
            className="file-code py-2 font-mono text-xs leading-5"
            // HTML do shiki ou texto já escapado.
            dangerouslySetInnerHTML={{ __html: html ?? '' }}
          />
        )}
        {file?.kind === 'image' && (
          <div className="flex min-h-full items-center justify-center bg-[repeating-conic-gradient(var(--muted)_0_25%,transparent_0_50%)] bg-[length:16px_16px] p-6">
            <img src={file.dataUrl} alt={fileName(path)} className="max-h-full max-w-full" />
          </div>
        )}
        {file && ['binary', 'too_large', 'missing'].includes(file.kind) && (
          <div className="flex flex-col items-center justify-center gap-3 p-10 text-center text-sm text-muted-foreground">
            <FileQuestion className="size-8 opacity-60" />
            {file.kind === 'missing' &&
              'Arquivo não encontrado. Ele pode ter sido movido ou apagado.'}
            {file.kind === 'binary' && 'Este arquivo não é texto e não pode ser exibido aqui.'}
            {file.kind === 'too_large' &&
              `Arquivo grande demais para exibir aqui (${formatSize(file.size)}).`}
            {file.kind !== 'missing' && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => void window.clawos.invoke('shell:openPath', path)}
              >
                <SquareArrowOutUpRight /> Abrir no app padrão
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function ToolButton({
  title,
  onClick,
  children,
}: {
  title: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={cn('rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground')}
    >
      {children}
    </button>
  )
}
