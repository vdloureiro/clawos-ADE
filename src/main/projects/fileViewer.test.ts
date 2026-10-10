import { mkdtempSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { readForViewer, resolveExisting, resolvePath } from './fileViewer'

const dir = mkdtempSync(join(tmpdir(), 'clawos-viewer-'))
writeFileSync(join(dir, 'schema.sql'), 'CREATE TABLE a (id int);\n')
writeFileSync(join(dir, 'bin.dat'), Buffer.from([1, 2, 0, 3]))
writeFileSync(join(dir, 'logo.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]))

describe('resolvePath', () => {
  it('resolve relativo à pasta da sessão, ~ e file://', () => {
    expect(resolvePath('src/a.ts', '/proj')).toBe('/proj/src/a.ts')
    expect(resolvePath('/abs/b.md', '/proj')).toBe('/abs/b.md')
    expect(resolvePath('~/c.txt', '/proj')).toBe(join(homedir(), 'c.txt'))
    expect(resolvePath('file:///x/y.sql', '/proj')).toBe('/x/y.sql')
  })
})

describe('resolveExisting', () => {
  it('devolve o caminho absoluto só de arquivos que existem', () => {
    expect(resolveExisting(['schema.sql', 'nao-existe.md', '.'], dir)).toEqual([
      join(dir, 'schema.sql'),
      null,
      null,
    ])
  })
})

describe('readForViewer', () => {
  it('texto, binário, imagem e ausente', () => {
    const sql = readForViewer(join(dir, 'schema.sql'))
    expect(sql.kind).toBe('text')
    expect(sql.text).toContain('CREATE TABLE')
    expect(readForViewer(join(dir, 'bin.dat')).kind).toBe('binary')
    const png = readForViewer(join(dir, 'logo.png'))
    expect(png.kind).toBe('image')
    expect(png.dataUrl).toMatch(/^data:image\/png;base64,/)
    expect(readForViewer(join(dir, 'sumiu.txt')).kind).toBe('missing')
  })
})

describe('writeFromViewer', () => {
  it('salva e detecta conflito com mudança externa', async () => {
    const { writeFromViewer } = await import('./fileViewer')
    const file = join(dir, 'editar.txt')
    writeFileSync(file, 'v1')
    const first = readForViewer(file)
    const saved = writeFromViewer(file, 'v2', first.mtime)
    expect(saved.ok).toBe(true)
    expect(readForViewer(file).text).toBe('v2')
    // A versão que a aba tinha (first.mtime) ficou velha: conflito, sem sobrescrever.
    await new Promise((r) => setTimeout(r, 20))
    writeFileSync(file, 'externo')
    const conflict = writeFromViewer(file, 'v3', saved.mtime)
    expect(conflict.ok).toBe(false)
    expect(readForViewer(file).text).toBe('externo')
    // Forçar (null) sobrescreve.
    expect(writeFromViewer(file, 'v3', null).ok).toBe(true)
    expect(readForViewer(file).text).toBe('v3')
  })
})
