import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Brain, Check, ChevronDown, ShieldAlert, ShieldCheck, Zap } from 'lucide-react'
import type { SessionConfigOption } from '@shared/types'
import { cn } from '@/lib/utils'

/**
 * Seletores de modelo e de permissões na barra do chat. As opções vêm do próprio agente
 * (ACP `configOptions`), então novos modelos aparecem sem mudar o Clawos.
 */
export function ConfigPickers({
  options,
  disabled,
  onChange,
}: {
  options: SessionConfigOption[]
  disabled?: boolean
  onChange: (configId: string, value: string) => Promise<void>
}) {
  const model = options.find((o) => o.category === 'model')
  const effort = options.find((o) => o.category === 'thought_level')
  const mode = options.find((o) => o.category === 'mode')
  return (
    <>
      {model && (
        <ModelPicker model={model} effort={effort} disabled={disabled} onChange={onChange} />
      )}
      {mode && <ModePicker mode={mode} disabled={disabled} onChange={onChange} />}
    </>
  )
}

// ---------------------------------------------------------------------------

/** Rótulos simples para os modos de permissão dos agentes (ids do Claude e do Codex). */
const MODES: Record<string, { label: string; description: string; auto?: boolean }> = {
  // Claude Code
  bypassPermissions: {
    label: 'Automático',
    description: 'Faz tudo sem pedir permissão',
    auto: true,
  },
  auto: {
    label: 'Automático com revisão',
    description: 'O Claude decide e só pede o que for arriscado',
  },
  acceptEdits: {
    label: 'Editar sem pedir',
    description: 'Edita arquivos sozinho; pede antes de rodar comandos',
  },
  default: {
    label: 'Pedir permissão',
    description: 'Pergunta antes de editar arquivos ou rodar comandos',
  },
  plan: { label: 'Só planejar', description: 'Analisa e propõe um plano, sem alterar nada' },
  // Codex
  'agent-full-access': {
    label: 'Automático',
    description: 'Acesso total, sem pedir permissão',
    auto: true,
  },
  agent: {
    label: 'Automático com revisão',
    description: 'Só pede ações potencialmente arriscadas',
  },
  'workspace-write': {
    label: 'Editar o projeto',
    description: 'Edita arquivos do projeto; pede para rede e fora dele',
  },
  'read-only': {
    label: 'Pedir permissão',
    description: 'Pede aprovação para editar arquivos e acessar a internet',
  },
}

/** Ordem no menu: do mais livre ao mais restrito. */
const MODE_ORDER = Object.keys(MODES)

function modeInfo(value: string, fallback: { name: string; description?: string }) {
  return MODES[value] ?? { label: fallback.name, description: fallback.description ?? '' }
}

function ModePicker({
  mode,
  disabled,
  onChange,
}: {
  mode: SessionConfigOption
  disabled?: boolean
  onChange: (configId: string, value: string) => Promise<void>
}) {
  const current = mode.options.find((o) => o.value === mode.currentValue)
  const info = modeInfo(mode.currentValue, current ?? { name: mode.currentValue })
  const sorted = [...mode.options].sort(
    (a, b) => (MODE_ORDER.indexOf(a.value) + 1 || 99) - (MODE_ORDER.indexOf(b.value) + 1 || 99),
  )
  const Icon = info.auto ? Zap : ShieldCheck
  return (
    <Dropdown
      disabled={disabled}
      title="Permissões do agente"
      label={
        <>
          <Icon className={cn('size-3.5', info.auto && 'text-amber-500')} />
          {info.label}
        </>
      }
    >
      {(close) => (
        <>
          <MenuHeader>Permissões</MenuHeader>
          {sorted.map((option) => {
            const item = modeInfo(option.value, option)
            return (
              <MenuItem
                key={option.value}
                selected={option.value === mode.currentValue}
                label={item.label}
                description={item.description}
                icon={
                  item.auto ? (
                    <ShieldAlert className="size-3.5 text-amber-500" />
                  ) : (
                    <ShieldCheck className="size-3.5 text-muted-foreground" />
                  )
                }
                onClick={() => {
                  close()
                  void onChange(mode.id, option.value)
                }}
              />
            )
          })}
        </>
      )}
    </Dropdown>
  )
}

