import { useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  FileText,
  FolderOpen,
  FolderPlus,
  GitBranch,
  KeyRound,
  Loader2,
  Plug,
  Plus,
  Sparkles,
  Trash2,
} from 'lucide-react'
import { AGENT_IDS, AGENT_META } from '@shared/agents'
import { buildCatalogEntry, MCP_CATALOG, type CatalogEntry } from '@shared/mcpCatalog'
import { isRemoteMcp, type McpServerConfig, type ProjectConfig } from '@shared/project'
import { PROJECT_COLORS, type AgentId, type FolderInspection } from '@shared/types'
import { AgentIcon } from '@/components/agents/AgentIcon'
import { McpEditor } from '@/components/settings/ProjectSettings'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import { cleanIpcError, newSessionInDock } from '@/lib/dock'
import { emptyMcpForm, fromForm, type McpForm } from '@/lib/mcpForm'
import { cn } from '@/lib/utils'
import { useAgentsStore } from '@/stores/agents'
import { useProjectsStore } from '@/stores/projects'
import { useSessionsStore } from '@/stores/sessions'

type Step = 'projeto' | 'agentes' | 'mcps' | 'skills' | 'revisao'

const STEPS: { id: Step; label: string }[] = [
  { id: 'projeto', label: 'Projeto' },
  { id: 'agentes', label: 'Agentes' },
  { id: 'mcps', label: 'MCPs' },
  { id: 'skills', label: 'Skills' },
  { id: 'revisao', label: 'Revisão' },
]

interface ChosenMcp {
  name: string
  server: McpServerConfig
  secrets: Record<string, string>
  origin: 'catálogo' | 'personalizado' | 'existente'
}

interface SkillChoice {
  path: string
  checked: boolean
}

function summary(server: McpServerConfig): string {
  return isRemoteMcp(server) ? server.url : [server.command, ...(server.args ?? [])].join(' ')
}

