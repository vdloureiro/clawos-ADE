import { useState } from 'react'
import { ExternalLink, FileDiff, GitBranch, GitMerge, Loader2, Trash2 } from 'lucide-react'
import type { SessionSummary, WorktreeDiff } from '@shared/types'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { cleanIpcError, removeSessionPanel } from '@/lib/dock'
import { useSessionsStore } from '@/stores/sessions'
import { DiffView } from './DiffView'

/** Ações da worktree isolada de uma sessão: diff, editor, mesclar e descartar. */
export function WorktreeBar({ summary, busy }: { summary: SessionSummary; busy: boolean }) {
  const [diff, setDiff] = useState<WorktreeDiff | null>(null)
  const [loading, setLoading] = useState<'diff' | 'merge' | null>(null)
  const remove = useSessionsStore((s) => s.remove)

  const run = async <T,>(kind: 'diff' | 'merge', fn: () => Promise<T>): Promise<T | undefined> => {
    setLoading(kind)
    try {
      return await fn()
    } catch (error) {
      alert(cleanIpcError(error))
      return undefined
    } finally {
      setLoading(null)
    }
  }

  const showDiff = async () => {
    const result = await run('diff', () => window.clawos.invoke('worktree:diff', summary.id))
    if (result) setDiff(result)
  }

  const merge = async () => {
    if (
      !confirm(
        `Commitar as alterações da worktree e mesclar "${summary.branch}" em "${summary.baseBranch}"?`,
      )
    )
      return
    // O resultado aparece como aviso no próprio chat.
    await run('merge', () => window.clawos.invoke('worktree:merge', summary.id))
  }

  const discard = async () => {
    if (!confirm('Descartar a worktree? As alterações não mescladas e a conversa serão apagadas.'))
      return
    removeSessionPanel(summary.projectId, summary.id)
    await remove(summary.id, summary.projectId)
  }

  return (
    <div className="flex items-center gap-1 border-b bg-muted/30 px-3 py-1 text-xs">
      <GitBranch className="size-3 text-muted-foreground" />
      <span className="truncate font-mono" title="Worktree isolada">
        {summary.branch} <span className="text-muted-foreground">→ {summary.baseBranch}</span>
      </span>
      <div className="ml-auto flex shrink-0 items-center gap-0.5">
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs"
          onClick={() => void showDiff()}
          disabled={loading !== null}
        >
          {loading === 'diff' ? <Loader2 className="animate-spin" /> : <FileDiff />} Diff
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs"
          onClick={() =>
            void window.clawos
              .invoke('worktree:openEditor', summary.id)
              .catch((e) => alert(cleanIpcError(e)))
          }
        >
          <ExternalLink /> Editor
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs"
          onClick={() => void merge()}
          disabled={loading !== null || busy}
          title={busy ? 'Aguarde o agente terminar' : undefined}
        >
          {loading === 'merge' ? <Loader2 className="animate-spin" /> : <GitMerge />} Mesclar
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs text-red-600 dark:text-red-400"
          onClick={() => void discard()}
        >
          <Trash2 /> Descartar
        </Button>
      </div>
      {diff && <DiffModal diff={diff} onClose={() => setDiff(null)} />}
    </div>
  )
}

function DiffModal({ diff, onClose }: { diff: WorktreeDiff; onClose: () => void }) {
  return (
    <Modal
      title={`${diff.branch} → ${diff.baseBranch} · ${diff.files.length} arquivo(s)`}
      onClose={onClose}
      className="h-[85vh] max-w-4xl"
    >
      <div className="space-y-3 p-4">
        {diff.files.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhuma alteração em relação à base.</p>
        )}
        {diff.files.map((file) =>
          file.binary ? (
            <div key={file.path} className="rounded-md border px-3 py-2 font-mono text-xs">
              {file.path}{' '}
              <span className="text-muted-foreground">— binário ou grande demais para exibir</span>
            </div>
          ) : file.status === 'D' ? (
            <div
              key={file.path}
              className="rounded-md border px-3 py-2 font-mono text-xs text-red-600 dark:text-red-400"
            >
              {file.path} — removido
            </div>
          ) : (
            <DiffView
              key={file.path}
              path={file.path}
              oldText={file.oldText}
              newText={file.newText ?? ''}
            />
          ),
        )}
      </div>
    </Modal>
  )
}
