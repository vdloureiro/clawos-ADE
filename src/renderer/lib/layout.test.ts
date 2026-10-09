import type { SerializedDockview } from 'dockview-react'
import { describe, expect, it } from 'vitest'
import { chatPanelState, remapLayout, sanitizeLayout } from './layout'

const layout: SerializedDockview = {
  grid: {
    orientation: 'HORIZONTAL' as SerializedDockview['grid']['orientation'],
    width: 1000,
    height: 800,
    root: {
      type: 'branch',
      data: [
        { type: 'leaf', data: { id: 'g1', views: ['a', 'b'], activeView: 'b' }, size: 600 },
        {
          type: 'branch',
          data: [
            { type: 'leaf', data: { id: 'g2', views: ['c'], activeView: 'c' }, size: 400 },
            { type: 'leaf', data: { id: 'g3', views: ['d'], activeView: 'd' }, size: 400 },
          ],
          size: 400,
        },
      ],
      size: 800,
    },
  },
  panels: {
    a: chatPanelState('a', 'A'),
    b: chatPanelState('b', 'B'),
    c: chatPanelState('c', 'C'),
    d: chatPanelState('d', 'D'),
  },
  activeGroup: 'g1',
}

const title = (id: string) => id.toUpperCase() + '!'

describe('sanitizeLayout', () => {
  it('remove painéis de sessões apagadas e corrige o ativo', () => {
    const result = sanitizeLayout(layout, (id) => id !== 'b' && id !== 'd', title)
    expect(Object.keys(result.panels)).toEqual(['a', 'c'])
    expect(result.panels['a']!.title).toBe('A!')
    const root = result.grid.root.data as { data: unknown }[]
    expect(root[0]!.data).toEqual({ id: 'g1', views: ['a'], activeView: 'a' })
    expect(layout.panels['b']).toBeDefined() // não muta a entrada
  })
})

describe('remapLayout', () => {
  it('preenche as vagas do preset na ordem e manda sobras para o primeiro grupo', () => {
    const result = remapLayout(layout, ['s1', 's2', 's3', 's4', 's5'], title)
    const [g1, branch] = result.grid.root.data as { data: unknown }[]
    expect(g1!.data).toEqual({ id: 'g1', views: ['s1', 's2', 's5'], activeView: 's1' })
    const [g2, g3] = branch!.data as { data: unknown }[]
    expect(g2!.data).toMatchObject({ views: ['s3'] })
    expect(g3!.data).toMatchObject({ views: ['s4'] })
    expect(Object.keys(result.panels)).toEqual(['s1', 's2', 's3', 's4', 's5'])
  })

  it('com menos sessões que vagas, grupos ficam vazios', () => {
    const result = remapLayout(layout, ['s1'], title)
    const [g1, branch] = result.grid.root.data as { data: unknown }[]
    expect(g1!.data).toMatchObject({ views: ['s1'] })
    expect((branch!.data as { data: { views: string[] } }[])[0]!.data.views).toEqual([])
  })
})
