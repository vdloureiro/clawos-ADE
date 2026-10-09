import { describe, expect, it } from 'vitest'
import { computeDiffLines } from './DiffView'

describe('computeDiffLines', () => {
  it('arquivo novo vira só adições, sem cabeçalho de hunk', () => {
    expect(computeDiffLines(null, 'a\nb\n')).toEqual([
      { type: 'add', text: 'a', newNo: 1 },
      { type: 'add', text: 'b', newNo: 2 },
    ])
  })

  it('edição gera remoção, adição e contexto com numeração', () => {
    const lines = computeDiffLines('a\nb\nc\n', 'a\nB\nc\n')
    expect(lines).toEqual([
      { type: 'hunk', text: '@@ -1 +1 @@' },
      { type: 'ctx', text: 'a', oldNo: 1, newNo: 1 },
      { type: 'del', text: 'b', oldNo: 2 },
      { type: 'add', text: 'B', newNo: 2 },
      { type: 'ctx', text: 'c', oldNo: 3, newNo: 3 },
    ])
  })
})
