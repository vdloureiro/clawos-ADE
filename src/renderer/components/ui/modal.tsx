import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from './button'

export function Modal({
  title,
  onClose,
  children,
  className,
}: {
  title: ReactNode
  onClose: () => void
  children: ReactNode
  className?: string
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Portal no body: dentro de painéis do dockview, `position: fixed` ficaria preso ao painel.
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className={cn(
          'flex max-h-full w-full max-w-2xl flex-col overflow-hidden rounded-lg border bg-background shadow-xl',
          className,
        )}
      >
        <div className="flex items-center justify-between border-b px-4 py-2.5">
          <div className="text-sm font-medium">{title}</div>
          <Button variant="ghost" size="icon" className="size-7" onClick={onClose} title="Fechar">
            <X />
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>,
    document.body,
  )
}
