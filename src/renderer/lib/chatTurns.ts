import type { ChatItem } from '@shared/chat'
import type { TaskPriority, TaskStatus } from '@shared/types'

/**
 * Fim de cada resposta do agente: o último trecho de texto antes da próxima mensagem do
 * usuário. Uma resposta pode ter vários trechos intercalados com ferramentas; `text` junta
 * todos (é o que "Copiar" copia). A resposta em andamento não entra.
 */
export function turnEnds(items: ChatItem[], working: boolean): Map<number, { text: string }> {
  const ends = new Map<number, { text: string }>()
  let parts: string[] = []
  let lastAssistant = -1
  const close = () => {
    if (lastAssistant >= 0) ends.set(lastAssistant, { text: parts.join('\n\n').trim() })
    parts = []
    lastAssistant = -1
  }
  items.forEach((item, index) => {
    if (item.kind === 'user') close()
    else if (item.kind === 'assistant' && item.text.trim()) {
      parts.push(item.text.trim())
      lastAssistant = index
    }
  })
  // A última resposta só ganha as ações quando o agente termina.
  if (!working) close()
  return ends
}

/** Linguagem do bloco de código com as tarefas propostas pelo agente. */
export const TASKS_BLOCK = 'clawos-tasks'

/** Pedido enviado ao agente pelo botão "Organizar em tarefas". */
export function organizeTasksPrompt(text: string): string {
  const start = text.replace(/\s+/g, ' ').trim().slice(0, 90)
  return [
    `Organize em tarefas do quadro do Clawos as atividades da sua resposta que começa com "${start}…".`,
    `Responda somente com um bloco de código \`\`\`${TASKS_BLOCK} contendo um array JSON, sem texto antes ou depois, neste formato:`,
    '[{"title": "verbo + objetivo, até 80 caracteres", "notes": "detalhes úteis para executar (opcional)", "priority": 1, "status": "todo"}]',
    'priority: 1 = urgente, 2 = alta, 3 = média, 4 = sem prioridade. status: "todo" (a fazer) ou "done" (já feito).',
    'Uma tarefa por atividade, na ordem em que devem ser feitas. Não execute nada, só organize.',
  ].join('\n')
}

export interface ProposedTask {
  title: string
  notes: string
  priority: TaskPriority
  status: TaskStatus
}

/** Lê o JSON do bloco de tarefas; null se ainda estiver incompleto ou inválido. */
export function parseProposedTasks(code: string): ProposedTask[] | null {
  let data: unknown
  try {
    data = JSON.parse(code)
  } catch {
    return null
  }
  const list = Array.isArray(data) ? data : (data as { tasks?: unknown })?.tasks
  if (!Array.isArray(list)) return null
  const tasks = list.flatMap((raw): ProposedTask[] => {
    const t = raw as Record<string, unknown>
    const title = typeof t['title'] === 'string' ? t['title'].trim().slice(0, 200) : ''
    if (!title) return []
    const priority = Number(t['priority'])
    const status = String(t['status'] ?? 'todo')
    return [
      {
        title,
        notes: typeof t['notes'] === 'string' ? t['notes'].trim() : '',
        priority: ([1, 2, 3, 4].includes(priority) ? priority : 4) as TaskPriority,
        // O quadro tem "a fazer" e "concluídas"; qualquer outro status vira "a fazer".
        status: (status === 'done' ? 'done' : 'todo') as TaskStatus,
      },
    ]
  })
  return tasks.length > 0 ? tasks : null
}
