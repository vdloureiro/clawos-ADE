import { useEffect, useState } from 'react'
import { FolderOpen, Moon, Sun } from 'lucide-react'
import type { AppInfo } from '@shared/types'
import { AgentStatusList } from '@/components/agents/AgentStatusList'
import { ChatPanel } from '@/components/chat/ChatPanel'
import { Button } from '@/components/ui/button'
import { useAgentsStore } from '@/stores/agents'
import { subscribeToSessionEvents, useSessionsStore } from '@/stores/sessions'
import { useThemeStore } from '@/stores/theme'

export function App() {
  const { theme, toggle } = useThemeStore()
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const createSession = useSessionsStore((s) => s.create)
  const claude = useAgentsStore((s) => s.statuses.find((a) => a.id === 'claude'))

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  useEffect(() => {
    void window.clawos.invoke('app:info').then(setInfo)
    void useAgentsStore.getState().refresh()
    return subscribeToSessionEvents()
  }, [])

  // M1: uma sessão por vez, numa pasta escolhida. Projetos e painéis chegam no M2/M3.
  const openFolder = async () => {
    const cwd = await window.clawos.invoke('dialog:pickFolder')
    if (!cwd) return
    if (sessionId) await useSessionsStore.getState().close(sessionId)
    setSessionId(await createSession('claude', cwd))
  }

  const ready = claude?.installed && claude.loggedIn !== false

  return (
    <div className="flex h-full">
      <aside className="flex w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
        {/* Área arrastável da janela (titleBarStyle hiddenInset no macOS). */}
        <div className="h-11 shrink-0 [-webkit-app-region:drag]" />
        <div className="flex-1 overflow-y-auto">
          <AgentStatusList />
        </div>
        <div className="flex items-center justify-between border-t border-sidebar-border px-3 py-2">
          <span className="text-xs text-muted-foreground">
            Clawos {info ? `v${info.version}` : ''}
          </span>
          <Button variant="ghost" size="icon" className="size-7" onClick={toggle} title="Tema">
            {theme === 'dark' ? <Sun /> : <Moon />}
          </Button>
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-11 shrink-0 items-center justify-end border-b px-3 [-webkit-app-region:drag]">
          {sessionId && (
            <Button
              variant="ghost"
              size="sm"
              className="[-webkit-app-region:no-drag]"
              onClick={openFolder}
            >
              <FolderOpen /> Trocar pasta
            </Button>
          )}
        </div>
        <div className="min-h-0 flex-1">
          {sessionId ? (
            <ChatPanel sessionId={sessionId} />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
              <h1 className="text-2xl font-semibold">Clawos</h1>
              <p className="max-w-sm text-sm text-muted-foreground">
                Escolha uma pasta para começar uma conversa com o Claude.
              </p>
              <Button onClick={openFolder} disabled={!ready}>
                <FolderOpen /> Escolher pasta
              </Button>
              {!ready && claude && (
                <p className="text-xs text-muted-foreground">
                  {claude.installed
                    ? 'Entre no Claude pela barra lateral.'
                    : 'Instale o Claude para continuar.'}
                </p>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
