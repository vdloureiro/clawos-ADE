import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { openDatabase } from '../db'
import { ProjectManager } from '../projects/ProjectManager'
import { SessionRepo } from '../sessions/SessionRepo'
import { taskPrompt, TaskRepo } from './TaskRepo'

function setup() {
  const db = openDatabase(':memory:')
  const projects = new ProjectManager(db)
  const a = projects.add(mkdtempSync(join(tmpdir(), 'clawos-test-')))
  const b = projects.add(mkdtempSync(join(tmpdir(), 'clawos-test-')))
  return { db, a, b, tasks: new TaskRepo(db) }
}

describe('TaskRepo', () => {
  it('cria no topo, lista por projeto e de todos', () => {
    const { a, b, tasks } = setup()
    const t1 = tasks.create({ projectId: a.id, title: 'Primeira' })
    const t2 = tasks.create({
      projectId: a.id,
      title: '  Segunda  ',
      priority: 1,
      dueDate: '2026-10-12',
    })
    tasks.create({ projectId: b.id, title: 'De outro projeto' })
    expect(tasks.list(a.id).map((t) => t.title)).toEqual(['Segunda', 'Primeira'])
    expect(tasks.list(null)).toHaveLength(3)
    expect(t2).toMatchObject({ status: 'todo', priority: 1, dueDate: '2026-10-12', notes: '' })
    expect(t1.priority).toBe(4)
  })

  it('valida título e data', () => {
    const { a, tasks } = setup()
    expect(() => tasks.create({ projectId: a.id, title: '  ' })).toThrow(/título/)
    expect(() => tasks.create({ projectId: a.id, title: 'x', dueDate: '12/10/2026' })).toThrow(
      /Data/,
    )
  })

  it('concluir registra a data; reabrir limpa', () => {
    const { a, tasks } = setup()
    const t = tasks.create({ projectId: a.id, title: 'x' })
    const done = tasks.update(t.id, { status: 'done' })
    expect(done.completedAt).toBeTypeOf('number')
    expect(tasks.update(t.id, { status: 'todo' }).completedAt).toBeNull()
  })

  it('reordena, move de projeto, conta abertas e apaga', () => {
    const { a, b, tasks } = setup()
    const t1 = tasks.create({ projectId: a.id, title: '1' })
    const t2 = tasks.create({ projectId: a.id, title: '2' })
    tasks.reorder([t1.id, t2.id])
    expect(tasks.list(a.id).map((t) => t.title)).toEqual(['1', '2'])
    tasks.update(t2.id, { projectId: b.id })
    expect(tasks.openCounts()).toEqual({ [a.id]: 1, [b.id]: 1 })
    tasks.update(t1.id, { status: 'done' })
    expect(tasks.openCounts()).toEqual({ [b.id]: 1 })
    tasks.delete(t1.id)
    expect(tasks.list(a.id)).toEqual([])
  })

  it('vincula a sessão delegada e marca em andamento; apagar a sessão desvincula', () => {
    const { db, a, tasks } = setup()
    const sessions = new SessionRepo(db)
    sessions.create({ id: 's1', projectId: a.id, agentId: 'claude', title: 'x' })
    const t = tasks.create({ projectId: a.id, title: 'x' })
    expect(tasks.linkSession(t.id, 's1')).toMatchObject({ sessionId: 's1', status: 'doing' })
    sessions.delete('s1')
    expect(tasks.get(t.id).sessionId).toBeNull()
  })

  it('apagar o projeto apaga as tarefas', () => {
    const { db, a, tasks } = setup()
    tasks.create({ projectId: a.id, title: 'x' })
    new ProjectManager(db).remove(a.id)
    expect(tasks.list(null)).toEqual([])
  })
})

describe('taskPrompt', () => {
  it('monta a mensagem com notas, prioridade e prazo', () => {
    const { a, tasks } = setup()
    const t = tasks.create({
      projectId: a.id,
      title: 'Adicionar cupom FRETEGRATIS',
      notes: 'Zerar o frete em calcularFrete().',
      priority: 1,
      dueDate: '2026-10-15',
    })
    expect(taskPrompt(t, 'Loja')).toBe(
      'Tarefa do projeto "Loja": Adicionar cupom FRETEGRATIS\n\nZerar o frete em calcularFrete().\n\n(prioridade P1, prazo 15/10/2026)\n\nExecute esta tarefa neste projeto. Ao terminar, resuma o que foi feito e o que ficou pendente.',
    )
  })

  it('sem notas nem extras', () => {
    const { a, tasks } = setup()
    expect(taskPrompt(tasks.create({ projectId: a.id, title: 'X' }), 'P')).toBe(
      'Tarefa do projeto "P": X\n\nExecute esta tarefa neste projeto. Ao terminar, resuma o que foi feito e o que ficou pendente.',
    )
  })
})
