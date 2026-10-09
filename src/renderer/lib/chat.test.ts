import { describe, expect, it } from 'vitest'
import type { SessionEvent } from '@shared/types'
import { applyEvent, createChatState, type ChatState } from './chat'

const info = { id: 's1', agentId: 'claude' as const, cwd: '/w' }

function run(...events: SessionEvent[]): ChatState {
  return events.reduce(applyEvent, createChatState(info))
}

describe('applyEvent', () => {
  it('concatena deltas da mesma mensagem e separa mensagens diferentes', () => {
    const state = run(
      { type: 'text_delta', messageId: 'm1', text: 'Olá' },
      { type: 'text_delta', messageId: 'm1', text: ', mundo' },
      { type: 'text_delta', messageId: 'm2', text: 'Outra' },
    )
    expect(state.items).toEqual([
      { kind: 'assistant', id: 'm1', text: 'Olá, mundo' },
      { kind: 'assistant', id: 'm2', text: 'Outra' },
    ])
  })

  it('pensamento intercalado não mistura com texto', () => {
    const state = run(
      { type: 'thought_delta', messageId: 'm1', text: 'pensando' },
      { type: 'text_delta', messageId: 'm1', text: 'resposta' },
    )
    expect(state.items.map((i) => i.kind)).toEqual(['thought', 'assistant'])
  })

  it('cria e atualiza tool calls no lugar', () => {
    const state = run(
      {
        type: 'tool_call_start',
        toolCall: {
          id: 't1',
          title: 'Preparing file…',
          kind: 'edit',
          status: 'pending',
          content: [],
          locations: [],
        },
      },
      { type: 'text_delta', messageId: 'm1', text: 'x' },
      {
        type: 'tool_call_update',
        toolCallId: 't1',
        patch: { title: 'Write hello.ts', status: 'completed' },
      },
    )
    expect(state.items[0]).toMatchObject({
      kind: 'tool',
      toolCall: { title: 'Write hello.ts', status: 'completed', kind: 'edit' },
    })
    expect(state.items).toHaveLength(2)
  })

  it('registra o pedido de permissão e sua resolução', () => {
    const state = run(
      {
        type: 'permission_request',
        requestId: 'p1',
        toolCallId: 't1',
        title: 'Write hello.ts',
        options: [{ id: 'allow', name: 'Yes', kind: 'allow_once' }],
      },
      { type: 'permission_resolved', requestId: 'p1', optionId: 'allow' },
    )
    expect(state.items[0]).toMatchObject({ kind: 'permission', resolution: 'allow' })
  })

  it('mantém um único plano atualizado', () => {
    const state = run(
      { type: 'plan', entries: [{ content: 'a', status: 'pending', priority: 'high' }] },
      { type: 'plan', entries: [{ content: 'a', status: 'completed', priority: 'high' }] },
    )
    expect(state.items).toHaveLength(1)
    expect(state.items[0]).toMatchObject({ kind: 'plan', entries: [{ status: 'completed' }] })
  })

  it('mostra aviso ao interromper, mas não ao terminar normalmente', () => {
    expect(run({ type: 'turn_end', stopReason: 'end_turn' }).items).toHaveLength(0)
    expect(run({ type: 'turn_end', stopReason: 'cancelled' }).items[0]).toMatchObject({
      kind: 'notice',
      text: 'Interrompido.',
    })
  })

  it('status_change só altera o status', () => {
    expect(run({ type: 'status_change', status: 'working' }).status).toBe('working')
  })
})
