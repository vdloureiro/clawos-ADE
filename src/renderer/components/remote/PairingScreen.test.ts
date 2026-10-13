import { describe, expect, it } from 'vitest'
import { parsePairingInput } from './PairingScreen'

describe('parsePairingInput', () => {
  const code = 'Abc_123-xyzXYZ0987654321'
  it('aceita o link completo ou só o código', () => {
    expect(parsePairingInput(`https://meu-mac.tail1234.ts.net/?pair=${code}`)).toBe(code)
    expect(parsePairingInput(`  ${code}  `)).toBe(code)
  })
  it('recusa texto que não é código', () => {
    expect(parsePairingInput('')).toBeNull()
    expect(parsePairingInput('oi')).toBeNull()
    expect(parsePairingInput('https://meu-mac.tail1234.ts.net/')).toBeNull()
  })
})
