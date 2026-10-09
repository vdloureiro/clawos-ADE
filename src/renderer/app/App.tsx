import { useEffect, useState } from 'react'
import { FolderPlus, Moon, Plus, Sun } from 'lucide-react'
import type { AppInfo } from '@shared/types'
import { Button } from '@/components/ui/button'
import { useThemeStore } from '@/stores/theme'

export function App() {
  const { theme, toggle } = useThemeStore()
  const [info, setInfo] = useState<AppInfo | null>(null)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  useEffect(() => {
    void window.clawos.invoke('app:info').then(setInfo)
  }, [])

  return (
    <div className="flex h-full">
      <aside className="flex w-60 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
        {/* Área arrastável da janela (titleBarStyle hiddenInset no macOS). */}
        <div className="h-11 shrink-0 [-webkit-app-region:drag]" />
        <div className="flex items-center justify-between px-3 pb-2">
          <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Projetos
          </span>
          <Button variant="ghost" size="icon" className="size-7" title="Adicionar projeto">
            <FolderPlus />
          </Button>
        </div>
        <div className="flex-1 px-3 text-sm text-muted-foreground">Nenhum projeto ainda.</div>
        <div className="flex items-center justify-between border-t border-sidebar-border px-3 py-2">
          <span className="text-xs text-muted-foreground">
            Clawos {info ? `v${info.version}` : ''}
          </span>
          <Button variant="ghost" size="icon" className="size-7" onClick={toggle} title="Tema">
            {theme === 'dark' ? <Sun /> : <Moon />}
          </Button>
        </div>
      </aside>

      <main className="flex flex-1 flex-col">
        <div className="h-11 shrink-0 border-b [-webkit-app-region:drag]" />
        <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
          <h1 className="text-2xl font-semibold">Clawos</h1>
          <p className="max-w-sm text-sm text-muted-foreground">
            Vários agentes de código, vários projetos, um chat limpo.
          </p>
          <Button disabled>
            <Plus /> Agente
          </Button>
          {info && (
            <p className="text-xs text-muted-foreground">
              Electron {info.versions.electron} · Chrome {info.versions.chrome} · Node{' '}
              {info.versions.node} · {info.platform}
            </p>
          )}
        </div>
      </main>
    </div>
  )
}
