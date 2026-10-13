import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { openDatabase } from '../db'
import { ProjectManager } from '../projects/ProjectManager'
import { SharedMcpStore } from './SharedMcpStore'

const cipher = {
  isAvailable: () => true,
  encrypt: (v: string) => Buffer.from(`enc:${v}`),
  decrypt: (b: Buffer) => b.toString().replace(/^enc:/, ''),
}

describe('SharedMcpStore', () => {
  it('guarda MCPs globais e tokens criptografados, e cada projeto pode desligar', () => {
    const db = openDatabase(':memory:')
    const store = new SharedMcpStore(db, cipher)
    const projects = new ProjectManager(db)
    const a = projects.add(mkdtempSync(join(tmpdir(), 'clawos-shared-')))
    const github = {
      type: 'http' as const,
      url: 'https://api.githubcopilot.com/mcp/',
      headers: { Authorization: 'Bearer ${secret:github_token}' },
    }
    store.save('github', github, { github_token: 'ghp_x' })
    store.save(
      'memory',
      { command: 'npx', args: ['-y', '@modelcontextprotocol/server-memory'] },
      {},
    )

    expect(Object.keys(store.list())).toEqual(['github', 'memory'])
    expect(store.secret('github_token')).toBe('ghp_x')
    const raw = db.prepare('SELECT value FROM shared_secrets').get() as { value: Buffer }
    expect(raw.value.toString()).toBe('enc:ghp_x') // nunca em texto puro

    // Projeto recebe os globais; o MCP do próprio projeto vence no mesmo nome.
    expect(Object.keys(store.forProject(a.id))).toEqual(['github', 'memory'])
    expect(Object.keys(store.forProject(a.id, { memory: { command: 'x' } }))).toEqual(['github'])

    store.setEnabledFor(a.id, 'github', false)
    expect(Object.keys(store.forProject(a.id))).toEqual(['memory'])
    store.setEnabledFor(a.id, 'github', true)
    expect(store.disabledFor(a.id)).toEqual([])

    store.remove('memory')
    expect(Object.keys(store.list())).toEqual(['github'])
    expect(() => store.save('nome inválido', github, {})).toThrow()
  })
})
