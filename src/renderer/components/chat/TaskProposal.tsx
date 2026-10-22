import { useMemo, useState } from 'react'
import { Check, ListTodo, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useChatContext } from '@/components/files/FileLinks'
import { cleanIpcError } from '@/lib/dock'
import { parseProposedTasks } from '@/lib/chatTurns'
import { cn } from '@/lib/utils'
import { useTasksStore } from '@/stores/tasks'
import { useUiStore } from '@/stores/ui'
import { CodeBlock } from './CodeBlock'

const PRIORITY = {
  1: 'text-red-500',
  2: 'text-orange-500',
  3: 'text-blue-500',
  4: 'text-muted-foreground',
} as const

const ADDED_KEY = 'clawos.addedTaskProposals'

function addedBefore(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(ADDED_KEY) ?? '[]') as string[])
  } catch {
    return new Set()
  }
}

function rememberAdded(key: string): void {
  try {
    localStorage.setItem(ADDED_KEY, JSON.stringify([...addedBefore(), key].slice(-200)))
  } catch {
    // Sem armazenamento: o botão volta a aparecer ao reabrir a conversa.
  }
}

/** Chave da proposta (o mesmo bloco não é adicionado duas vezes). */
function proposalKey(projectId: string, code: string): string {
  let hash = 0
  for (const char of code) hash = (hash * 31 + char.charCodeAt(0)) | 0
  return `${projectId}:${hash}`
}

/**
 * Bloco ```clawos-tasks da resposta do agente: mostra as tarefas propostas e as adiciona ao
 * quadro do projeto com um clique (dá para desmarcar as que não quiser).
 */
export function TaskProposal({ code }: { code: string }) {
  const chat = useChatContext()
  const tasks = useMemo(() => parseProposedTasks(code), [code])
  const [skipped, setSkipped] = useState<Set<number>>(new Set())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const key = chat ? proposalKey(chat.projectId, code) : ''
  const [added, setAdded] = useState(() => (key ? addedBefore().has(key) : false))

  if (!tasks) {
    // Ainda chegando (JSON incompleto) ou fora do formato: mostra o código.
    return /[\]}]\s*$/.test(code) ? (
      <CodeBlock code={code} lang="json" />
    ) : (
      <div className="flex items-center gap-2 rounded-lg border px-3 py-2 text-xs text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" /> Organizando as tarefas…
      </div>
    )
  }

  const chosen = tasks.filter((_, i) => !skipped.has(i))

  const addAll = async () => {
    if (!chat) return
    setBusy(true)
    setError(null)
    const store = useTasksStore.getState()
    try {
      // Cada tarefa nova entra no topo do quadro: cria de trás para frente para manter a ordem.
      for (const task of [...chosen].reverse()) {
        const created = await store.create({
          projectId: chat.projectId,
          title: task.title,
          notes: task.notes,
          priority: task.priority,
        })
        if (task.status === 'done') await store.update(created.id, { status: 'done' })
      }
      rememberAdded(key)
      setAdded(true)
      void store.loadCounts()
      void store.loadProject(chat.projectId)
    } catch (e) {
      setError(cleanIpcError(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="not-prose my-2 rounded-lg border">
      <div className="flex items-center gap-2 border-b px-3 py-2 text-xs font-medium">
        <ListTodo className="size-3.5" /> {tasks.length} tarefa{tasks.length > 1 && 's'} para o
        quadro
      </div>
      <ul className="divide-y">
        {tasks.map((task, i) => (
          <li key={i} className="flex items-start gap-2.5 px-3 py-2">
            <input
              type="checkbox"
              className="mt-0.5"
              disabled={added}
              checked={!skipped.has(i)}
              onChange={(e) =>
                setSkipped((s) => {
                  const next = new Set(s)
                  if (e.target.checked) next.delete(i)
                  else next.add(i)
                  return next
                })
              }
            />
            <div className="min-w-0 flex-1">
              <div
                className={cn(
                  'text-sm',
                  task.status === 'done' && 'text-muted-foreground line-through',
                )}
              >
                {task.title}
              </div>
              {task.notes && (
                <div className="mt-0.5 text-xs text-muted-foreground">{task.notes}</div>
              )}
            </div>
            {task.priority < 4 && (
              <span className={cn('text-[11px] font-medium', PRIORITY[task.priority])}>
                P{task.priority}
              </span>
            )}
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-2 border-t px-3 py-2">
        {added ? (
          <>
            <span className="flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
              <Check className="size-3.5" /> Adicionadas ao quadro
            </span>
            {chat && (
              <Button
                size="sm"
                variant="ghost"
                className="ml-auto h-7"
                onClick={() =>
                  useUiStore.getState().setView({ kind: 'tasks', projectId: chat.projectId })
                }
              >
                Abrir tarefas
              </Button>
            )}
          </>
        ) : (
          <>
            <Button
              size="sm"
              className="h-7"
              disabled={busy || chosen.length === 0 || !chat}
              onClick={() => void addAll()}
            >
              {busy ? <Loader2 className="animate-spin" /> : <ListTodo />}
              Adicionar {chosen.length} ao quadro
            </Button>
            {error && <span className="text-xs text-red-600">{error}</span>}
          </>
        )}
      </div>
    </div>
  )
}
