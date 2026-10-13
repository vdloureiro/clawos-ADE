import { useState } from 'react'
import {
  CheckCircle2,
  Code2,
  Loader2,
  Megaphone,
  Palette,
  PenLine,
  Plus,
  Trash2,
} from 'lucide-react'
import {
  SKILL_CATALOG,
  SKILL_CATEGORIES,
  SKILL_SOURCES,
  skillSourceUrl,
  type SkillCategory,
} from '@shared/skillCatalog'
import { Button } from '@/components/ui/button'
import { cleanIpcError } from '@/lib/dock'
import { cn } from '@/lib/utils'

const CATEGORY_ICON: Record<SkillCategory, typeof Code2> = {
  programacao: Code2,
  design: Palette,
  marketing: Megaphone,
  escrita: PenLine,
}

/**
 * Skills prontas, de fontes abertas e conhecidas. "Adicionar" baixa a skill (no commit
 * fixado, com os arquivos conferidos) para `.clawos/skills/` do projeto.
 */
export function SkillCatalogGrid({
  projectPath,
  added,
  onInstalled,
  onRemove,
}: {
  projectPath: string
  /** Ids do catálogo já adicionados ao projeto. */
  added: Set<string>
  onInstalled: (id: string, path: string) => void
  onRemove?: (id: string) => void
}) {
  const [category, setCategory] = useState<SkillCategory | 'todas'>('todas')
  const [installing, setInstalling] = useState<Set<string>>(new Set())
  const [errors, setErrors] = useState<Record<string, string>>({})

  const install = async (id: string) => {
    setInstalling((s) => new Set(s).add(id))
    setErrors(({ [id]: _, ...rest }) => rest)
    try {
      onInstalled(id, await window.clawos.invoke('skills:install', projectPath, id))
    } catch (e) {
      setErrors((all) => ({ ...all, [id]: cleanIpcError(e) }))
    } finally {
      setInstalling((s) => {
        const next = new Set(s)
        next.delete(id)
        return next
      })
    }
  }

  const visible = SKILL_CATALOG.filter((s) => category === 'todas' || s.category === category)

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {[{ id: 'todas' as const, label: 'Todas' }, ...SKILL_CATEGORIES].map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setCategory(c.id)}
            className={cn(
              'rounded-full border px-2.5 py-0.5 text-xs transition-colors',
              category === c.id
                ? 'border-foreground bg-foreground text-background'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {c.label}
          </button>
        ))}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {visible.map((entry) => {
          const Icon = CATEGORY_ICON[entry.category]
          const source = SKILL_SOURCES[entry.source]
          const isAdded = added.has(entry.id)
          const busy = installing.has(entry.id)
          return (
            <div
              key={entry.id}
              className={cn(
                'rounded-lg border p-3 transition-colors',
                isAdded && 'border-emerald-500/40 bg-emerald-500/[0.04]',
              )}
            >
              <div className="flex items-start gap-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted">
                  <Icon className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{entry.name}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">{entry.description}</div>
                  <a
                    href={skillSourceUrl(entry)}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 inline-block text-[10px] text-muted-foreground/80 hover:underline"
                    title={`${source.repo} · ${entry.dir}`}
                  >
                    {source.label} · {source.license}
                  </a>
                  <div className="mt-2 flex items-center gap-2">
                    {isAdded ? (
                      <>
                        <span className="flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                          <CheckCircle2 className="size-4" /> Adicionada
                        </span>
                        {onRemove && (
                          <button
                            type="button"
                            className="ml-auto rounded p-1 text-muted-foreground hover:bg-accent hover:text-red-500"
                            title="Remover do projeto"
                            onClick={() => onRemove(entry.id)}
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        )}
                      </>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7"
                        disabled={busy}
                        onClick={() => void install(entry.id)}
                      >
                        {busy ? <Loader2 className="animate-spin" /> : <Plus />}
                        {busy ? 'Baixando…' : 'Adicionar'}
                      </Button>
                    )}
                  </div>
                  {errors[entry.id] && (
                    <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">
                      {errors[entry.id]}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
