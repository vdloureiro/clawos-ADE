import type { SessionUpdate } from '@agentclientprotocol/sdk'
import { describe, expect, it } from 'vitest'
import { normalizeConfigOptions, normalizePermissionOptions, normalizeUpdate } from './normalize'

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

describe('avisos do agente', () => {
  it('converte notice em aviso, ou em erro quando severo', () => {
    expect(
      normalizeUpdate({
        sessionUpdate: 'notice',
        severity: 'warning',
        title: 'MCP "x" falhou',
        description: 'timeout',
      }),
    ).toEqual([{ type: 'notice', text: 'MCP "x" falhou — timeout' }])
    expect(
      normalizeUpdate({ sessionUpdate: 'notice', severity: 'error', title: 'Sem créditos' }),
    ).toEqual([{ type: 'error', message: 'Sem créditos' }])
  })
})

describe('normalizePermissionOptions', () => {
  it('mapeia optionId para id', () => {
    expect(
      normalizePermissionOptions([{ optionId: 'allow', name: 'Allow', kind: 'allow_once' }]),
    ).toEqual([{ id: 'allow', name: 'Allow', kind: 'allow_once' }])
  })
})

describe('describeError', () => {
  it('usa os detalhes do erro ACP em vez de "Internal error"', async () => {
    const { describeError } = await import('./AgentSession')
    expect(
      describeError({
        code: -32603,
        message: 'Internal error',
        data: { details: "unknown option '--x'" },
      }),
    ).toBe("unknown option '--x'")
    expect(describeError(new Error('falhou'))).toBe('falhou')
  })
})

describe('describeError com data em texto', () => {
  it('usa o texto de data (formato do codex-acp)', async () => {
    const { describeError } = await import('./AgentSession')
    expect(
      describeError({ code: -32603, message: 'Internal error', data: 'invalid transport\n' }),
    ).toBe('invalid transport')
  })
})

describe('unpacked', () => {
  it('troca app.asar por app.asar.unpacked (macOS e Windows)', async () => {
    const { unpacked } = await import('./AgentSession')
    expect(unpacked('/A/Clawos.app/Contents/Resources/app.asar/node_modules/x.js')).toBe(
      '/A/Clawos.app/Contents/Resources/app.asar.unpacked/node_modules/x.js',
    )
    expect(unpacked('C:\\Clawos\\resources\\app.asar\\out\\main\\agentHost.js')).toBe(
      'C:\\Clawos\\resources\\app.asar.unpacked\\out\\main\\agentHost.js',
    )
    expect(unpacked('/dev/node_modules/x.js')).toBe('/dev/node_modules/x.js')
  })
})

describe('normalizeConfigOptions', () => {
  it('mantém listas de escolha, achata grupos e descarta booleanos', () => {
    const options = normalizeConfigOptions([
      {
        id: 'model',
        name: 'Model',
        category: 'model',
        type: 'select',
        currentValue: 'default',
        options: [
          { value: 'default', name: 'Default (recommended)', description: 'Opus' },
          { value: 'sonnet', name: 'Sonnet' },
        ],
      },
      {
        id: 'mode',
        name: 'Mode',
        category: 'mode',
        type: 'select',
        currentValue: 'agent',
        options: [
          { group: 'safe', name: 'Seguro', options: [{ value: 'read-only', name: 'Read-only' }] },
          { group: 'auto', name: 'Auto', options: [{ value: 'agent', name: 'Auto review' }] },
        ],
      },
      { id: 'fast', name: 'Fast', type: 'boolean', currentValue: false },
    ])
    expect(options).toEqual([
      {
        id: 'model',
        name: 'Model',
        category: 'model',
        currentValue: 'default',
        options: [
          { value: 'default', name: 'Default (recommended)', description: 'Opus' },
          { value: 'sonnet', name: 'Sonnet' },
        ],
      },
      {
        id: 'mode',
        name: 'Mode',
        category: 'mode',
        currentValue: 'agent',
        options: [
          { value: 'read-only', name: 'Read-only' },
          { value: 'agent', name: 'Auto review' },
        ],
      },
    ])
  })

  it('traduz config_option_update em evento', () => {
    const events = normalizeUpdate({
      sessionUpdate: 'config_option_update',
      configOptions: [
        {
          id: 'mode',
          name: 'Mode',
          category: 'mode',
          type: 'select',
          currentValue: 'plan',
          options: [{ value: 'plan', name: 'Plan' }],
        },
      ],
    } as SessionUpdate)
    expect(events).toEqual([
      {
        type: 'config_options',
        options: [
          {
            id: 'mode',
            name: 'Mode',
            category: 'mode',
            currentValue: 'plan',
            options: [{ value: 'plan', name: 'Plan' }],
          },
        ],
      },
    ])
  })
})
