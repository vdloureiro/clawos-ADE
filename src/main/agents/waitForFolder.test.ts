import { mkdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { waitForFolder } from './AgentSession'

describe('waitForFolder', () => {
  it('espera a pasta aparecer (ex.: Mesa no iCloud logo após ligar o Mac)', async () => {
    const dir = join(mkdtempSync(join(tmpdir(), 'clawos-wait-')), 'projeto')
    setTimeout(() => mkdirSync(dir), 1200)
    await expect(waitForFolder(dir, 5000)).resolves.toBeUndefined()
  })

  it('pasta que não existe: erro claro com o caminho (não "spawn ENOENT")', async () => {
    await expect(waitForFolder('/nao/existe/CRM', 1500)).rejects.toThrow(
      /A pasta desta conversa não foi encontrada: \/nao\/existe\/CRM/,
    )
  })
})