/** Assistente de novo projeto: pasta, agentes, MCPs e skills numa configuração inicial. */
export function NewProjectWizard({ onClose }: { onClose: () => void }) {
  const created = useProjectsStore((s) => s.created)
  const statuses = useAgentsStore((s) => s.statuses)
  const [step, setStep] = useState<Step>('projeto')
  const [inspection, setInspection] = useState<FolderInspection | null>(null)
  const [name, setName] = useState('')
  const [color, setColor] = useState<string>(PROJECT_COLORS[0])
  const [defaultAgent, setDefaultAgent] = useState<AgentId>('claude')
  const [enabled, setEnabled] = useState<Record<AgentId, boolean>>({
    claude: true,
    codex: true,
    gemini: false,
  })
  const [customInstructions, setCustomInstructions] = useState('')
  const [mcps, setMcps] = useState<ChosenMcp[]>([])
  const [skills, setSkills] = useState<SkillChoice[]>([])
  const [openChat, setOpenChat] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const index = STEPS.findIndex((s) => s.id === step)
  const canAdvance = step !== 'projeto' || (inspection !== null && name.trim() !== '')

  const chooseFolder = async () => {
    const path = await window.clawos.invoke('dialog:pickFolder', 'Pasta do projeto')
    if (!path) return
    setError(null)
    try {
      const info = await window.clawos.invoke('projects:inspect', path)
      const config = info.config.config
      setInspection(info)
      setName(info.alreadyAdded?.name ?? info.suggestedName)
      if (info.alreadyAdded) setColor(info.alreadyAdded.color)
      setDefaultAgent(config.defaultAgent ?? 'claude')
      setEnabled({
        claude: config.agents?.['claude']?.enabled !== false,
        codex: config.agents?.['codex']?.enabled !== false,
        gemini: config.agents?.['gemini']?.enabled === true,
      })
      setCustomInstructions(config.instructions ?? '')
      setMcps(
        Object.entries(config.mcpServers ?? {}).map(([n, server]) => ({
          name: n,
          server,
          secrets: {},
          origin: 'existente',
        })),
      )
      const configured = new Set(config.skills ?? [])
      const found = [...new Set([...info.skills, ...configured])]
      // .claude/skills o Claude já lê sozinho; marcar serve para levá-las também ao Codex.
      setSkills(
        found.map((p) => ({ path: p, checked: configured.has(p) || !p.startsWith('./.claude/') })),
      )
    } catch (e) {
      setError(cleanIpcError(e))
    }
  }

  const addSkillFolder = async () => {
    const folder = await window.clawos.invoke('dialog:pickFolder', 'Pasta da skill (com SKILL.md)')
    if (!folder || !inspection) return
    const base = inspection.path.endsWith('/') ? inspection.path : `${inspection.path}/`
    const entry = folder.startsWith(base) ? `./${folder.slice(base.length)}` : folder
    setSkills((s) => (s.some((x) => x.path === entry) ? s : [...s, { path: entry, checked: true }]))
  }

  const create = async () => {
    if (!inspection) return
    setBusy(true)
    setError(null)
    const checkedSkills = skills.filter((s) => s.checked).map((s) => s.path)
    const writeConfig =
      inspection.config.exists ||
      mcps.length > 0 ||
      checkedSkills.length > 0 ||
      customInstructions.trim() !== '' ||
      defaultAgent !== 'claude' ||
      !enabled.claude ||
      !enabled.codex
    const config: ProjectConfig = {
      ...inspection.config.config,
      name: name.trim(),
      defaultAgent,
      instructions: customInstructions.trim() || undefined,
      skills: checkedSkills.length ? checkedSkills : undefined,
      mcpServers: mcps.length ? Object.fromEntries(mcps.map((m) => [m.name, m.server])) : undefined,
      agents: Object.fromEntries(
        AGENT_IDS.map((id) => [
          id,
          { ...inspection.config.config.agents?.[id], enabled: enabled[id] },
        ]),
      ),
    }
    try {
      const project = await window.clawos.invoke('projects:create', {
        path: inspection.path,
        name: name.trim(),
        color,
        config,
        secrets: Object.assign({}, ...mcps.map((m) => m.secrets)),
        writeConfig,
      })
      await created(project)
      await useSessionsStore.getState().loadProject(project.id)
      onClose()
      if (openChat) void newSessionInDock(project.id, { agentId: defaultAgent })
    } catch (e) {
      setError(cleanIpcError(e))
      setBusy(false)
    }
  }

  return (
    <Modal title="Novo projeto" onClose={onClose} className="h-[86vh] max-w-3xl">
      <div className="flex h-full min-h-0 flex-col">
        <ol className="flex items-center gap-1 border-b px-4 py-3 text-xs">
          {STEPS.map((s, i) => (
            <li key={s.id} className="flex items-center gap-1">
              <button
                type="button"
                disabled={!inspection && i > 0}
                onClick={() => setStep(s.id)}
                className={cn(
                  'flex items-center gap-1.5 rounded-full px-2.5 py-1 transition-colors disabled:opacity-40',
                  s.id === step
                    ? 'bg-accent font-medium text-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <span
                  className={cn(
                    'flex size-4 items-center justify-center rounded-full border text-[10px]',
                    i < index && 'border-emerald-500 bg-emerald-500 text-white',
                  )}
                >
                  {i < index ? <Check className="size-2.5" /> : i + 1}
                </span>
                {s.label}
              </button>
              {i < STEPS.length - 1 && <span className="text-muted-foreground/40">—</span>}
            </li>
          ))}
        </ol>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {step === 'projeto' && (
            <ProjectStep
              inspection={inspection}
              name={name}
              color={color}
              onChoose={() => void chooseFolder()}
              onName={setName}
              onColor={setColor}
            />
          )}
          {step === 'agentes' && inspection && (
            <AgentsStep
              inspection={inspection}
              defaultAgent={defaultAgent}
              enabled={enabled}
              customInstructions={customInstructions}
              installed={(id) => statuses.find((s) => s.id === id)?.installed ?? false}
              onDefault={(id) => {
                setDefaultAgent(id)
                setEnabled((e) => ({ ...e, [id]: true }))
              }}
              onEnabled={(id, value) => setEnabled((e) => ({ ...e, [id]: value }))}
              onInstructions={setCustomInstructions}
            />
          )}
          {step === 'mcps' && <McpStep mcps={mcps} setMcps={setMcps} />}
          {step === 'skills' && (
            <SkillsStep skills={skills} setSkills={setSkills} onAdd={() => void addSkillFolder()} />
          )}
          {step === 'revisao' && inspection && (
            <ReviewStep
              inspection={inspection}
              name={name}
              color={color}
              defaultAgent={defaultAgent}
              enabled={enabled}
              customInstructions={customInstructions}
              mcps={mcps}
              skills={skills.filter((s) => s.checked).map((s) => s.path)}
              openChat={openChat}
              onOpenChat={setOpenChat}
            />
          )}
        </div>

        <div className="flex items-center gap-3 border-t px-5 py-3">
          {error ? (
            <span
              className="min-w-0 flex-1 truncate text-xs text-red-600 dark:text-red-400"
              title={error}
            >
              {error}
            </span>
          ) : (
            <span className="flex-1 text-xs text-muted-foreground">
              {inspection
                ? `Passo ${index + 1} de ${STEPS.length}`
                : 'Escolha a pasta do projeto para começar.'}
            </span>
          )}
          {index > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setStep(STEPS[index - 1]!.id)}
              disabled={busy}
            >
              <ArrowLeft /> Voltar
            </Button>
          )}
          {step !== 'revisao' ? (
            <Button size="sm" onClick={() => setStep(STEPS[index + 1]!.id)} disabled={!canAdvance}>
              Próximo <ArrowRight />
            </Button>
          ) : (
            <Button size="sm" onClick={() => void create()} disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : <Check />}
              {inspection?.alreadyAdded ? 'Salvar projeto' : 'Criar projeto'}
            </Button>
          )}
        </div>
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------------------

function ProjectStep({
  inspection,
  name,
  color,
  onChoose,
  onName,
  onColor,
}: {
  inspection: FolderInspection | null
  name: string
  color: string
  onChoose: () => void
  onName: (name: string) => void
  onColor: (color: string) => void
}) {
  return (
    <div className="max-w-xl space-y-6">
      <div className="space-y-2">
        <Label>Pasta do projeto</Label>
        {inspection ? (
          <div className="flex items-center gap-3 rounded-md border p-3">
            <FolderOpen className="size-5 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <div className="truncate font-mono text-sm" title={inspection.path}>
                {inspection.path}
              </div>
              <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground">
                {inspection.isGit ? (
                  <span className="flex items-center gap-1">
                    <GitBranch className="size-3" /> repositório git
                  </span>
                ) : (
                  <span>sem git (worktrees indisponíveis)</span>
                )}
                {inspection.config.exists && <span>já tem .clawos/project.yaml</span>}
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={onChoose}>
              Trocar
            </Button>
          </div>
        ) : (
          <button
            type="button"
            onClick={onChoose}
            className="flex w-full flex-col items-center gap-2 rounded-lg border border-dashed p-8 text-sm text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
          >
            <FolderPlus className="size-6" />
            Escolher pasta…
            <span className="text-xs">
              Uma pasta existente com o seu código, ou crie uma nova pelo seletor.
            </span>
          </button>
        )}
        {inspection?.alreadyAdded && (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            Esta pasta já está no Clawos como “{inspection.alreadyAdded.name}”. Salvar vai atualizar
            a configuração dele.
          </p>
        )}
        {inspection?.config.error && (
          <p className="text-xs text-amber-600 dark:text-amber-400">{inspection.config.error}</p>
        )}
      </div>

      {inspection && (
        <>
          <div className="space-y-1.5">
            <Label htmlFor="project-name">Nome</Label>
            <Input
              id="project-name"
              value={name}
              onChange={(e) => onName(e.target.value)}
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label>Cor</Label>
            <div className="flex gap-2">
              {PROJECT_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => onColor(c)}
                  className={cn(
                    'size-6 rounded-full',
                    color === c && 'ring-2 ring-ring ring-offset-2 ring-offset-background',
                  )}
                  style={{ background: c }}
                  title={c}
                />
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function AgentsStep({
  inspection,
  defaultAgent,
  enabled,
  customInstructions,
  installed,
  onDefault,
  onEnabled,
  onInstructions,
}: {
  inspection: FolderInspection
  defaultAgent: AgentId
  enabled: Record<AgentId, boolean>
  customInstructions: string
  installed: (id: AgentId) => boolean
  onDefault: (id: AgentId) => void
  onEnabled: (id: AgentId, value: boolean) => void
  onInstructions: (path: string) => void
}) {
  return (
    <div className="max-w-xl space-y-7">
      <div className="space-y-2">
        <Label>Agentes neste projeto</Label>
        <div className="space-y-2">
          {AGENT_IDS.map((id) => (
            <div key={id} className="flex items-center gap-3 rounded-md border px-3 py-2.5">
              <input
                type="checkbox"
                checked={enabled[id]}
                disabled={id === defaultAgent}
                onChange={(e) => onEnabled(id, e.target.checked)}
                aria-label={`Habilitar ${AGENT_META[id].name}`}
              />
              <AgentIcon agentId={id} className="size-6" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{AGENT_META[id].name}</div>
                <div className="text-xs text-muted-foreground">
                  {installed(id) ? 'instalado' : 'não instalado neste computador'}
                  {id === 'gemini' && ' · requer API key'}
                </div>
              </div>
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <input
                  type="radio"
                  name="default-agent"
                  checked={defaultAgent === id}
                  onChange={() => onDefault(id)}
                />
                padrão
              </label>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Label>Instruções</Label>
        {inspection.instructionFiles.length > 0 ? (
          <p className="flex flex-wrap items-center gap-1.5 text-sm">
            <FileText className="size-4 text-muted-foreground" /> Encontrados na pasta:
            {inspection.instructionFiles.map((f) => (
              <code key={f} className="rounded bg-muted px-1.5 py-0.5 text-xs">
                {f}
              </code>
            ))}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            Nenhum CLAUDE.md, AGENTS.md ou GEMINI.md na pasta.
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          Cada agente lê o seu arquivo nativo automaticamente. Para entregar um mesmo arquivo a
          todos os agentes, informe o caminho:
        </p>
        <Input
          value={customInstructions}
          placeholder="opcional — ex.: ./docs/instrucoes.md"
          className="font-mono"
          onChange={(e) => onInstructions(e.target.value)}
        />
      </div>
    </div>
  )
}

function McpStep({
  mcps,
  setMcps,
}: {
  mcps: ChosenMcp[]
  setMcps: React.Dispatch<React.SetStateAction<ChosenMcp[]>>
}) {
  const [configuring, setConfiguring] = useState<CatalogEntry | null>(null)
  const [values, setValues] = useState<Record<string, string>>({})
  const [custom, setCustom] = useState<McpForm | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const taken = new Set(mcps.map((m) => m.name))

  const addFromCatalog = (entry: CatalogEntry, vals: Record<string, string>) => {
    try {
      const built = buildCatalogEntry(entry, vals)
      setMcps((list) => [...list, { ...built, origin: 'catálogo' }])
      setConfiguring(null)
      setFormError(null)
    } catch (e) {
      setFormError((e as Error).message)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">
          Só estes MCPs ficam disponíveis para as sessões do projeto, em todos os agentes. Tokens
          ficam no cofre do sistema — nunca no project.yaml.
        </p>
      </div>

      {mcps.length > 0 && (
        <div className="space-y-2">
          <Label>Adicionados</Label>
          {mcps.map((m) => (
            <div key={m.name} className="flex items-center gap-3 rounded-md border px-3 py-2">
              <Plug className="size-4 shrink-0 text-muted-foreground" />
              <span className="text-sm font-medium">{m.name}</span>
              <span
                className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground"
                title={summary(m.server)}
              >
                {summary(m.server)}
              </span>
              {Object.keys(m.secrets).length > 0 && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <KeyRound className="size-3" /> token guardado
                </span>
              )}
              <span className="text-[11px] text-muted-foreground">{m.origin}</span>
              <button
                type="button"
                className="rounded p-1 text-muted-foreground hover:bg-accent"
                title="Remover"
                onClick={() => setMcps((list) => list.filter((x) => x.name !== m.name))}
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-2">
        <Label>Catálogo</Label>
        <div className="grid gap-2 sm:grid-cols-2">
          {MCP_CATALOG.map((entry) => {
            const added = taken.has(entry.id)
            return (
              <div
                key={entry.id}
                className={cn(
                  'rounded-md border p-3',
                  configuring?.id === entry.id && 'sm:col-span-2',
                )}
              >
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">{entry.name}</div>
                    <div className="text-xs text-muted-foreground">{entry.description}</div>
                  </div>
                  <Button
                    variant={added ? 'ghost' : 'outline'}
                    size="sm"
                    className="h-7 shrink-0"
                    disabled={added}
                    onClick={() => {
                      setFormError(null)
                      if (entry.fields.length === 0) addFromCatalog(entry, {})
                      else {
                        setConfiguring(entry)
                        setValues(
                          entry.fields.some((f) => f.key === 'readOnly') ? { readOnly: 'sim' } : {},
                        )
                      }
                    }}
                  >
                    {added ? (
                      <>
                        <Check /> Adicionado
                      </>
                    ) : (
                      <>
                        <Plus /> Adicionar
                      </>
                    )}
                  </Button>
                </div>
                {configuring?.id === entry.id && (
                  <div className="mt-3 space-y-3 border-t pt-3">
                    {entry.fields.map((field) =>
                      field.key === 'readOnly' ? (
                        <label key={field.key} className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={values['readOnly'] !== 'não'}
                            onChange={(e) =>
                              setValues((v) => ({
                                ...v,
                                readOnly: e.target.checked ? 'sim' : 'não',
                              }))
                            }
                          />
                          {field.label}
                        </label>
                      ) : (
                        <div key={field.key} className="space-y-1">
                          <Label>
                            {field.label}
                            {field.optional && ' (opcional)'}
                          </Label>
                          <Input
                            type={field.secret ? 'password' : 'text'}
                            value={values[field.key] ?? ''}
                            placeholder={field.placeholder}
                            className="font-mono"
                            onChange={(e) =>
                              setValues((v) => ({ ...v, [field.key]: e.target.value }))
                            }
                          />
                          {field.help && (
                            <p className="text-[11px] text-muted-foreground">{field.help}</p>
                          )}
                        </div>
                      ),
                    )}
                    {formError && <p className="text-xs text-red-600">{formError}</p>}
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" size="sm" onClick={() => setConfiguring(null)}>
                        Cancelar
                      </Button>
                      <Button size="sm" onClick={() => addFromCatalog(entry, values)}>
                        Adicionar {entry.name}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      <div className="space-y-2">
        <Label>Personalizado</Label>
        {custom ? (
          <McpEditor
            form={custom}
            error={formError}
            onChange={setCustom}
            onCancel={() => {
              setCustom(null)
              setFormError(null)
            }}
            onSubmit={() => {
              try {
                const [mcpName, server] = fromForm(custom)
                if (taken.has(mcpName)) throw new Error(`Já existe um MCP chamado "${mcpName}".`)
                setMcps((list) => [
                  ...list,
                  { name: mcpName, server, secrets: {}, origin: 'personalizado' },
                ])
                setCustom(null)
                setFormError(null)
              } catch (e) {
                setFormError((e as Error).message)
              }
            }}
          />
        ) : (
          <Button variant="outline" size="sm" onClick={() => setCustom(emptyMcpForm)}>
            <Plus /> MCP personalizado
          </Button>
        )}
      </div>
    </div>
  )
}

function SkillsStep({
  skills,
  setSkills,
  onAdd,
}: {
  skills: SkillChoice[]
  setSkills: React.Dispatch<React.SetStateAction<SkillChoice[]>>
  onAdd: () => void
}) {
  return (
    <div className="max-w-xl space-y-4">
      <p className="text-sm text-muted-foreground">
        Skills são pastas com um <code>SKILL.md</code>. As marcadas ficam disponíveis para os
        agentes deste projeto.
      </p>
      {skills.length === 0 && (
        <p className="text-sm text-muted-foreground">Nenhuma skill encontrada na pasta.</p>
      )}
      {skills.map((skill) => (
        <label key={skill.path} className="flex items-center gap-3 rounded-md border px-3 py-2.5">
          <input
            type="checkbox"
            checked={skill.checked}
            onChange={(e) =>
              setSkills((list) =>
                list.map((s) => (s.path === skill.path ? { ...s, checked: e.target.checked } : s)),
              )
            }
          />
          <Sparkles className="size-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate font-mono text-xs">{skill.path}</span>
          {skill.path.startsWith('./.claude/') && (
            <span className="text-[11px] text-muted-foreground">
              já lida pelo Claude; marque para o Codex
            </span>
          )}
        </label>
      ))}
      <Button variant="outline" size="sm" onClick={onAdd}>
        <FolderPlus /> Adicionar pasta de skill
      </Button>
      <p className="text-xs text-muted-foreground">
        Dica: skills em <code>.agents/skills/</code> são lidas por Claude, Codex e Gemini.
      </p>
    </div>
  )
}

function ReviewStep({
  inspection,
  name,
  color,
  defaultAgent,
  enabled,
  customInstructions,
  mcps,
  skills,
  openChat,
  onOpenChat,
}: {
  inspection: FolderInspection
  name: string
  color: string
  defaultAgent: AgentId
  enabled: Record<AgentId, boolean>
  customInstructions: string
  mcps: ChosenMcp[]
  skills: string[]
  openChat: boolean
  onOpenChat: (value: boolean) => void
}) {
  const row = 'flex gap-4 border-b py-3 text-sm last:border-0'
  const key = 'w-32 shrink-0 text-muted-foreground'
  const secretCount = mcps.reduce((n, m) => n + Object.keys(m.secrets).length, 0)
  return (
    <div className="max-w-xl">
      <div className="rounded-md border px-4">
        <div className={row}>
          <span className={key}>Projeto</span>
          <span className="flex min-w-0 items-center gap-2">
            <span className="size-2.5 shrink-0 rounded-full" style={{ background: color }} />
            <span className="font-medium">{name}</span>
          </span>
        </div>
        <div className={row}>
          <span className={key}>Pasta</span>
          <span className="min-w-0 truncate font-mono text-xs">{inspection.path}</span>
        </div>
        <div className={row}>
          <span className={key}>Agentes</span>
          <span>
            {AGENT_IDS.filter((id) => enabled[id])
              .map((id) => AGENT_META[id].name + (id === defaultAgent ? ' (padrão)' : ''))
              .join(', ')}
          </span>
        </div>
        <div className={row}>
          <span className={key}>Instruções</span>
          <span>{customInstructions || 'arquivos nativos de cada agente'}</span>
        </div>
        <div className={row}>
          <span className={key}>MCPs</span>
          <span>{mcps.length ? mcps.map((m) => m.name).join(', ') : 'nenhum'}</span>
        </div>
        <div className={row}>
          <span className={key}>Skills</span>
          <span className="min-w-0">
            {skills.length ? skills.map((s) => s.split('/').pop()).join(', ') : 'nenhuma'}
          </span>
        </div>
        {secretCount > 0 && (
          <div className={row}>
            <span className={key}>Segredos</span>
            <span>{secretCount} token(s) no cofre do sistema</span>
          </div>
        )}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        A configuração é salva em <code>.clawos/project.yaml</code> dentro da pasta — versionável no
        git, sem os tokens.
      </p>
      <label className="mt-5 flex items-center gap-2 text-sm">
        <input type="checkbox" checked={openChat} onChange={(e) => onOpenChat(e.target.checked)} />
        Abrir uma conversa com o {AGENT_META[defaultAgent].name} ao criar
      </label>
    </div>
  )
}
