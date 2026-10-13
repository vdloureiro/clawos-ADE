import { useEffect, useRef, useState } from 'react'
import {
  Check,
  Copy,
  Eye,
  FileQuestion,
  FileText,
  FolderOpen,
  Loader2,
  Pencil,
  Save,
  SquareArrowOutUpRight,
  TriangleAlert,
} from 'lucide-react'
import type { FileContent } from '@shared/types'
import { Markdown } from '@/components/chat/Markdown'
import { Button } from '@/components/ui/button'
import { fileName } from '@/lib/filePanels'
import { isRemote } from '@/lib/platform'
import { cn } from '@/lib/utils'
import { useDirtyFiles } from '@/stores/dirtyFiles'
import { CodeEditor, type CodeEditorHandle } from './CodeEditor'
import { editorLanguageFor } from './editorLanguages'
import { FileLinkProvider } from './FileLinks'

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/**
 * - `external`: o arquivo mudou no disco enquanto havia edição não salva aqui.
 * - `save`: ao salvar, o arquivo no disco já não era a versão que a aba abriu.
 */
type Conflict = 'external' | 'save' | null

/**
 * Aba de um arquivo citado no chat: editor com destaque e número de linha (⌘S salva),
 * Markdown formatado com botão para editar, e imagens. Acompanha mudanças no disco sem
 * nunca sobrescrever uma edição não salva sem perguntar.
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
  const [notice, setNotice] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [dirty, setDirtyState] = useState(false)
  const [conflict, setConflict] = useState<Conflict>(null)
  const [saving, setSaving] = useState(false)
  const isMarkdown = editorLanguageFor(path) === 'md'
  const [preview, setPreview] = useState(true)
  const [previewText, setPreviewText] = useState('')
  const editor = useRef<CodeEditorHandle>(null)
  /** Versão do disco que a aba conhece (para detectar mudança externa). */
  const disk = useRef<{ text: string; mtime: number } | null>(null)
  const dirtyRef = useRef(false)
  const setDirtyFile = useDirtyFiles((s) => s.set)

  const flash = (text: string) => {
    setNotice(text)
    setTimeout(() => setNotice((n) => (n === text ? null : n)), 1500)
  }

  const setDirty = (value: boolean) => {
    dirtyRef.current = value
    setDirtyState(value)
    setDirtyFile(path, value)
  }

  useEffect(() => {
    const refresh = () =>
      window.clawos.invoke('files:read', path).then((content) => {
        const known = disk.current
        if (content.kind === 'text') {
          const text = content.text ?? ''
          // Eco do próprio salvamento (ou nada mudou de fato).
          if (known && known.text === text) {
            known.mtime = content.mtime
            return
          }
          if (dirtyRef.current) {
            setConflict('external')
            return
          }
          if (known) {
            editor.current?.replace(text)
            setNotice('atualizado')
            setTimeout(() => setNotice((n) => (n === 'atualizado' ? null : n)), 1500)
          }
          disk.current = { text, mtime: content.mtime }
          setPreviewText(text)
        }
        setFile(content)
      })
    void refresh()
    void window.clawos.invoke('files:watch', path)
    const off = window.clawos.on('files:changed', (e) => {
      if (e.path === path) void refresh()
    })
    return () => {
      off()
      void window.clawos.invoke('files:unwatch', path)
      setDirtyFile(path, false)
    }
  }, [path, setDirtyFile])

  const save = async (force = false) => {
    const handle = editor.current
    if (!handle || saving) return
    const text = handle.getText()
    setSaving(true)
    try {
      const result = await window.clawos.invoke(
        'files:write',
        path,
        text,
        force ? null : (disk.current?.mtime ?? null),
      )
      if (!result.ok) {
        setConflict('save')
        return
      }
      disk.current = { text, mtime: result.mtime }
      handle.markSaved()
      setConflict(null)
      setPreviewText(text)
      flash('salvo')
    } catch (error) {
      setNotice(`erro ao salvar: ${(error as Error).message}`)
    } finally {
      setSaving(false)
    }
  }

  /** Descarta a edição local e carrega o que está no disco. */
  const reloadFromDisk = async () => {
    const content = await window.clawos.invoke('files:read', path)
    if (content.kind !== 'text') return setFile(content)
    const text = content.text ?? ''
    disk.current = { text, mtime: content.mtime }
    editor.current?.replace(text)
    setPreviewText(text)
    setConflict(null)
    setFile(content)
  }

  const copy = async () => {
    await navigator.clipboard.writeText(editor.current?.getText() ?? previewText)
    setCopied(true)
    setTimeout(() => setCopied(false), 1200)
  }

  const isText = file?.kind === 'text'
  const showPreview = isText && isMarkdown && preview

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center gap-2 border-b px-3 py-1.5">
        <FileText className="size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 truncate text-sm font-medium">
            <span className="truncate">{fileName(path)}</span>
            {dirty && (
              <span className="shrink-0 text-[11px] font-normal text-amber-500">● não salvo</span>
            )}
          </div>
          <div className="truncate text-[11px] text-muted-foreground" title={path}>
            {path}
            {file && file.kind !== 'missing' && <> · {formatSize(file.size)}</>}
            {notice && <span className="ml-1.5 text-emerald-500">· {notice}</span>}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          {isText && dirty && (
            <Button size="sm" className="h-7" onClick={() => void save()} disabled={saving}>
              {saving ? <Loader2 className="animate-spin" /> : <Save />} Salvar
              <span className="text-[10px] opacity-60">⌘S</span>
            </Button>
          )}
          {isText && isMarkdown && (
            <ToolButton
              title={preview ? 'Editar' : 'Ver formatado'}
              onClick={() => {
                if (!preview) setPreviewText(editor.current?.getText() ?? previewText)
                setPreview(!preview)
              }}
            >
              {preview ? <Pencil className="size-3.5" /> : <Eye className="size-3.5" />}
            </ToolButton>
          )}
          {isText && (
            <ToolButton title="Copiar conteúdo" onClick={() => void copy()}>
              {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
            </ToolButton>
          )}
          {!isRemote() && (
            <>
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
            </>
          )}
        </div>
      </header>

      {conflict && (
        <div className="flex flex-wrap items-center gap-2 border-b border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs">
          <TriangleAlert className="size-3.5 shrink-0 text-amber-500" />
          <span className="min-w-0 flex-1">
            {conflict === 'external'
              ? 'O arquivo foi alterado fora daqui (ex.: pelo agente) enquanto você editava.'
              : 'O arquivo mudou no disco desde que você abriu. Salvar vai sobrescrever essa mudança.'}
          </span>
          <Button size="sm" variant="outline" className="h-6" onClick={() => void reloadFromDisk()}>
            Usar a versão do disco
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-6"
            onClick={() => (conflict === 'save' ? void save(true) : setConflict(null))}
          >
            {conflict === 'save' ? 'Sobrescrever' : 'Manter a minha'}
          </Button>
        </div>
      )}

      <div className="relative min-h-0 flex-1">
        {!file && (
          <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Abrindo…
          </div>
        )}
        {isText && (
          // O editor fica montado mesmo na visualização do Markdown, para não perder o
          // histórico de desfazer ao alternar.
          <div className={cn('absolute inset-0', showPreview && 'invisible')}>
            <CodeEditor
              ref={editor}
              path={path}
              initialText={file.text ?? ''}
              line={line}
              nonce={nonce}
              onDirtyChange={setDirty}
              onSave={() => void save()}
            />
          </div>
        )}
        {showPreview && (
          <div className="absolute inset-0 overflow-auto select-text">
            <div className="mx-auto max-w-3xl px-6 py-5">
              <FileLinkProvider value={{ projectId, cwd: path.replace(/[\\/][^\\/]*$/, '') }}>
                <Markdown text={previewText} />
              </FileLinkProvider>
            </div>
          </div>
        )}
        {file?.kind === 'image' && (
          <div className="absolute inset-0 flex items-center justify-center overflow-auto bg-[repeating-conic-gradient(var(--muted)_0_25%,transparent_0_50%)] bg-[length:16px_16px] p-6">
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
            {file.kind !== 'missing' && !isRemote() && (
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
      className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
    >
      {children}
    </button>
  )
}
