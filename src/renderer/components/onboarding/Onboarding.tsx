import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowLeft, ArrowRight, Check, FolderPlus, Loader2, ShieldCheck, X } from 'lucide-react'
import type { AgentId } from '@shared/types'
import { AgentCard, RecheckButton } from '@/components/agents/AgentStatusList'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useAgentsStore } from '@/stores/agents'
import { useProjectsStore } from '@/stores/projects'
import { useUiStore } from '@/stores/ui'
import logo from '../../../../resources/icon.svg?url'

/** Agentes oferecidos no primeiro acesso (o Gemini fica de fora por enquanto). */
const ONBOARDING_AGENTS: AgentId[] = ['claude', 'codex']

const DONE_KEY = 'clawos.onboarding.done'

export function onboardingDone(): boolean {
  try {
    return localStorage.getItem(DONE_KEY) === '1'
  } catch {
    return false
  }
}

function markDone(): void {
  try {
    localStorage.setItem(DONE_KEY, '1')
  } catch {
    // Sem localStorage: o assistente volta a aparecer enquanto não houver projetos.
  }
}

const STEPS = [
  { title: 'Instalar os agentes', short: 'Instalar' },
  { title: 'Entrar com sua conta', short: 'Entrar' },
  { title: 'Criar o primeiro projeto', short: 'Projeto' },
]

/**
 * Assistente de primeiro acesso: 1) instalar os CLIs dos agentes, 2) entrar na conta de
 * cada um, 3) criar o primeiro projeto. O status dos agentes se atualiza sozinho
 * (ao voltar para a janela e a cada poucos segundos enquanto falta algo).
 */
