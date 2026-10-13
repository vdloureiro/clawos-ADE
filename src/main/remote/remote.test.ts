import { describe, expect, it } from 'vitest'
import { decodeWire, encodeWire } from '@shared/wire'
import { openDatabase } from '../db'
import { RemoteManager } from './RemoteManager'

describe('RemoteManager', () => {
  const setup = () => new RemoteManager(openDatabase(':memory:'))

  it('pareia uma vez só, com código válido e dentro do prazo', () => {
    const remote = setup()
    expect(remote.pair('qualquer', 'iPhone')).toBeNull() // sem código ativo
    const { token } = remote.newPairing(1000)
    expect(remote.pair('errado', 'iPhone', 2000)).toBeNull()
    const paired = remote.pair(token, ' iPhone do Victor ', 2000)
    expect(paired?.device.name).toBe('iPhone do Victor')
    expect(remote.pair(token, 'Outro', 3000)).toBeNull() // reutilizar o código falha
    const expired = remote.newPairing(0)
    expect(remote.pair(expired.token, 'Tablet', 11 * 60 * 1000)).toBeNull() // 10 min
  })

  it('a chave do aparelho autentica até ser revogada; só o hash fica no banco', () => {
    const db = openDatabase(':memory:')
    const remote = new RemoteManager(db)
    const { token } = remote.newPairing()
    const paired = remote.pair(token, 'iPad')!
    expect(remote.verify(paired.token)?.name).toBe('iPad')
    expect(remote.verify('chave-falsa')).toBeNull()
    expect(remote.verify(undefined)).toBeNull()
    const stored = db.prepare('SELECT token_hash FROM remote_devices').get() as {
      token_hash: string
    }
    expect(stored.token_hash).not.toContain(paired.token)
    remote.revoke(paired.device.id)
    expect(remote.verify(paired.token)).toBeNull()
  })

  it('ajustes: ligado/desligado e porta padrão', () => {
    const remote = setup()
    expect(remote.enabled).toBe(false)
    remote.enabled = true
    expect(remote.enabled).toBe(true)
    expect(remote.port).toBe(4317)
  })
})

describe('RemoteServer helpers', async () => {
  const { isBlockedRemote, parseCookies, sameOrigin } = await import('./RemoteServer')

  it('bloqueia remotamente o que age na tela do computador e a gestão do acesso', () => {
    for (const ch of [
      'dialog:pickFolder',
      'shell:openPath',
      'clipboard:filePaths',
      'remote:revoke',
    ])
      expect(isBlockedRemote(ch), ch).toBe(true)
    for (const ch of ['session:prompt', 'projects:list', 'files:write'])
      expect(isBlockedRemote(ch)).toBe(false)
  })

  it('aceita só a origem do próprio endereço', () => {
    expect(sameOrigin({ host: 'mac.tail1.ts.net', origin: 'https://mac.tail1.ts.net' })).toBe(true)
    expect(
      sameOrigin({
        host: '127.0.0.1:4317',
        'x-forwarded-host': 'mac.tail1.ts.net',
        origin: 'https://mac.tail1.ts.net',
      }),
    ).toBe(true)
    expect(sameOrigin({ host: 'mac.tail1.ts.net', origin: 'https://evil.com' })).toBe(false)
    expect(sameOrigin({ host: 'mac.tail1.ts.net' })).toBe(false)
  })

  it('lê cookies', () => {
    expect(parseCookies('a=1; clawos_device=abc%2Fd')).toEqual({ a: '1', clawos_device: 'abc/d' })
  })
})

describe('wire', () => {
  it('leva bytes (anexos) dentro do JSON', () => {
    const bytes = new Uint8Array([0, 1, 254, 255])
    const back = decodeWire<{ args: [string, Uint8Array] }>(encodeWire({ args: ['a.png', bytes] }))
    expect(back.args[0]).toBe('a.png')
    expect(Array.from(back.args[1])).toEqual([0, 1, 254, 255])
  })
})
