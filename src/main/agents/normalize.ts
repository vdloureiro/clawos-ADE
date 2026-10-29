import type {
  ContentBlock,
  PermissionOption,
  SessionConfigOption as AcpConfigOption,
  SessionUpdate,
  ToolCallContent,
  ToolCallLocation,
} from '@agentclientprotocol/sdk'
import type {
  PermissionOptionView,
  SessionConfigOption,
  SessionEvent,
  ToolCallView,
  ToolContent,
} from '@shared/types'

/**
 * Traduz `session/update` do ACP para os eventos normalizados que a UI entende.
 * Atualizações que a UI ainda não usa (uso de tokens, comandos disponíveis, modos…)
 * são descartadas aqui, num único lugar.
 */
export function normalizeUpdate(update: SessionUpdate): SessionEvent[] {
  switch (update.sessionUpdate) {
    case 'agent_message_chunk': {
      const text = blockText(update.content)
      return text ? [{ type: 'text_delta', messageId: update.messageId ?? 'agent', text }] : []
    }
    case 'agent_thought_chunk': {
      const text = blockText(update.content)
      return text ? [{ type: 'thought_delta', messageId: update.messageId ?? 'thought', text }] : []
    }
    case 'user_message_chunk': {
      const text = blockText(update.content)
      return text ? [{ type: 'user_message', id: update.messageId ?? 'user', text }] : []
    }
    case 'tool_call': {
      const toolCall: ToolCallView = {
        id: update.toolCallId,
        title: update.title,
        kind: update.kind ?? 'other',
        status: update.status ?? 'pending',
        content: normalizeToolContent(update.content),
        locations: normalizeLocations(update.locations),
        input: isEmpty(update.rawInput) ? undefined : update.rawInput,
      }
      const output = stringifyOutput(update.rawOutput)
      if (output !== undefined) toolCall.output = output
      return [{ type: 'tool_call_start', toolCall }]
    }
    case 'tool_call_update': {
      const patch: Extract<SessionEvent, { type: 'tool_call_update' }>['patch'] = {}
      if (update.title) patch.title = update.title
      if (update.kind) patch.kind = update.kind
      if (update.status) patch.status = update.status
      if (update.content) patch.content = normalizeToolContent(update.content)
      if (update.locations) patch.locations = normalizeLocations(update.locations)
      if (!isEmpty(update.rawInput)) patch.input = update.rawInput
      const output = stringifyOutput(update.rawOutput)
      if (output !== undefined) patch.output = output
      if (Object.keys(patch).length === 0) return []
      return [{ type: 'tool_call_update', toolCallId: update.toolCallId, patch }]
    }
    case 'plan':
      return [
        {
          type: 'plan',
          entries: update.entries.map((e) => ({
            content: e.content,
            status: e.status,
            priority: e.priority,
          })),
        },
      ]
    case 'notice': {
      // Avisos do agente (ex.: MCP que falhou ao iniciar, limite de uso).
      const text = [update.title, update.description].filter(Boolean).join(' — ')
      if (!text) return []
      return update.severity === 'error'
        ? [{ type: 'error', message: text }]
        : [{ type: 'notice', text }]
    }
    case 'available_commands_update':
      return [
        {
          type: 'commands',
          commands: update.availableCommands.map((c) => ({
            name: c.name,
            description: c.description,
            ...(c.input && 'hint' in c.input && c.input.hint ? { hint: c.input.hint } : {}),
          })),
        },
      ]
    case 'config_option_update':
      return [{ type: 'config_options', options: normalizeConfigOptions(update.configOptions) }]
    default:
      return []
  }
}

/** Opções de configuração do ACP → formato da UI (só listas de escolha; grupos achatados). */
export function normalizeConfigOptions(
  options: AcpConfigOption[] | null | undefined,
): SessionConfigOption[] {
  const result: SessionConfigOption[] = []
  for (const option of options ?? []) {
    if (option.type !== 'select') continue
    const values = option.options.flatMap((o) => ('group' in o ? o.options : [o]))
    result.push({
      id: option.id,
      name: option.name,
      category: option.category ?? null,
      currentValue: option.currentValue,
      options: values.map((v) => ({
        value: v.value,
        name: v.name,
        ...(v.description && { description: v.description }),
      })),
    })
  }
  return result
}

export function normalizePermissionOptions(options: PermissionOption[]): PermissionOptionView[] {
  return options.map((o) => ({ id: o.optionId, name: o.name, kind: o.kind }))
}

function blockText(block: ContentBlock): string {
  switch (block.type) {
    case 'text':
      return block.text
    case 'resource_link':
      return `[${block.name}](${block.uri})`
    default:
      return ''
  }
}

function normalizeToolContent(content: ToolCallContent[] | null | undefined): ToolContent[] {
  if (!content) return []
  const result: ToolContent[] = []
  for (const item of content) {
    if (item.type === 'diff') {
      result.push({
        type: 'diff',
        path: item.path,
        oldText: item.oldText ?? null,
        newText: item.newText,
      })
    } else if (item.type === 'terminal') {
      result.push({ type: 'terminal', terminalId: item.terminalId })
    } else {
      const text = blockText(item.content)
      if (text) result.push({ type: 'text', text })
    }
  }
  return result
}

function normalizeLocations(locations: ToolCallLocation[] | null | undefined): string[] {
  return (locations ?? []).map((l) => l.path)
}

function stringifyOutput(raw: unknown): string | undefined {
  if (raw === undefined || raw === null) return undefined
  if (typeof raw === 'string') return raw
  return JSON.stringify(raw, null, 2)
}

function isEmpty(value: unknown): boolean {
  if (value === undefined || value === null) return true
  return typeof value === 'object' && Object.keys(value).length === 0
}
