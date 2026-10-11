import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { FitAddon } from '@xterm/addon-fit'
import { Terminal } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'
import { Loader2, X } from 'lucide-react'
import type { AgentId } from '@shared/types'
import { Button } from '@/components/ui/button'

/**
 * Terminal real rodando um comando oficial do CLI: o instalador (`install`) ou o login
 * (`login`, ex.: `claude auth login`). O Clawos não vê nem guarda credenciais: o próprio
 * CLI cuida de tudo.
 */
export function AgentTerminal({
  agentId,
  agentName,
  action,
  onClose,
}: {
  agentId: AgentId
  agentName: string
  action: 'install' | 'login'
  onClose: (succeeded: boolean) => void
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
      .invoke(
        action === 'install' ? 'agents:install' : 'agents:login',
        agentId,
        term.cols,
        term.rows,
      )
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
  }, [agentId, action])

  // Portal: dentro do assistente ou de um painel, `fixed` ficaria preso (e cortado).
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-6">
      <div className="flex h-[480px] w-full max-w-3xl flex-col overflow-hidden rounded-lg border bg-background shadow-xl">
        <div className="flex items-center justify-between border-b px-4 py-2">
          <div className="text-sm font-medium">
            {action === 'install' ? `Instalando o ${agentName}` : `Entrar no ${agentName}`}
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              {action === 'install'
                ? 'instalador oficial — pode levar um minuto'
                : 'login oficial do CLI — o Clawos não vê suas credenciais'}
            </span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={() => onClose(exitCode === 0)}
            title="Fechar"
          >
            <X />
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden bg-[#0b0b0c] p-2">
          <div ref={containerRef} className="h-full w-full" />
        </div>
        {/* Rodapé sempre presente: o terminal é medido já com ele, sem sobrepor. */}
        <div className="flex h-12 shrink-0 items-center justify-between gap-3 border-t px-4 text-sm">
          {exitCode === null ? (
            <span className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              {action === 'install'
                ? `Instalando o ${agentName}…`
                : 'Siga as instruções acima (o login abre no navegador).'}
            </span>
          ) : (
            <span className={exitCode === 0 ? 'text-emerald-600' : 'text-red-600'}>
              {exitCode === 0
                ? action === 'install'
                  ? `${agentName} instalado.`
                  : 'Login concluído.'
                : `O comando terminou com código ${exitCode}. Veja a mensagem acima.`}
            </span>
          )}
          <Button
            size="sm"
            variant={exitCode === 0 ? 'default' : 'outline'}
            onClick={() => onClose(exitCode === 0)}
          >
            {exitCode === 0 ? 'Continuar' : exitCode === null ? 'Cancelar' : 'Fechar'}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
