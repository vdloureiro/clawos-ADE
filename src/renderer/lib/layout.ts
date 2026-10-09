import type { SerializedDockview } from 'dockview-react'

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
  copy.panels = Object.fromEntries(sessionIds.map((id) => [id, chatPanelState(id, title(id))]))
  delete copy.activeGroup
  return copy
}