export function Onboarding({ onClose }: { onClose: () => void }) {
  const statuses = useAgentsStore((s) => s.statuses)
  const refresh = useAgentsStore((s) => s.refresh)
  const projects = useProjectsStore((s) => s.projects)
  const setNewProjectOpen = useUiStore((s) => s.setNewProjectOpen)
  const agents = statuses.filter((s) => ONBOARDING_AGENTS.includes(s.id))
  const installed = agents.filter((a) => a.installed)
  const ready = installed.filter((a) => a.loggedIn !== false)

  // Começa na primeira etapa pendente (ex.: quem já tem o Claude instalado e logado).
  const [step, setStep] = useState(() => (ready.length > 0 ? 2 : installed.length > 0 ? 1 : 0))

  // Enquanto falta instalar/entrar, verifica de novo sozinho: a pessoa pode ter
  // instalado pelo Terminal ou logado no navegador.
  const pending =
    (step === 0 && installed.length < agents.length) ||
    (step === 1 && installed.some((a) => a.loggedIn === false))
  useEffect(() => {
    if (!pending) return
    const timer = setInterval(() => void refresh(true, { quiet: true }), 4000)
    return () => clearInterval(timer)
  }, [pending, refresh])

  // Projeto criado pelo assistente de projeto: terminou.
  const [waitingProject, setWaitingProject] = useState(false)
  useEffect(() => {
    if (waitingProject && projects.length > 0) {
      markDone()
      onClose()
    }
  }, [waitingProject, projects.length, onClose])

  const finish = () => {
    markDone()
    onClose()
  }

  const canNext = step === 0 ? installed.length > 0 : step === 1 ? ready.length > 0 : false

  return createPortal(
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-background/95 p-6 backdrop-blur-sm">
      <div className="flex max-h-full w-full max-w-xl flex-col overflow-hidden rounded-xl border bg-background shadow-2xl">
        <div className="flex items-start gap-3 border-b px-6 pt-5 pb-4">
          <img src={logo} alt="" className="size-9 rounded-lg" />
          <div className="min-w-0 flex-1">
            <h1 className="text-base font-semibold">Bem-vindo ao Clawos</h1>
            <p className="text-xs text-muted-foreground">
              Três passos e você já conversa com seus agentes de código.
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            title="Pular por agora (dá para abrir de novo pela busca ⌘K)"
            onClick={finish}
          >
            <X />
          </Button>
        </div>

        <ol className="flex items-center gap-2 px-6 pt-4">
          {STEPS.map((s, i) => (
            <li key={s.short} className="flex flex-1 items-center gap-2">
              <span
                className={cn(
                  'flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-medium',
                  i < step && 'border-emerald-500 bg-emerald-500 text-white',
                  i === step && 'border-foreground bg-foreground text-background',
                  i > step && 'text-muted-foreground',
                )}
              >
                {i < step ? <Check className="size-3.5" /> : i + 1}
              </span>
              <span
                className={cn(
                  'truncate text-xs',
                  i === step ? 'font-medium' : 'text-muted-foreground',
                )}
              >
                {s.short}
              </span>
              {i < STEPS.length - 1 && <span className="h-px flex-1 bg-border" />}
            </li>
          ))}
        </ol>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          <h2 className="text-sm font-semibold">{STEPS[step]!.title}</h2>

          {step === 0 && (
            <>
              <p className="mt-1 mb-4 text-xs text-muted-foreground">
                O Clawos usa os programas oficiais de cada agente. Instale pelo menos um — o
                instalador roda aqui mesmo, sem precisar abrir o Terminal.
              </p>
              <AgentList ids={agents.map((a) => a.id)} show="install" />
            </>
          )}

          {step === 1 && (
            <>
              <p className="mt-1 mb-4 text-xs text-muted-foreground">
                Entre com a conta que você já usa no agente. O login é feito pelo próprio agente, no
                navegador.
              </p>
              <AgentList ids={installed.map((a) => a.id)} show="login" />
              <p className="mt-3 flex items-start gap-1.5 text-[11px] text-muted-foreground">
                <ShieldCheck className="mt-px size-3.5 shrink-0" />O Clawos nunca vê nem guarda suas
                senhas ou tokens: tudo fica com o agente oficial, no seu computador.
              </p>
            </>
          )}

          {step === 2 && (
            <>
              <p className="mt-1 mb-4 text-xs text-muted-foreground">
                Um projeto é uma pasta do seu computador onde os agentes vão trabalhar. Você pode
                abrir uma pasta que já existe ou começar uma do zero.
              </p>
              <button
                type="button"
                onClick={() => {
                  setWaitingProject(true)
                  setNewProjectOpen(true)
                }}
                className="flex w-full items-center gap-3 rounded-lg border bg-card p-4 text-left transition-colors hover:bg-accent"
              >
                <span className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  {waitingProject ? (
                    <Loader2 className="size-5 animate-spin" />
                  ) : (
                    <FolderPlus className="size-5" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">Criar meu primeiro projeto</span>
                  <span className="block text-xs text-muted-foreground">
                    Escolha uma pasta, os agentes e as ferramentas (MCPs) do projeto.
                  </span>
                </span>
                <ArrowRight className="size-4 text-muted-foreground" />
              </button>
              <div className="mt-4 rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">Prontos para usar: </span>
                {ready.length > 0
                  ? ready.map((a) => a.name).join(' e ')
                  : 'nenhum agente ainda — volte e entre com sua conta.'}
              </div>
            </>
          )}
        </div>

        <div className="flex items-center gap-2 border-t px-6 py-3">
          {step > 0 ? (
            <Button variant="ghost" size="sm" onClick={() => setStep(step - 1)}>
              <ArrowLeft /> Voltar
            </Button>
          ) : (
            <span />
          )}
          {step < 2 && <RecheckButton className="ml-auto" />}
          {step < 2 ? (
            <Button
              size="sm"
              disabled={!canNext}
              title={
                canNext
                  ? undefined
                  : step === 0
                    ? 'Instale pelo menos um agente'
                    : 'Entre com a conta de pelo menos um agente'
              }
              onClick={() => setStep(step + 1)}
            >
              Continuar <ArrowRight />
            </Button>
          ) : (
            <Button variant="ghost" size="sm" className="ml-auto" onClick={finish}>
              Fazer isso depois
            </Button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}

function AgentList({ ids, show }: { ids: AgentId[]; show: 'install' | 'login' }) {
  const statuses = useAgentsStore((s) => s.statuses)
  if (statuses.length === 0)
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" /> Verificando os agentes deste computador…
      </div>
    )
  return (
    <div className="space-y-2">
      {ids.map((id) => {
        const status = statuses.find((s) => s.id === id)
        return status ? <AgentCard key={id} status={status} show={show} /> : null
      })}
    </div>
  )
}
