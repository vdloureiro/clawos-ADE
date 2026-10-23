import type { AppCommand } from '@shared/ipc'
import { closeActiveFilePanel, closeSessionPanel, newSessionInDock } from '@/lib/dock'
import { useProjectsStore } from '@/stores/projects'
import { useSessionsStore } from '@/stores/sessions'
import { useThemeStore } from '@/stores/theme'
import { useUiStore } from '@/stores/ui'

/** Executa um comando vindo do menu nativo (atalhos de teclado). */
export function runCommand(command: AppCommand): void {
  const projects = useProjectsStore.getState()
  const ui = useUiStore.getState()
  const projectId = projects.activeId
  const sessionId = projectId ? useSessionsStore.getState().activeByProject[projectId] : null

  switch (command) {
    case 'new-agent':
      if (projectId) void newSessionInDock(projectId)
      return
    case 'add-project':
      void projects.add()
      return
    case 'close-panel':
      if (projectId && closeActiveFilePanel(projectId)) return
      if (projectId && sessionId) void closeSessionPanel(projectId, sessionId)
      return
    case 'stop-agent':
      if (sessionId) void window.clawos.invoke('session:cancel', sessionId)
      return
    case 'palette':
      ui.setPaletteOpen(!ui.paletteOpen)
      return
    case 'settings':
      ui.setGlobalSettingsOpen(true)
      return
    case 'project-settings':
      if (projectId) ui.openProjectSettings(projectId)
      return
    case 'toggle-theme':
      useThemeStore.getState().toggle()
      return
    case 'toggle-terminal':
      if (projectId) ui.toggleTerminal(projectId)
      return
    default: {
      const index = Number(command.replace('project-', '')) - 1
      const project = projects.projects[index]
      if (project) projects.select(project.id)
    }
  }
}

export const SHORTCUTS: [string, string][] = [
  ['⌘K', 'Busca rápida de projetos e conversas'],
  ['⌘T', 'Novo agente no projeto atual'],
  ['⌘W', 'Fechar o painel ativo'],
  ['⌘.', 'Parar o agente do painel ativo'],
  ['⌘1…9', 'Ir para o projeto 1…9'],
  ['⌘O', 'Adicionar projeto'],
  ['⌘,', 'Configurações'],
  ['⌘⇧,', 'Configurações do projeto'],
  ['⌘⇧L', 'Alternar tema claro/escuro'],
  ['⌃`', 'Abrir/fechar o terminal do projeto'],
  ['Enter / ⇧Enter', 'Enviar / quebrar linha no chat'],
  ['@', 'Mencionar arquivo do projeto'],
]
