import { useEffect, useRef, useState } from 'react'
import { FitAddon } from '@xterm/addon-fit'
import { Terminal } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'
import { X } from 'lucide-react'
import type { AgentId } from '@shared/types'
import { Button } from '@/components/ui/button'

/**
 * Terminal real rodando o comando oficial de login do CLI (ex.: `claude auth login`).
 * O Clawos não vê nem guarda credenciais: o próprio CLI cuida de tudo.
 */
export function LoginTerminal({
  agentId,
  agentName,
  onClose,
}: {
  agentId: AgentId
  agentName: string
  onClose: () => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [exitCode, setExitCode] = useState<number | null>(null)

  useEffect(() => {
    const term = new Terminal({
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
      fontSize: 12,
      cursorBlink: true,
      theme: { background: '#0b0b0c' },
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(containerRef.current!)
    fit.fit()

    let terminalId: string | null = null
    const offData = window.clawos.on('terminal:data', (p) => {
      if (p.terminalId === terminalId) term.write(p.data)
    })
    const offExit = window.clawos.on('terminal:exit', (p) => {
      if (p.terminalId === terminalId) setExitCode(p.exitCode)
    })
    const input = term.onData((data) => {
      if (terminalId) void window.clawos.invoke('terminal:input', terminalId, data)
    })
    const onResize = () => {
      fit.fit()
      if (terminalId) void window.clawos.invoke('terminal:resize', terminalId, term.cols, term.rows)
    }
    window.addEventListener('resize', onResize)

    void window.clawos
      .invoke('agents:login', agentId, term.cols, term.rows)
      .then((id) => {
        terminalId = id
      })
      .catch((error: Error) => term.write(`\r\n\x1b[31m${error.message}\x1b[0m\r\n`))
    term.focus()

    return () => {
      offData()
      offExit()
      input.dispose()
      window.removeEventListener('resize', onResize)
      if (terminalId) void window.clawos.invoke('terminal:kill', terminalId)
      term.dispose()
    }
  }, [agentId])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6">
      <div className="flex h-[480px] w-full max-w-3xl flex-col overflow-hidden rounded-lg border bg-background shadow-xl">
        <div className="flex items-center justify-between border-b px-4 py-2">
          <div className="text-sm font-medium">
            Entrar no {agentName}
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              login oficial do CLI — o Clawos não vê suas credenciais
            </span>
          </div>
          <Button variant="ghost" size="icon" className="size-7" onClick={onClose} title="Fechar">
            <X />
          </Button>
        </div>
        <div className="min-h-0 flex-1 bg-[#0b0b0c] p-2">
          <div ref={containerRef} className="h-full w-full" />
        </div>
        {exitCode !== null && (
          <div className="flex items-center justify-between border-t px-4 py-2 text-sm">
            <span className={exitCode === 0 ? 'text-emerald-600' : 'text-red-600'}>
              {exitCode === 0 ? 'Login concluído.' : `O comando terminou com código ${exitCode}.`}
            </span>
            <Button size="sm" onClick={onClose}>
              Fechar
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
