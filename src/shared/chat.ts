import type {
  PermissionOptionView,
  PlanEntryView,
  SessionEvent,
  SessionInfo,
  SessionStatus,
  ToolCallView,
} from './types'

export type ChatItem =
  | { kind: 'user'; id: string; text: string; attachments?: string[] }
  | { kind: 'assistant'; id: string; text: string }
  | { kind: 'thought'; id: string; text: string }
  | { kind: 'tool'; id: string; toolCall: ToolCallView }
  | {
      kind: 'permission'
      id: string
      toolCallId: string
      title: string
      options: PermissionOptionView[]
      /** `undefined` = aguardando; `null` = cancelado; string = opção escolhida. */
      resolution?: string | null
    }
  | { kind: 'plan'; id: string; entries: PlanEntryView[] }
  | { kind: 'notice'; id: string; text: string }
  | { kind: 'error'; id: string; message: string }

export interface ChatState {
  info: SessionInfo
  status: SessionStatus
  items: ChatItem[]
}

let counter = 0
const localId = (prefix: string): string => `${prefix}-${++counter}`

export function createChatState(info: SessionInfo): ChatState {
  return { info, status: 'starting', items: [] }
}

/** Aplica um evento normalizado ao estado do chat. Função pura (exceto ids locais). */
export function applyEvent(state: ChatState, event: SessionEvent): ChatState {
  switch (event.type) {
    case 'status_change':
      return { ...state, status: event.status }

    case 'user_message': {
      const next = appendText(state, 'user', event.id, event.text)
      if (!event.attachments?.length) return next
      const last = next.items.at(-1)
      if (last?.kind !== 'user') return next
      return {
        ...next,
        items: [...next.items.slice(0, -1), { ...last, attachments: event.attachments }],
      }
    }
    case 'text_delta':
      return appendText(state, 'assistant', event.messageId, event.text)
    case 'thought_delta':
      return appendText(state, 'thought', event.messageId, event.text)

    case 'tool_call_start': {
      const index = findTool(state, event.toolCall.id)
      if (index >= 0) return updateTool(state, index, event.toolCall)
      const item: ChatItem = { kind: 'tool', id: event.toolCall.id, toolCall: event.toolCall }
      return { ...state, items: [...state.items, item] }
    }
    case 'tool_call_update': {
      const index = findTool(state, event.toolCallId)
      if (index >= 0) return updateTool(state, index, event.patch)
      const toolCall: ToolCallView = {
        id: event.toolCallId,
        title: 'Ferramenta',
        kind: 'other',
        status: 'pending',
        content: [],
        locations: [],
        ...event.patch,
      }
      return { ...state, items: [...state.items, { kind: 'tool', id: toolCall.id, toolCall }] }
    }

    case 'plan': {
      // Um plano por sessão, atualizado no lugar.
      const index = state.items.findIndex((i) => i.kind === 'plan')
      const item: ChatItem = { kind: 'plan', id: 'plan', entries: event.entries }
      if (index < 0) return { ...state, items: [...state.items, item] }
      return { ...state, items: replaceAt(state.items, index, item) }
    }

    case 'permission_request':
      return {
        ...state,
        items: [
          ...state.items,
          {
            kind: 'permission',
            id: event.requestId,
            toolCallId: event.toolCallId,
            title: event.title,
            options: event.options,
          },
        ],
      }
    case 'permission_resolved': {
      const index = state.items.findIndex(
        (i) => i.kind === 'permission' && i.id === event.requestId,
      )
      const item = state.items[index]
      if (!item || item.kind !== 'permission') return state
      return {
        ...state,
        items: replaceAt(state.items, index, { ...item, resolution: event.optionId }),
      }
    }

    case 'turn_end':
      if (event.stopReason === 'end_turn') return state
      return {
        ...state,
        items: [
          ...state.items,
          { kind: 'notice', id: localId('notice'), text: stopReasonText(event.stopReason) },
        ],
      }
    case 'notice':
      return {
        ...state,
        items: [...state.items, { kind: 'notice', id: localId('notice'), text: event.text }],
      }
    case 'error':
      return {
        ...state,
        items: [...state.items, { kind: 'error', id: localId('error'), message: event.message }],
      }
  }
}

function stopReasonText(reason: string): string {
  switch (reason) {
    case 'cancelled':
      return 'Interrompido.'
    case 'max_tokens':
      return 'Resposta cortada: limite de tokens atingido.'
    case 'max_turn_requests':
      return 'Limite de passos do turno atingido.'
    case 'refusal':
      return 'O agente recusou continuar.'
    default:
      return reason
  }
}

/** Concatena deltas consecutivos da mesma mensagem; um novo id inicia um novo bloco. */
function appendText(
  state: ChatState,
  kind: 'user' | 'assistant' | 'thought',
  id: string,
  text: string,
): ChatState {
  const last = state.items.at(-1)
  if (last && last.kind === kind && last.id === id) {
    return {
      ...state,
      items: replaceAt(state.items, state.items.length - 1, { ...last, text: last.text + text }),
    }
  }
  return { ...state, items: [...state.items, { kind, id, text }] }
}

function findTool(state: ChatState, id: string): number {
  return state.items.findIndex((i) => i.kind === 'tool' && i.id === id)
}

function updateTool(state: ChatState, index: number, patch: Partial<ToolCallView>): ChatState {
  const item = state.items[index]
  if (!item || item.kind !== 'tool') return state
  return {
    ...state,
    items: replaceAt(state.items, index, { ...item, toolCall: { ...item.toolCall, ...patch } }),
  }
}

function replaceAt<T>(items: T[], index: number, value: T): T[] {
  const copy = items.slice()
  copy[index] = value
  return copy
}
