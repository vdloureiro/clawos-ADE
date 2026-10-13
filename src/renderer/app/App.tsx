import { useEffect, useState } from 'react'
import { Menu, Settings } from 'lucide-react'
import type { AppInfo } from '@shared/types'
import { Onboarding, onboardingDone } from '@/components/onboarding/Onboarding'
import { NewProjectWizard } from '@/components/projects/NewProjectWizard'
import { GlobalSettings } from '@/components/settings/GlobalSettings'
import { ProjectSettings } from '@/components/settings/ProjectSettings'
import { ProjectSidebar } from '@/components/sidebar/ProjectSidebar'
import { Button } from '@/components/ui/button'
import { ErrorBoundary } from '@/components/ui/error-boundary'
import { Workspace } from '@/components/workspace/Workspace'
import { MobileWorkspace } from '@/components/workspace/MobileWorkspace'
import { FolderPicker } from '@/components/remote/FolderPicker'
import { isRemote } from '@/lib/platform'
import { useIsMobile } from '@/lib/useIsMobile'
import { onConnectionChange, type ConnectionState } from '@/lib/webClient'
import { openInDock } from '@/lib/dock'
import { cn } from '@/lib/utils'
import { useAgentsStore } from '@/stores/agents'
import { useActiveProject, useProjectsStore } from '@/stores/projects'
import { subscribeToSessionEvents, useSessionsStore } from '@/stores/sessions'
import { subscribeToTaskEvents } from '@/stores/tasks'
import { useThemeStore } from '@/stores/theme'
import { useUiStore } from '@/stores/ui'
import { CommandPalette } from './CommandPalette'
import { runCommand } from './commands'

export function App() {
  const theme = useThemeStore((s) => s.theme)
  const [info, setInfo] = useState<AppInfo | null>(null)
  const {
    settingsProjectId,
    openProjectSettings,
    globalSettingsOpen,
    setGlobalSettingsOpen,
    newProjectOpen,
    setNewProjectOpen,
    onboardingOpen,
    setOnboardingOpen,
  } = useUiStore()
  const claude = useAgentsStore((s) => s.statuses.find((a) => a.id === 'claude'))
  const mobile = useIsMobile()
  const remote = isRemote()
  const [drawerOpen, setDrawerOpen] = useState(false)

  // Celular: o menu fecha sozinho ao escolher uma conversa, projeto ou tela.
  useEffect(() => {
    const close = () => setDrawerOpen(false)
    const offUi = useUiStore.subscribe((s, prev) => {
      // Escolher um projeto mantém o menu aberto (para escolher a conversa em seguida).
      const viewChanged = JSON.stringify(s.view) !== JSON.stringify(prev.view)
      if (viewChanged || (s.newProjectOpen && !prev.newProjectOpen)) close()
    })
    const offSessions = useSessionsStore.subscribe((s, prev) => {
      if (s.activeByProject !== prev.activeByProject) close()
    })
    return () => {
      offUi()
      offSessions()
    }
  }, [])
  const agentAlert = claude && (!claude.installed || claude.loggedIn === false)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  useEffect(() => {
    void window.clawos.invoke('app:info').then(setInfo)
    // Primeiro acesso (sem projetos): abre o assistente depois de saber o status dos agentes.
    void Promise.all([
      useAgentsStore.getState().refresh(),
      useProjectsStore.getState().load(),
    ]).then(() => {
      if (useProjectsStore.getState().projects.length === 0 && !onboardingDone())
        useUiStore.getState().setOnboardingOpen(true)
    })
    // Ao voltar para a janela (ex.: depois de instalar algo no Terminal), reverifica.
    let lastFocus = 0
    const onFocus = () => {
      if (Date.now() - lastFocus < 10_000) return
      lastFocus = Date.now()
      void useAgentsStore.getState().refresh(true, { quiet: true })
    }
    window.addEventListener('focus', onFocus)
    void useSessionsStore.getState().loadAll()
    const offSessions = subscribeToSessionEvents()
    // Clique numa notificação do SO: leva à sessão que terminou ou pede aprovação.
    const offFocus = window.clawos.on('session:focus', ({ projectId, sessionId }) => {
      void openInDock(projectId, sessionId)
    })
    const offCommand = window.clawos.on('app:command', ({ command }) => runCommand(command))
    const offTasks = subscribeToTaskEvents()
    return () => {
      window.removeEventListener('focus', onFocus)
      offTasks()
      offSessions()
      offFocus()
      offCommand()
    }
  }, [])

  const sidebar = (
    <>
      <ProjectSidebar />
      <div className="flex items-center justify-between border-t border-sidebar-border px-3 py-2">
        <span className="text-xs text-muted-foreground">
          Clawos {info ? `v${info.version}` : ''}
          {remote && ' · remoto'}
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
    </>
  )

  const overlays = (
    <>
      <CommandPalette />
      {settingsProjectId && (
        <ProjectSettings projectId={settingsProjectId} onClose={() => openProjectSettings(null)} />
      )}
      {globalSettingsOpen && <GlobalSettings onClose={() => setGlobalSettingsOpen(false)} />}
      {onboardingOpen && <Onboarding onClose={() => setOnboardingOpen(false)} />}
      {newProjectOpen && <NewProjectWizard onClose={() => setNewProjectOpen(false)} />}
      {remote && <FolderPicker />}
    </>
  )

  if (mobile)
    return (
      <div className="flex h-full flex-col">
        <ConnectionBanner />
        <header className="flex h-12 shrink-0 items-center gap-2 border-b px-2">
          <Button
            variant="ghost"
            size="icon"
            className="size-9"
            onClick={() => setDrawerOpen(true)}
            title="Menu"
          >
            <Menu className="size-5" />
          </Button>
          <MobileTitle />
        </header>
        <main className="min-h-0 flex-1">
          <ErrorBoundary label="O workspace encontrou um erro.">
            <MobileWorkspace />
          </ErrorBoundary>
        </main>
        {drawerOpen && (
          <div className="fixed inset-0 z-40 flex">
            <aside className="flex w-[85%] max-w-80 flex-col border-r border-sidebar-border bg-sidebar pt-3 text-sidebar-foreground shadow-xl">
              {sidebar}
            </aside>
            <button
              type="button"
              aria-label="Fechar menu"
              className="flex-1 bg-black/50"
              onClick={() => setDrawerOpen(false)}
            />
          </div>
        )}
        {overlays}
      </div>
    )

  return (
    <div className="flex h-full flex-col">
      <ConnectionBanner />
      <div className="flex min-h-0 flex-1">
        <aside className="flex w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
          {/* Área arrastável da janela (titleBarStyle hiddenInset no macOS). */}
          <div className="h-11 shrink-0 [-webkit-app-region:drag]" />
          {sidebar}
        </aside>

        <main className="flex min-w-0 flex-1 flex-col">
          <ErrorBoundary label="O workspace encontrou um erro.">
            <Workspace />
          </ErrorBoundary>
        </main>
      </div>
      {overlays}
    </div>
  )
}

