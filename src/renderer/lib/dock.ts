import type { DockviewApi } from 'dockview-react'
import type { AgentId, SessionMode } from '@shared/types'
import { useProjectsStore } from '@/stores/projects'
import { useSessionsStore } from '@/stores/sessions'
import { chatPanelState, remapLayout } from './layout'

/**
 * Ponte entre o estado da aplicação e as instâncias do dockview (uma por projeto
 * visitado, mantidas montadas para a troca de projeto ser instantânea).
 */
const apis = new Map<string, DockviewApi>()
const pending = new Map<string, { sessionId: string; groupId?: string }[]>()

export function registerDock(projectId: string, api: DockviewApi): void {
  apis.set(projectId, api)
  for (const item of pending.get(projectId) ?? []) placePanel(api, item.sessionId, item.groupId)
  pending.delete(projectId)
}

export function unregisterDock(projectId: string): void {
  apis.delete(projectId)
}

export function getDock(projectId: string): DockviewApi | undefined {
  return apis.get(projectId)
}

export function sessionTitle(sessionId: string): string {
  const all = Object.values(useSessionsStore.getState().summaries).flat()
  return all.find((s) => s.id === sessionId)?.title ?? 'Conversa'
}

function placePanel(api: DockviewApi, sessionId: string, groupId?: string): void {
  const existing = api.getPanel(sessionId)
  if (existing) {
    existing.api.setActive()
    return
  }
  const group = (groupId && api.getGroup(groupId)) || api.activeGroup
  const state = chatPanelState(sessionId, sessionTitle(sessionId))
  api.addPanel({
    id: state.id,
    component: 'chat',
    tabComponent: 'chat',
    params: state.params,
    title: state.title,
    ...(group && { position: { referenceGroup: group.id } }),
  })
}

/** Abre (ou foca) uma conversa num painel do seu projeto, trocando de projeto se preciso. */
export async function openInDock(
  projectId: string,
  sessionId: string,
  groupId?: string,
): Promise<void> {
  useProjectsStore.getState().select(projectId)
  await useSessionsStore.getState().load(sessionId)
  const api = apis.get(projectId)
  if (api) placePanel(api, sessionId, groupId)
  else pending.set(projectId, [...(pending.get(projectId) ?? []), { sessionId, groupId }])
}

/** Cria uma sessão nova e abre num painel (no grupo indicado ou no ativo). */
export async function newSessionInDock(
  projectId: string,
  options: { agentId?: AgentId; groupId?: string; mode?: SessionMode } = {},
) {
  let summary
  try {
    summary = await useSessionsStore.getState().create(projectId, options.agentId, options.mode)
  } catch (error) {
    alert(cleanIpcError(error))
    return
  }
  await openInDock(projectId, summary.id, options.groupId)
}

/** Fecha o painel e encerra o processo do agente (o histórico continua salvo). */
export async function closeSessionPanel(projectId: string, sessionId: string): Promise<void> {
  const chat = useSessionsStore.getState().chats[sessionId]
  const busy = chat && (chat.status === 'working' || chat.status === 'awaiting_permission')
  if (
    busy &&
    !confirm('O agente ainda está trabalhando. Fechar o painel interrompe a sessão. Continuar?')
  )
    return
  apis.get(projectId)?.getPanel(sessionId)?.api.close()
  await window.clawos.invoke('session:stop', sessionId)
}

/** Remove o painel de uma sessão apagada, se estiver aberto. */
export function removeSessionPanel(projectId: string, sessionId: string): void {
  apis.get(projectId)?.getPanel(sessionId)?.api.close()
}

// ---------------------------------------------------------------------------
// Presets

export type BuiltInPreset = 'single' | 'two' | 'oneTwo' | 'grid'

export const BUILT_IN_PRESETS: { id: BuiltInPreset; name: string }[] = [
  { id: 'single', name: '1 painel' },
  { id: 'two', name: '2 lado a lado' },
  { id: 'oneTwo', name: '1 grande + 2 laterais' },
  { id: 'grid', name: 'Grade 2×2' },
]

/** Ids das sessões abertas, na ordem visual dos grupos. */
function openSessions(api: DockviewApi): string[] {
  return api.groups.flatMap((g) => g.panels.map((p) => p.id))
}

export function applyBuiltInPreset(projectId: string, preset: BuiltInPreset): void {
  const api = apis.get(projectId)
  if (!api) return
  const ids = openSessions(api)
  api.clear()

  const g1 = api.addGroup()
  const groups = [g1]
  if (preset === 'two') {
    groups.push(api.addGroup({ referenceGroup: g1, direction: 'right' }))
  } else if (preset === 'oneTwo') {
    const g2 = api.addGroup({ referenceGroup: g1, direction: 'right' })
    groups.push(g2, api.addGroup({ referenceGroup: g2, direction: 'below' }))
  } else if (preset === 'grid') {
    const g2 = api.addGroup({ referenceGroup: g1, direction: 'right' })
    groups.push(
      g2,
      api.addGroup({ referenceGroup: g1, direction: 'below' }),
      api.addGroup({ referenceGroup: g2, direction: 'below' }),
    )
  }
  ids.forEach((id, index) => placePanel(api, id, groups[index % groups.length]!.id))
  if (preset === 'oneTwo') g1.api.setSize({ width: Math.round(api.width * 0.58) })
}

export function applySavedPreset(projectId: string, json: string): void {
  const api = apis.get(projectId)
  if (!api) return
  const layout = remapLayout(JSON.parse(json), openSessions(api), sessionTitle)
  api.fromJSON(layout)
}

export function currentLayoutJson(projectId: string): string | null {
  const api = apis.get(projectId)
  return api ? JSON.stringify(api.toJSON()) : null
}

/** Remove o prefixo que o Electron adiciona a erros de IPC. */
export function cleanIpcError(error: unknown): string {
  return String((error as Error)?.message ?? error).replace(
    /^Error invoking remote method '[^']+': (Error: )?/,
    '',
  )
}
