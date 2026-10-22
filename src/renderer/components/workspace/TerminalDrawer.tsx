import { useEffect, useRef, useState } from 'react'
import { FitAddon } from '@xterm/addon-fit'
import { Terminal } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'
import { Plus, SquareTerminal, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useThemeStore } from '@/stores/theme'
import { useUiStore } from '@/stores/ui'

const THEMES = {
  dark: { background: '#0b0b0c', foreground: '#e6e6e6', cursor: '#e6e6e6' },
  light: {
    background: '#ffffff',
    foreground: '#1f1f1f',
    cursor: '#1f1f1f',
    selectionBackground: '#cfd8e6',
  },
}

const HEIGHT_KEY = 'clawos.terminalHeight'
const MIN_HEIGHT = 120

function savedHeight(): number {
  try {
    return Number(localStorage.getItem(HEIGHT_KEY)) || 280
  } catch {
    return 280
  }
}

/** Um shell real (node-pty) na pasta do projeto, desenhado com xterm. */
function TerminalView({
  projectId,
  active,
  onExit,
}: {
  projectId: string
  active: boolean
  onExit: () => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<{ term: Terminal; fit: FitAddon; id: string | null } | null>(null)
  const theme = useThemeStore((s) => s.theme)
  const onExitRef = useRef(onExit)
  useEffect(() => {
    onExitRef.current = onExit
  })

  useEffect(() => {
    const term = new Terminal({
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
      fontSize: 12,
      cursorBlink: true,
      scrollback: 5000,
      macOptionIsMeta: true,
      theme: THEMES[useThemeStore.getState().theme === 'dark' ? 'dark' : 'light'],
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(containerRef.current!)
    const state: { term: Terminal; fit: FitAddon; id: string | null } = { term, fit, id: null }
    termRef.current = state
    try {
      fit.fit()
    } catch {
      // Escondido: mede de novo quando aparecer.
    }

    const offData = window.clawos.on('terminal:data', (p) => {
      if (p.terminalId === state.id) term.write(p.data)
    })
    const offExit = window.clawos.on('terminal:exit', (p) => {
      if (p.terminalId === state.id) {
        state.id = null
        onExitRef.current()
      }
    })
    const input = term.onData((data) => {
      if (state.id) void window.clawos.invoke('terminal:input', state.id, data)
    })
    // Acompanha o tamanho do painel (arrastar a borda, abrir ao lado etc.).
    const observer = new ResizeObserver(() => {
      if (!containerRef.current?.offsetWidth) return
      try {
        fit.fit()
      } catch {
        return
      }
      if (state.id) void window.clawos.invoke('terminal:resize', state.id, term.cols, term.rows)
    })
    observer.observe(containerRef.current!)

    void window.clawos
      .invoke('terminal:open', projectId, term.cols, term.rows)
      .then((id) => {
        state.id = id
      })
      .catch((error: Error) => term.write(`\r\n\x1b[31m${error.message}\x1b[0m\r\n`))

    return () => {
      offData()
      offExit()
      input.dispose()
      observer.disconnect()
      if (state.id) void window.clawos.invoke('terminal:kill', state.id)
      term.dispose()
    }
  }, [projectId])

  useEffect(() => {
    const state = termRef.current
    if (state) state.term.options.theme = THEMES[theme === 'dark' ? 'dark' : 'light']
  }, [theme])

  useEffect(() => {
    if (active) termRef.current?.term.focus()
  }, [active])

  return (
    <div
      ref={containerRef}
      className={cn('absolute inset-0 px-2 pt-1', !active && 'invisible')}
      onMouseDown={() => termRef.current?.term.focus()}
    />
  )
}

/**
 * Terminal integrado do projeto, embaixo dos painéis (como no VS Code): várias abas, altura
 * ajustável e os shells continuam rodando quando o painel é escondido.
 */
export function TerminalDrawer({ projectId, visible }: { projectId: string; visible: boolean }) {
  const open = useUiStore((s) => s.terminalOpen[projectId] ?? false)
  const toggle = useUiStore((s) => s.toggleTerminal)
  const [tabs, setTabs] = useState<number[]>([])
  const [active, setActive] = useState<number | null>(null)
  const [height, setHeight] = useState(savedHeight)
  const counter = useRef(0)

  const addTab = () => {
    const id = ++counter.current
    setTabs((t) => [...t, id])
    setActive(id)
  }
  const closeTab = (id: number) => {
    setTabs((t) => {
      const next = t.filter((x) => x !== id)
      setActive((a) => (a === id ? (next.at(-1) ?? null) : a))
      if (next.length === 0) toggle(projectId, false)
      return next
    })
  }

  // Abrir pela primeira vez (botão ou ⌃`) já cria um terminal.
  useEffect(() => {
    if (!open || tabs.length > 0) return
    const timer = setTimeout(addTab, 0)
    return () => clearTimeout(timer)
    // Só ao abrir/fechar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const startResize = (e: React.MouseEvent) => {
    e.preventDefault()
    const startY = e.clientY
    const start = height
    const max = Math.max(MIN_HEIGHT, window.innerHeight - 200)
    let last = start
    const move = (ev: MouseEvent) => {
      last = Math.min(max, Math.max(MIN_HEIGHT, start + startY - ev.clientY))
      setHeight(last)
    }
    const up = () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
      try {
        localStorage.setItem(HEIGHT_KEY, String(last))
      } catch {
        // Sem armazenamento: a altura volta ao padrão na próxima vez.
      }
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }

  if (tabs.length === 0 && !open) return null

  return (
    <div
      className={cn('relative shrink-0 border-t bg-background', !(visible && open) && 'hidden')}
      style={{ height }}
    >
      <div
        className="absolute inset-x-0 -top-1 z-10 h-2 cursor-row-resize"
        onMouseDown={startResize}
        title="Arraste para ajustar a altura"
      />
      <div className="flex h-8 items-center gap-1 border-b px-2 text-xs">
        <SquareTerminal className="size-3.5 text-muted-foreground" />
        <span className="mr-2 font-medium">Terminal</span>
        {tabs.map((id, index) => (
          <button
            key={id}
            type="button"
            onClick={() => setActive(id)}
            className={cn(
              'group flex items-center gap-1 rounded px-2 py-0.5',
              active === id
                ? 'bg-accent text-foreground'
                : 'text-muted-foreground hover:bg-accent/50',
            )}
          >
            {index + 1}: shell
            <span
              role="button"
              tabIndex={-1}
              title="Fechar este terminal"
              onClick={(e) => {
                e.stopPropagation()
                closeTab(id)
              }}
              className="rounded p-0.5 opacity-60 hover:bg-background hover:opacity-100"
            >
              <X className="size-3" />
            </span>
          </button>
        ))}
        <button
          type="button"
          title="Novo terminal"
          onClick={addTab}
          className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <Plus className="size-3.5" />
        </button>
        <button
          type="button"
          title="Esconder o terminal (⌃`). Os terminais continuam rodando."
          onClick={() => toggle(projectId, false)}
          className="ml-auto rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      </div>
      <div className="relative h-[calc(100%-2rem)]">
        {tabs.map((id) => (
          <TerminalView
            key={id}
            projectId={projectId}
            active={id === active}
            onExit={() => closeTab(id)}
          />
        ))}
      </div>
    </div>
  )
}
