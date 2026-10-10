import { describe, expect, it } from 'vitest'
import {
  fileName,
  filePanelId,
  isFilePanel,
  looksLikePath,
  pathOfPanel,
  splitLine,
} from './filePanels'

describe('splitLine', () => {
  it('separa a linha do caminho', () => {
    expect(splitLine('src/db/schema.sql:42')).toEqual({ path: 'src/db/schema.sql', line: 42 })
    expect(splitLine('app.ts:10:5')).toEqual({ path: 'app.ts', line: 10 })
    expect(splitLine('README.md#L7')).toEqual({ path: 'README.md', line: 7 })
    expect(splitLine('notas.md')).toEqual({ path: 'notas.md' })
  })
})

describe('looksLikePath', () => {
  it('reconhece arquivos citados pelo agente', () => {
    for (const ok of [
      'notas.md',
      'src/db/schema.sql',
      './a/b.txt',
      'app.ts:12',
      '.env.local',
      'Dockerfile',
      '~/x/y.json',
    ])
      expect(looksLikePath(ok), ok).toBe(true)
  })
  it('ignora código que não é caminho', () => {
    for (const no of [
      'npm install',
      'useState',
      'https://site.com/a.js',
      'x = 1',
      '..',
      'console.log()',
    ])
      expect(looksLikePath(no), no).toBe(false)
  })
})

describe('ids de aba de arquivo', () => {
  it('ida e volta', () => {
    const id = filePanelId('/tmp/a b/notas.md')
    expect(isFilePanel(id)).toBe(true)
    expect(isFilePanel('uuid-da-sessao')).toBe(false)
    expect(pathOfPanel(id)).toBe('/tmp/a b/notas.md')
    expect(fileName('/tmp/a b/notas.md')).toBe('notas.md')
  })
})