function ModelPicker({
  model,
  effort,
  disabled,
  onChange,
}: {
  model: SessionConfigOption
  effort?: SessionConfigOption
  disabled?: boolean
  onChange: (configId: string, value: string) => Promise<void>
}) {
  const current = model.options.find((o) => o.value === model.currentValue)
  const currentEffort = effort?.options.find((o) => o.value === effort.currentValue)
  return (
    <Dropdown
      disabled={disabled}
      title="Modelo"
      label={
        <>
          {modelLabel(current ?? { value: model.currentValue, name: model.currentValue })}
          {currentEffort && effort?.currentValue !== 'default' && (
            <span className="text-muted-foreground/70">· {effortLabel(currentEffort.name)}</span>
          )}
        </>
      }
    >
      {(close) => (
        <>
          <MenuHeader>Modelo</MenuHeader>
          {model.options.map((option) => (
            <MenuItem
              key={option.value}
              selected={option.value === model.currentValue}
              label={modelLabel(option)}
              description={option.description}
              onClick={() => {
                close()
                void onChange(model.id, option.value)
              }}
            />
          ))}
          {effort && (
            <>
              <MenuHeader className="mt-1 border-t pt-2">
                <Brain className="size-3" /> Raciocínio
              </MenuHeader>
              <div className="flex flex-wrap gap-1 px-2 pb-1.5">
                {effort.options.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={cn(
                      'rounded border px-2 py-0.5 text-[11px] hover:bg-accent',
                      option.value === effort.currentValue &&
                        'border-foreground/40 bg-accent font-medium',
                    )}
                    onClick={() => void onChange(effort.id, option.value)}
                  >
                    {effortLabel(option.name)}
                  </button>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </Dropdown>
  )
}

/** "Default (recommended)" vira "Padrão (recomendado)"; o resto é nome de modelo. */
function modelLabel(option: { value: string; name: string }): string {
  if (option.value === 'default')
    return option.name.replace(/^Default/, 'Padrão').replace('recommended', 'recomendado')
  return option.name === option.value ? prettyModelId(option.value) : option.name
}

/** Id cru que o agente às vezes devolve (ex.: `claude-opus-4-6` → `Opus 4.6`). */
export function prettyModelId(id: string): string {
  const match = /^claude-([a-z]+)-(\d+)(?:-(\d{1,2}))?(?:-\d{8})?(\[1m\])?$/.exec(id)
  if (!match) return id
  const [, family = '', major, minor, longContext] = match
  const name = family.charAt(0).toUpperCase() + family.slice(1)
  return `${name} ${major}${minor ? `.${minor}` : ''}${longContext ? ' (1M)' : ''}`
}

function effortLabel(name: string): string {
  const map: Record<string, string> = {
    default: 'Padrão',
    minimal: 'Mínimo',
    low: 'Baixo',
    medium: 'Médio',
    high: 'Alto',
    xhigh: 'Muito alto',
    max: 'Máximo',
    ultra: 'Ultra',
  }
  return map[name.toLowerCase()] ?? name
}

// ---------------------------------------------------------------------------

function Dropdown({
  label,
  title,
  disabled,
  children,
}: {
  label: ReactNode
  title: string
  disabled?: boolean
  children: (close: () => void) => ReactNode
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])
  return (
    <div className="relative min-w-0" ref={ref}>
      <button
        type="button"
        disabled={disabled}
        title={title}
        onClick={() => setOpen(!open)}
        className={cn(
          'flex max-w-56 items-center gap-1 truncate rounded-md px-1.5 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40 disabled:hover:bg-transparent',
          open && 'bg-accent text-foreground',
        )}
      >
        {label}
        <ChevronDown className="size-3 shrink-0 opacity-60" />
      </button>
      {open && (
        <div className="absolute bottom-full left-0 z-40 mb-1 max-h-96 w-72 overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-lg">
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  )
}

function MenuHeader({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'flex items-center gap-1 px-2 pt-1 pb-1 text-[11px] text-muted-foreground',
        className,
      )}
    >
      {children}
    </div>
  )
}

function MenuItem({
  label,
  description,
  selected,
  icon,
  onClick,
}: {
  label: string
  description?: string
  selected: boolean
  icon?: ReactNode
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-start gap-2 rounded px-2 py-1.5 text-left hover:bg-accent"
    >
      {icon && <span className="mt-0.5 shrink-0">{icon}</span>}
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-medium">{label}</span>
        {description && (
          <span className="block text-[11px] leading-snug text-muted-foreground">
            {description}
          </span>
        )}
      </span>
      {selected && <Check className="mt-0.5 size-3.5 shrink-0" />}
    </button>
  )
}
