import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { ChatItem } from '@shared/chat'
import { openDatabase } from '../db'
import { ProjectManager } from '../projects/ProjectManager'
import { SessionRepo } from './SessionRepo'

describe('SessionRepo', () => {
  it('cria, lista, atualiza e persiste o histórico', () => {
    const db = openDatabase(':memory:')
    const project = new ProjectManager(db).add(mkdtempSync(join(tmpdir(), 'clawos-test-')))
    const repo = new SessionRepo(db)

    repo.create({ id: 's1', projectId: project.id, agentId: 'claude', title: 'Nova conversa' })
    repo.update('s1', { title: 'Criar hello.ts', acpSessionId: 'acp-1' })

    const items: ChatItem[] = [
      { kind: 'user', id: 'u1', text: 'oi' },
      {
        kind: 'tool',
        id: 't1',
        toolCall: {
          id: 't1',
          title: 'Write a.ts',
          kind: 'edit',
          status: 'completed',
          content: [],
          locations: [],
        },
      },
      { kind: 'assistant', id: 'm1', text: 'feito' },
    ]
    repo.saveItems('s1', items)
    repo.saveItems('s1', items) // regravar não duplica

    expect(repo.loadItems('s1')).toEqual(items)
    const kinds = db.prepare('SELECT kind, role FROM messages ORDER BY seq').all()
    expect(kinds).toEqual([
      { kind: 'text', role: 'user' },
      { kind: 'tool_call', role: 'assistant' },
      { kind: 'text', role: 'assistant' },
    ])

    const stored = repo.get('s1')
    expect(stored.acpSessionId).toBe('acp-1')
    expect(stored.summary).toMatchObject({
      title: 'Criar hello.ts',
      cwd: project.path,
      live: false,
    })
    expect(repo.list(project.id)).toHaveLength(1)

    repo.delete('s1')
    expect(repo.list(project.id)).toHaveLength(0)
    expect(repo.loadItems('s1')).toEqual([])
  })
})
