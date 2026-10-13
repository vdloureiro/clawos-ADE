import { describe, expect, it } from 'vitest'
import type { Project, ProjectFolder } from '@shared/types'
import { buildTree, moveInTree, toArrangement } from './sidebarTree'

const project = (id: string, sortOrder: number, folderId: string | null = null): Project => ({
  id,
  name: id,
  path: `/p/${id}`,
  color: '#000',
  defaultAgent: 'claude',
  createdAt: 0,
  lastOpenedAt: null,
  sortOrder,
  folderId,
  permissionDefault: null,
})
const folder = (id: string, sortOrder: number): ProjectFolder => ({
  id,
  name: id,
  sortOrder,
  collapsed: false,
})

// Ordem: A, [Cliente: X, Y], B
const tree = buildTree(
  [project('A', 0), project('X', 0, 'cli'), project('Y', 1, 'cli'), project('B', 2)],
  [folder('cli', 1)],
)

describe('buildTree', () => {
  it('intercala pastas e projetos soltos e ordena dentro da pasta', () => {
    expect(toArrangement(tree)).toEqual([
      { type: 'project', id: 'A' },
      { type: 'folder', id: 'cli', projectIds: ['X', 'Y'] },
      { type: 'project', id: 'B' },
    ])
  })

  it('projeto de pasta inexistente aparece solto', () => {
    const t = buildTree([project('A', 0, 'sumiu')], [])
    expect(toArrangement(t)).toEqual([{ type: 'project', id: 'A' }])
  })
})

describe('moveInTree', () => {
  it('arrasta projeto solto para dentro da pasta', () => {
    expect(
      moveInTree(tree, { type: 'project', id: 'A' }, { kind: 'into-folder', id: 'cli' }),
    ).toEqual([
      { type: 'folder', id: 'cli', projectIds: ['X', 'Y', 'A'] },
      { type: 'project', id: 'B' },
    ])
  })

  it('solta antes de um projeto dentro da pasta', () => {
    expect(
      moveInTree(tree, { type: 'project', id: 'B' }, { kind: 'before-project', id: 'Y' }),
    ).toEqual([
      { type: 'project', id: 'A' },
      { type: 'folder', id: 'cli', projectIds: ['X', 'B', 'Y'] },
    ])
  })

  it('tira o projeto da pasta (fim da lista ou antes de um solto)', () => {
    expect(moveInTree(tree, { type: 'project', id: 'X' }, { kind: 'root-end' })).toEqual([
      { type: 'project', id: 'A' },
      { type: 'folder', id: 'cli', projectIds: ['Y'] },
      { type: 'project', id: 'B' },
      { type: 'project', id: 'X' },
    ])
    expect(
      moveInTree(tree, { type: 'project', id: 'Y' }, { kind: 'before-project', id: 'A' }),
    ).toEqual([
      { type: 'project', id: 'Y' },
      { type: 'project', id: 'A' },
      { type: 'folder', id: 'cli', projectIds: ['X'] },
      { type: 'project', id: 'B' },
    ])
  })

  it('reordena pastas sem aninhar', () => {
    expect(
      moveInTree(tree, { type: 'folder', id: 'cli' }, { kind: 'before-project', id: 'A' }),
    ).toEqual([
      { type: 'folder', id: 'cli', projectIds: ['X', 'Y'] },
      { type: 'project', id: 'A' },
      { type: 'project', id: 'B' },
    ])
    // Soltar a pasta num projeto dela mesma não faz nada.
    expect(
      moveInTree(tree, { type: 'folder', id: 'cli' }, { kind: 'before-project', id: 'X' }),
    ).toBeNull()
  })

  it('movimento sem efeito devolve null', () => {
    expect(
      moveInTree(tree, { type: 'project', id: 'A' }, { kind: 'before-project', id: 'A' }),
    ).toBeNull()
    expect(
      moveInTree(tree, { type: 'project', id: 'Y' }, { kind: 'into-folder', id: 'cli' }),
    ).toBeNull()
  })
})
