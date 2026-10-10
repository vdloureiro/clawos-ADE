import type { SerializedDockview } from 'dockview-react'
import { fileName, isFilePanel, pathOfPanel } from './filePanels'

type GridNode = SerializedDockview['grid']['root']
interface LeafData {
  views: string[]
  activeView?: string
  id: string
}

function leaves(node: GridNode, out: LeafData[] = []): LeafData[] {
  if (node.type === 'leaf') out.push(node.data as LeafData)
  else for (const child of node.data as GridNode[]) leaves(child, out)
  return out
}

/** Painel de chat serializado para uma sessão. */
export function chatPanelState(
  sessionId: string,
  title: string,
): SerializedDockview['panels'][string] {
  return {
    id: sessionId,
    contentComponent: 'chat',
    tabComponent: 'chat',
    params: { sessionId },
    title,
  }
}

/** Aba de visualização de um arquivo. */
export function filePanelState(id: string): SerializedDockview['panels'][string] {
  const path = pathOfPanel(id)
  return {
    id,
    contentComponent: 'file',
    tabComponent: 'file',
    params: { path },
    title: fileName(path),
  }
}

/** Estado serializado de qualquer painel (conversa ou arquivo) a partir do id. */
export function panelState(id: string, title: (sessionId: string) => string) {
  return isFilePanel(id) ? filePanelState(id) : chatPanelState(id, title(id))
}

/**
 * Remove de um layout salvo os painéis cujas sessões não existem mais (apagadas),
 * mantendo a estrutura de grupos. Atualiza títulos a partir de `title`.
 */
export function sanitizeLayout(
  layout: SerializedDockview,
  exists: (sessionId: string) => boolean,
  title: (sessionId: string) => string,
): SerializedDockview {
  const copy = structuredClone(layout)
  const panels: SerializedDockview['panels'] = {}
  for (const [id, panel] of Object.entries(copy.panels)) {
    // Abas de arquivo ficam (o painel mostra "arquivo não encontrado" se ele sumir).
    if (isFilePanel(id)) {
      panels[id] = filePanelState(id)
      continue
    }
    const sessionId = (panel.params?.['sessionId'] as string | undefined) ?? id
    if (exists(sessionId)) panels[id] = { ...panel, title: title(sessionId) }
  }
  for (const leaf of leaves(copy.grid.root)) {
    leaf.views = leaf.views.filter((v) => v in panels)
    if (leaf.activeView && !(leaf.activeView in panels)) leaf.activeView = leaf.views[0]
  }
  copy.panels = panels
  return copy
}

/**
 * Aplica a estrutura de um preset salvo às sessões abertas agora: cada "vaga" do preset
 * recebe a próxima sessão, na ordem; sessões que sobrarem vão para o primeiro grupo.
 */
export function remapLayout(
  preset: SerializedDockview,
  sessionIds: string[],
  title: (sessionId: string) => string,
): SerializedDockview {
  const copy = structuredClone(preset)
  const queue = [...sessionIds]
  const groups = leaves(copy.grid.root)
  for (const leaf of groups) {
    leaf.views = leaf.views.map(() => queue.shift()).filter((v): v is string => Boolean(v))
    leaf.activeView = leaf.views[0]
  }
  if (queue.length > 0 && groups[0]) {
    groups[0].views.push(...queue)
    groups[0].activeView ??= groups[0].views[0]
  }
  copy.panels = Object.fromEntries(sessionIds.map((id) => [id, panelState(id, title)]))
  delete copy.activeGroup
  return copy
}
