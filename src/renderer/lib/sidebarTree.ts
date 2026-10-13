import type { Project, ProjectFolder, SidebarArrangement } from '@shared/types'

/** Item do nível de cima da barra lateral: uma pasta (com seus projetos) ou um projeto solto. */
export type SidebarItem =
  | { type: 'folder'; folder: ProjectFolder; projects: Project[] }
  | { type: 'project'; project: Project }

/** Monta a árvore: pastas e projetos soltos intercalados pela ordem gravada. */
export function buildTree(projects: Project[], folders: ProjectFolder[]): SidebarItem[] {
  const known = new Set(folders.map((f) => f.id))
  const top: { order: number; item: SidebarItem }[] = [
    ...folders.map((folder) => ({
      order: folder.sortOrder,
      item: {
        type: 'folder' as const,
        folder,
        projects: projects
          .filter((p) => p.folderId === folder.id)
          .sort((a, b) => a.sortOrder - b.sortOrder),
      },
    })),
    ...projects
      // Pasta desconhecida (ex.: apagada em outra janela): mostra o projeto solto.
      .filter((p) => !p.folderId || !known.has(p.folderId))
      .map((project) => ({
        order: project.sortOrder,
        item: { type: 'project' as const, project },
      })),
  ]
  return top.sort((a, b) => a.order - b.order).map((t) => t.item)
}

export function toArrangement(tree: SidebarItem[]): SidebarArrangement {
  return tree.map((item) =>
    item.type === 'folder'
      ? { type: 'folder', id: item.folder.id, projectIds: item.projects.map((p) => p.id) }
      : { type: 'project', id: item.project.id },
  )
}

export type DragSource = { type: 'project'; id: string } | { type: 'folder'; id: string }

/**
 * Onde soltar:
 * - `before-project`: antes de um projeto (na pasta dele, ou no nível de cima);
 * - `before-folder`: antes de uma pasta, no nível de cima;
 * - `into-folder`: no fim de uma pasta;
 * - `root-end`: no fim da lista, solto.
 */
export type DropTarget =
  | { kind: 'before-project'; id: string }
  | { kind: 'before-folder'; id: string }
  | { kind: 'into-folder'; id: string }
  | { kind: 'root-end' }

/**
 * Nova ordem da barra lateral depois de soltar `source` em `target`, ou null se o
 * movimento não muda nada. Pastas não se aninham: soltar uma pasta numa pasta (ou num
 * projeto dentro dela) a posiciona antes daquela pasta.
 */
export function moveInTree(
  tree: SidebarItem[],
  source: DragSource,
  target: DropTarget,
): SidebarArrangement | null {
  const items = toArrangement(tree)
  const folderOf = (projectId: string) =>
    items.find((i) => i.type === 'folder' && i.projectIds.includes(projectId))

  if (source.type === 'folder') {
    if (target.kind === 'before-folder' && target.id === source.id) return null
    if (target.kind === 'into-folder' && target.id === source.id) return null
    const moving = items.find((i) => i.type === 'folder' && i.id === source.id)
    if (!moving) return null
    const rest = items.filter((i) => i !== moving)
    let index = rest.length
    if (target.kind === 'before-folder' || target.kind === 'into-folder')
      index = rest.findIndex((i) => i.type === 'folder' && i.id === target.id)
    else if (target.kind === 'before-project') {
      const parent = folderOf(target.id)
      index = parent
        ? parent.type === 'folder' && parent.id === source.id
          ? -1
          : rest.indexOf(parent)
        : rest.findIndex((i) => i.type === 'project' && i.id === target.id)
    }
    if (index < 0) return null
    rest.splice(index, 0, moving)
    return rest
  }

  // Projeto: tira de onde estiver…
  if (target.kind === 'before-project' && target.id === source.id) return null
  const without: SidebarArrangement = items
    .filter((i) => !(i.type === 'project' && i.id === source.id))
    .map((i) =>
      i.type === 'folder' ? { ...i, projectIds: i.projectIds.filter((p) => p !== source.id) } : i,
    )
  const moving = { type: 'project' as const, id: source.id }

  // …e põe no destino.
  if (target.kind === 'into-folder') {
    const folder = without.find((i) => i.type === 'folder' && i.id === target.id)
    if (!folder || folder.type !== 'folder') return null
    folder.projectIds.push(source.id)
  } else if (target.kind === 'before-project') {
    const parent = without.find((i) => i.type === 'folder' && i.projectIds.includes(target.id))
    if (parent && parent.type === 'folder')
      parent.projectIds.splice(parent.projectIds.indexOf(target.id), 0, source.id)
    else {
      const index = without.findIndex((i) => i.type === 'project' && i.id === target.id)
      if (index < 0) return null
      without.splice(index, 0, moving)
    }
  } else if (target.kind === 'before-folder') {
    const index = without.findIndex((i) => i.type === 'folder' && i.id === target.id)
    if (index < 0) return null
    without.splice(index, 0, moving)
  } else {
    without.push(moving)
  }
  return JSON.stringify(without) === JSON.stringify(items) ? null : without
}