/** Título da barra do celular: projeto e conversa (ou Tarefas). */
function MobileTitle() {
  const project = useActiveProject()
  const view = useUiStore((s) => s.view)
  const title = useSessionsStore((s) => {
    const id = project ? s.activeByProject[project.id] : null
    return id ? (s.chats[id]?.info.title ?? null) : null
  })
  if (view.kind === 'tasks') return <span className="text-sm font-medium">Tarefas</span>
  if (!project) return <span className="text-sm font-medium">Clawos</span>
  return (
    <div className="min-w-0 flex-1">
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <span className="size-2 shrink-0 rounded-full" style={{ background: project.color }} />
        <span className="truncate">{project.name}</span>
      </div>
      <div className="truncate text-sm font-medium">{title ?? 'Nenhuma conversa aberta'}</div>
    </div>
  )
}

/** Aviso do acesso remoto quando a conexão com o computador cai. */
function ConnectionBanner() {
  const [state, setState] = useState<ConnectionState>('online')
  useEffect(() => {
    if (isRemote()) onConnectionChange(setState)
  }, [])
  if (!isRemote() || state === 'online' || state === 'connecting') return null
  return (
    <div
      className={cn(
        'flex items-center justify-center gap-2 px-3 py-1.5 text-xs',
        state === 'unauthorized'
          ? 'bg-red-500/15 text-red-600 dark:text-red-400'
          : 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
      )}
    >
      {state === 'unauthorized' ? (
        <>
          Este aparelho foi desconectado do Clawos.
          <button type="button" className="underline" onClick={() => location.reload()}>
            Parear de novo
          </button>
        </>
      ) : (
        'Sem conexão com o computador — tentando reconectar…'
      )}
    </div>
  )
}
