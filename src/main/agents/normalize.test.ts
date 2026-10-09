import type { SessionUpdate } from '@agentclientprotocol/sdk'
import { describe, expect, it } from 'vitest'
import { normalizePermissionOptions, normalizeUpdate } from './normalize'

// Payloads reduzidos a partir de uma sessão real com claude-agent-acp 0.88.0.
describe('normalizeUpdate', () => {
  it('converte chunks de mensagem e pensamento em deltas', () => {
    expect(
      normalizeUpdate({
        sessionUpdate: 'agent_message_chunk',
        messageId: 'msg_1',
        content: { type: 'text', text: 'Pronto.' },
      }),
    ).toEqual([{ type: 'text_delta', messageId: 'msg_1', text: 'Pronto.' }])

    expect(
      normalizeUpdate({
        sessionUpdate: 'agent_thought_chunk',
        content: { type: 'text', text: 'Hmm' },
      }),
    ).toEqual([{ type: 'thought_delta', messageId: 'thought', text: 'Hmm' }])
  })

  it('ignora chunks sem texto', () => {
    expect(
      normalizeUpdate({
        sessionUpdate: 'agent_message_chunk',
        content: { type: 'image', data: '', mimeType: 'image/png' },
      }),
    ).toEqual([])
  })

  it('converte tool_call inicial, descartando rawInput vazio', () => {
    const events = normalizeUpdate({
      sessionUpdate: 'tool_call',
      toolCallId: 'toolu_1',
      title: 'Preparing file…',
      kind: 'edit',
      status: 'pending',
      content: [],
      locations: [],
      rawInput: {},
    })
    expect(events).toEqual([
      {
        type: 'tool_call_start',
        toolCall: {
          id: 'toolu_1',
          title: 'Preparing file…',
          kind: 'edit',
          status: 'pending',
          content: [],
          locations: [],
          input: undefined,
        },
      },
    ])
  })

  it('converte diff e locais em tool_call_update', () => {
    const events = normalizeUpdate({
      sessionUpdate: 'tool_call_update',
      toolCallId: 'toolu_1',
      title: 'Write hello.ts',
      locations: [{ path: '/w/hello.ts' }],
      content: [
        { type: 'diff', path: '/w/hello.ts', oldText: null, newText: "console.log('olá');\n" },
      ],
    })
    expect(events).toEqual([
      {
        type: 'tool_call_update',
        toolCallId: 'toolu_1',
        patch: {
          title: 'Write hello.ts',
          locations: ['/w/hello.ts'],
          content: [
            { type: 'diff', path: '/w/hello.ts', oldText: null, newText: "console.log('olá');\n" },
          ],
        },
      },
    ])
  })

  it('converte saída de comando e status final', () => {
    const events = normalizeUpdate({
      sessionUpdate: 'tool_call_update',
      toolCallId: 'toolu_2',
      status: 'completed',
      content: [{ type: 'content', content: { type: 'text', text: '```console\nolá\n```' } }],
      rawOutput: 'olá',
    })
    expect(events).toEqual([
      {
        type: 'tool_call_update',
        toolCallId: 'toolu_2',
        patch: {
          status: 'completed',
          content: [{ type: 'text', text: '```console\nolá\n```' }],
          output: 'olá',
        },
      },
    ])
  })

  it('descarta updates que só trazem _meta', () => {
    expect(
      normalizeUpdate({
        sessionUpdate: 'tool_call_update',
        toolCallId: 'toolu_2',
        _meta: { claudeCode: { toolName: 'Bash' } },
      }),
    ).toEqual([])
  })

  it('converte plano e ignora updates não usados pela UI', () => {
    expect(
      normalizeUpdate({
        sessionUpdate: 'plan',
        entries: [{ content: 'Criar hello.ts', status: 'pending', priority: 'high' }],
      }),
    ).toEqual([
      {
        type: 'plan',
        entries: [{ content: 'Criar hello.ts', status: 'pending', priority: 'high' }],
      },
    ])
    expect(
      normalizeUpdate({ sessionUpdate: 'usage_update', used: 1, size: 2 } as SessionUpdate),
    ).toEqual([])
  })
})

describe('normalizePermissionOptions', () => {
  it('mapeia optionId para id', () => {
    expect(
      normalizePermissionOptions([{ optionId: 'allow', name: 'Allow', kind: 'allow_once' }]),
    ).toEqual([{ id: 'allow', name: 'Allow', kind: 'allow_once' }])
  })
})
