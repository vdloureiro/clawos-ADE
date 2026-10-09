import { useEffect, useState } from 'react'
import { Settings } from 'lucide-react'
import type { AppInfo } from '@shared/types'
import { GlobalSettings } from '@/components/settings/GlobalSettings'
import { ProjectSettings } from '@/components/settings/ProjectSettings'
import { ProjectSidebar } from '@/components/sidebar/ProjectSidebar'
import { Button } from '@/components/ui/button'
import { ErrorBoundary } from '@/components/ui/error-boundary'
import { Workspace } from '@/components/workspace/Workspace'
import { openInDock } from '@/lib/dock'
import { cn } from '@/lib/utils'
import { useAgentsStore } from '@/stores/agents'
import { useProjectsStore } from '@/stores/projects'
import { subscribeToSessionEvents, useSessionsStore } from '@/stores/sessions'
import { useThemeStore } from '@/stores/theme'
import { useUiStore } from '@/stores/ui'
import { CommandPalette } from './CommandPalette'
import { runCommand } from './commands'

export function App() {
  const theme = useThemeStore((s) => s.theme)
  const [info, setInfo] = useState<AppInfo | null>(null)
  const { settingsProjectId, openProjectSettings, globalSettingsOpen, setGlobalSettingsOpen } =
    useUiStore()
  const claude = useAgentsStore((s) => s.statuses.find((a) => a.id === 'claude'))
  const agentAlert = claude && (!claude.installed || claude.loggedIn === false)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  useEffect(() => {
    void window.clawos.invoke('app:info').then(setInfo)
    void useAgentsStore.getState().refresh()
    void useProjectsStore.getState().load()
    void useSessionsStore.getState().loadAll()
    const offSessions = subscribeToSessionEvents()
    // Clique numa notificação do SO: leva à sessão que terminou ou pede aprovação.
    const offFocus = window.clawos.on('session:focus', ({ projectId, sessionId }) => {
      void openInDock(projectId, sessionId)
    })
    const offCommand = window.clawos.on('app:command', ({ command }) => runCommand(command))
    return () => {
      offSessions()
      offFocus()
      offCommand()
    }
  }, [])

  return (
    <div className="flex h-full">
      <aside className="flex w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
        {/* Área arrastável da janela (titleBarStyle hiddenInset no macOS). */}
        <div className="h-11 shrink-0 [-webkit-app-region:drag]" />
        <ProjectSidebar />
        <div className="flex items-center justify-between border-t border-sidebar-border px-3 py-2">
          <span className="text-xs text-muted-foreground">
            Clawos {info ? `v${info.version}` : ''}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className={cn('relative size-7', agentAlert && 'text-amber-500')}
            onClick={() => setGlobalSettingsOpen(true)}
            title="Configurações e agentes"
          >
            <Settings />
            {agentAlert && (
              <span className="absolute top-1 right-1 size-1.5 rounded-full bg-amber-500" />
            )}
          </Button>
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <ErrorBoundary label="O workspace encontrou um erro.">
          <Workspace />
        </ErrorBoundary>
      </main>

      <CommandPalette />
      {settingsProjectId && (
        <ProjectSettings projectId={settingsProjectId} onClose={() => openProjectSettings(null)} />
      )}
      {globalSettingsOpen && <GlobalSettings onClose={() => setGlobalSettingsOpen(false)} />}
    </div>
  )
}
