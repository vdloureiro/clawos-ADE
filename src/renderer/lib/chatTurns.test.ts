import { describe, expect, it } from 'vitest'
import type { ChatItem } from '@shared/chat'
import { organizeTasksPrompt, parseProposedTasks, turnEnds } from './chatTurns'

const user = (id: string, text = 'oi'): ChatItem => ({ kind: 'user', id, text })
const said = (id: string, text: string): ChatItem => ({ kind: 'assistant', id, text })
const tool = (id: string): ChatItem => ({
  kind: 'tool',
  id,
  toolCall: { id, title: 'ler', kind: 'read', status: 'completed', content: [], locations: [] },
})

describe('turnEnds', () => {
  const items = [
    user('u1'),
    said('a', 'Vou ler.'),
    tool('t1'),
    said('a', 'Pronto: 3 itens.'),
    user('u2'),
    said('b', 'Feito.'),
  ]

  it('marca o último trecho de cada resposta e junta o texto todo', () => {
    const ends = turnEnds(items, false)
    expect([...ends.keys()]).toEqual([3, 5])
    expect(ends.get(3)?.text).toBe('Vou ler.\n\nPronto: 3 itens.')
  })

  it('a resposta em andamento ainda não tem ações', () => {
    expect([...turnEnds(items, true).keys()]).toEqual([3])
  })
})

describe('tarefas propostas pelo agente', () => {
  it('lê o JSON e normaliza prioridade e status', () => {
    expect(
      parseProposedTasks(
        '[{"title":"Criar landing","priority":2,"status":"done"},{"title":"Revisar","priority":9},{"notes":"sem título"}]',
      ),
    ).toEqual([
      { title: 'Criar landing', notes: '', priority: 2, status: 'done' },
      { title: 'Revisar', notes: '', priority: 4, status: 'todo' },
    ])
  })

  it('JSON incompleto (ainda chegando) não vira tarefa', () => {
    expect(parseProposedTasks('[{"title":"Cri')).toBeNull()
    expect(parseProposedTasks('[]')).toBeNull()
  })

  it('o pedido cita o começo da resposta e o formato esperado', () => {
    const prompt = organizeTasksPrompt('Plano:\n1. Criar a landing\n2. Configurar o pixel')
    expect(prompt).toContain('"Plano: 1. Criar a landing')
    expect(prompt).toContain('```clawos-tasks')
  })
})
