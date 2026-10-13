import { useEffect, useState } from 'react'
import { ArrowUp, Check, Folder, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { useFolderPicker } from '@/lib/platform'

/** Escolher uma pasta do computador pelo navegador (acesso remoto). */
export function FolderPicker() {
  const request = useFolderPicker((s) => s.request)
  const close = useFolderPicker((s) => s.close)
  const [listing, setListing] = useState<{
    path: string
    parent: string | null
    dirs: string[]
  } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = (path: string | null) =>
    window.clawos
      .invoke('fs:listDirs', path)
      .then((result) => {
        setError(null)
        setListing(result)
      })
      .catch((e: Error) => setError(e.message))
  const open = (path: string | null) => void load(path)

  useEffect(() => {
    if (request) void load(null)
  }, [request])

  if (!request) return null
  return (
    <Modal title={request.title} onClose={() => close(null)} className="max-w-lg">
      <div className="flex max-h-[70vh] flex-col">
        <div className="flex items-center gap-2 border-b px-4 py-2">
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            disabled={!listing?.parent}
            onClick={() => listing?.parent && open(listing.parent)}
            title="Pasta acima"
          >
            <ArrowUp />
          </Button>
          <span className="min-w-0 flex-1 truncate font-mono text-xs" title={listing?.path}>
            {listing?.path ?? '…'}
          </span>
        </div>
        <div className="min-h-40 flex-1 overflow-y-auto p-2">
          {!listing && !error && (
            <div className="flex items-center gap-2 p-3 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Carregando…
            </div>
          )}
          {error && <p className="p-3 text-sm text-red-600">{error}</p>}
          {listing?.dirs.length === 0 && (
            <p className="p-3 text-sm text-muted-foreground">Nenhuma subpasta aqui.</p>
          )}
          {listing?.dirs.map((dir) => (
            <button
              key={dir}
              type="button"
              onClick={() => open(dir)}
              className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm hover:bg-accent"
            >
              <Folder className="size-4 shrink-0 text-muted-foreground" />
              <span className="truncate">{dir.split('/').pop()}</span>
            </button>
          ))}
        </div>
        <div className="flex justify-end gap-2 border-t px-4 py-3">
          <Button variant="outline" size="sm" onClick={() => close(null)}>
            Cancelar
          </Button>
          <Button size="sm" disabled={!listing} onClick={() => listing && close(listing.path)}>
            <Check /> Escolher esta pasta
          </Button>
        </div>
      </div>
    </Modal>
  )
}
