import { describe, expect, it } from 'vitest'
import { readFileRetrying } from './readRetry'

const fail = (code: string) => Object.assign(new Error(code), { code })
type Reader = (path: string, encoding?: BufferEncoding, read?: (p: string) => Buffer) => string
const read = readFileRetrying as unknown as Reader

describe('readFileRetrying', () => {
  it('tenta de novo quando a leitura é interrompida (arquivo baixando do iCloud)', () => {
    let calls = 0
    const text = read('/x/project.yaml', 'utf8', () => {
      calls++
      if (calls < 3) throw fail('EINTR')
      return Buffer.from('name: ok')
    })
    expect(text).toBe('name: ok')
    expect(calls).toBe(3)
  })

  it('não insiste em erros definitivos', () => {
    let calls = 0
    expect(() =>
      read('/x/nada', 'utf8', () => {
        calls++
        throw fail('ENOENT')
      }),
    ).toThrow('ENOENT')
    expect(calls).toBe(1)
  })
})
