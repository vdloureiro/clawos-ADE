import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, FolderPlus, KeyRound, Loader2, Pencil, Plus, Trash2 } from 'lucide-react'
import type { McpTestResult, ProjectConfigResult } from '@shared/ipc'
import type { CatalogSelection } from '@shared/mcpCatalog'
import { SKILL_CATALOG, skillInstallPath } from '@shared/skillCatalog'
import { DEFAULT_LANGUAGE, LANGUAGE_OPTIONS, type ResponseLanguage } from '@shared/language'
import { isRemoteMcp, secretRefs, type McpServerConfig, type ProjectConfig } from '@shared/project'
import { AGENT_IDS, AGENT_META } from '@shared/agents'
import type { AgentId, Project, PermissionDefault } from '@shared/types'
import { AgentIcon } from '@/components/agents/AgentIcon'
import { Button } from '@/components/ui/button'
import { Input, Label, Textarea } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import { emptyMcpForm, fromForm, toForm, type McpForm } from '@/lib/mcpForm'
import { pickFolder } from '@/lib/platform'
import {
  McpCatalogGrid,
  McpStatusBadge,
  runMcpTest,
  type McpStatus,
} from '@/components/mcp/McpCatalogGrid'
import { McpIcon } from '@/components/mcp/McpIcon'
import { SkillCatalogGrid } from '@/components/skills/SkillCatalogGrid'
import { cachedMcpStatus, mcpStatusOnOpen, storeMcpStatus } from '@/lib/mcpStatusCache'
import { cn } from '@/lib/utils'
import { useProjectsStore } from '@/stores/projects'
import { useUiStore } from '@/stores/ui'

type Tab = 'geral' | 'mcps' | 'skills' | 'segredos'

const TABS: { id: Tab; label: string }[] = [
  { id: 'geral', label: 'Geral' },
  { id: 'mcps', label: 'MCPs' },
  { id: 'skills', label: 'Skills' },
  { id: 'segredos', label: 'Segredos' },
]

/** Editor visual de `.clawos/project.yaml` + segredos do projeto. */
export function ProjectSettings({
  projectId,
  onClose,
}: {
  projectId: string
  onClose: () => void
}) {
  const project = useProjectsStore((s) => s.projects.find((p) => p.id === projectId))
  const [tab, setTab] = useState<Tab>(() => useUiStore.getState().settingsTab)
  const [loaded, setLoaded] = useState<ProjectConfigResult | null>(null)
  const [draft, setDraft] = useState<ProjectConfig>({})
  const [secrets, setSecrets] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchAll = useCallback(
    () =>
      Promise.all([
        window.clawos.invoke('projects:getConfig', projectId),
        window.clawos.invoke('secrets:list', projectId),
      ]),
    [projectId],
  )

  const apply = ([result, names]: [ProjectConfigResult, string[]]) => {
    setLoaded(result)
    setDraft(result.config)
    setSecrets(names)
  }

  const reload = useCallback(async () => apply(await fetchAll()), [fetchAll])

  useEffect(() => {
    let cancelled = false
    void fetchAll().then((data) => {
      if (!cancelled) apply(data)
    })
    return () => {
      cancelled = true
    }
  }, [fetchAll])

  const dirty = loaded !== null && JSON.stringify(loaded.config) !== JSON.stringify(draft)

  const save = async (config = draft) => {
    setSaving(true)
    setError(null)
    try {
      await window.clawos.invoke('projects:saveConfig', projectId, config)
      await reload()
      return true
    } catch (e) {
      setError(
        (e as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''),
      )
      return false
    } finally {
      setSaving(false)
    }
  }

  if (!project) return null

  return (
    <Modal
      title={`Configurações — ${project.name}`}
      onClose={onClose}
      className="h-[80vh] max-w-3xl"
    >
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex gap-1 border-b px-3">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                '-mb-px border-b-2 px-3 py-2 text-sm',
                tab === t.id
                  ? 'border-foreground font-medium'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {loaded?.error && (
            <div className="mb-3 flex gap-2 rounded-md border border-amber-500/50 bg-amber-500/5 p-2 text-xs">
              <AlertTriangle className="size-4 shrink-0 text-amber-500" />
              <span>{loaded.error}. Salvar aqui substituirá o arquivo.</span>
            </div>
          )}
          {!loaded ? (
            <Loader2 className="size-4 animate-spin" />
          ) : tab === 'geral' ? (
            <GeneralTab project={project} draft={draft} setDraft={setDraft} />
          ) : tab === 'mcps' ? (
            <McpTab
              projectId={projectId}
              draft={draft}
              setDraft={setDraft}
              dirty={dirty}
              save={save}
            />
          ) : tab === 'skills' ? (
            <SkillsTab project={project} draft={draft} setDraft={setDraft} save={save} />
          ) : (
            <SecretsTab projectId={projectId} draft={draft} secrets={secrets} onChange={reload} />
          )}
        </div>

        <div className="flex items-center gap-3 border-t px-4 py-2.5">
          <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted-foreground">
            {project.path}/.clawos/project.yaml
          </span>
          {error && <span className="truncate text-xs text-red-600">{error}</span>}
          <Button
            variant="outline"
            size="sm"
            disabled={!dirty || saving}
            onClick={() => loaded && setDraft(loaded.config)}
          >
            Descartar
          </Button>
          <Button size="sm" disabled={!dirty || saving} onClick={() => void save()}>
            {saving && <Loader2 className="animate-spin" />} Salvar
          </Button>
        </div>
      </div>
    </Modal>
  )
}

type SetDraft = (fn: (c: ProjectConfig) => ProjectConfig) => void
interface DraftProps {
  draft: ProjectConfig
  setDraft: React.Dispatch<React.SetStateAction<ProjectConfig>>
}

// ---------------------------------------------------------------------------

function GeneralTab({ project, draft, setDraft }: DraftProps & { project: Project }) {
  const update: SetDraft = (fn) => setDraft(fn)
  const settingsOf = (id: AgentId) => draft.agents?.[id] ?? {}
  const setAgent = (id: AgentId, patch: Record<string, boolean>) =>
    update((c) => ({ ...c, agents: { ...c.agents, [id]: { ...c.agents?.[id], ...patch } } }))

  return (
    <div className="max-w-lg space-y-4">
      <div className="space-y-1">
        <Label>Nome no project.yaml</Label>
        <Input
          value={draft.name ?? ''}
          placeholder={project.name}
          onChange={(e) => update((c) => ({ ...c, name: e.target.value || undefined }))}
        />
      </div>
      <div className="space-y-1">
        <Label>Permissão padrão das conversas</Label>
        <select
          className="h-8 w-full rounded-md border bg-background px-2 text-sm"
          value={project.permissionDefault ?? ''}
          onChange={(e) =>
            void useProjectsStore.getState().update(project.id, {
              permissionDefault: (e.target.value || null) as PermissionDefault | null,
            })
          }
        >
          <option value="auto">Automático — não pede autorização</option>
          <option value="ask">Pedir autorização antes de agir</option>
          <option value="">Seguir a última escolha feita no chat</option>
        </select>
        <p className="text-[11px] text-muted-foreground">
          Vale para conversas novas (salva na hora). Cada conversa pode trocar pela barra do chat.
        </p>
      </div>
      <div className="space-y-1">
        <Label>Idioma das respostas</Label>
        <select
          className="h-8 w-full rounded-md border bg-background px-2 text-sm"
          value={draft.language ?? DEFAULT_LANGUAGE}
          onChange={(e) =>
            update((c) => ({
              ...c,
              language:
                e.target.value === DEFAULT_LANGUAGE
                  ? undefined
                  : (e.target.value as ResponseLanguage),
            }))
          }
        >
          {LANGUAGE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <p className="text-[11px] text-muted-foreground">
          Instrução de sistema para todos os agentes do projeto. Vale para conversas novas e para as
          que forem reabertas.
        </p>
      </div>
      <div className="space-y-1">
        <Label>Agente padrão</Label>
        <select
          className="h-8 w-full rounded-md border bg-background px-2 text-sm"
          value={draft.defaultAgent ?? project.defaultAgent}
          onChange={(e) => update((c) => ({ ...c, defaultAgent: e.target.value as AgentId }))}
        >
          {AGENT_IDS.map((id) => (
            <option key={id} value={id}>
              {AGENT_META[id].name}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1">
        <Label>Instruções</Label>
        <Input
          value={draft.instructions ?? ''}
          placeholder="./CLAUDE.md"
          onChange={(e) => update((c) => ({ ...c, instructions: e.target.value || undefined }))}
        />
        <p className="text-[11px] text-muted-foreground">
          Cada agente lê o seu arquivo nativo (CLAUDE.md, AGENTS.md, GEMINI.md). Um arquivo
          diferente é entregue a todos os agentes do projeto.
        </p>
      </div>
      <div className="space-y-2">
        <Label>Agentes neste projeto</Label>
        {AGENT_IDS.map((id) => (
          <label key={id} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={settingsOf(id).enabled !== false}
              onChange={(e) => setAgent(id, { enabled: e.target.checked })}
            />
            <AgentIcon agentId={id} className="size-5 text-[10px]" />
            {AGENT_META[id].name}
          </label>
        ))}
      </div>
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="mt-1"
          checked={settingsOf('claude').inheritUserConfig === true}
          onChange={(e) => setAgent('claude', { inheritUserConfig: e.target.checked })}
        />
        <span>
          Claude: usar também minha configuração global
          <span className="block text-[11px] text-muted-foreground">
            Carrega ~/.claude (CLAUDE.md, skills e permissões globais). Desligado, o projeto fica
            isolado. MCPs globais nunca são carregados em nenhum agente.
          </span>
        </span>
      </label>
    </div>
  )
}

// ---------------------------------------------------------------------------

function McpTab({
  projectId,
  draft,
  setDraft,
  dirty,
  save,
}: DraftProps & {
  projectId: string
  dirty: boolean
  save: (c?: ProjectConfig) => Promise<boolean>
}) {
  const [editing, setEditing] = useState<{ original: string | null; form: McpForm } | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const servers = Object.entries(draft.mcpServers ?? {})
  // Abre com o último resultado conhecido (✓ Conectado), sem testar tudo de novo.
  const [tests, setTests] = useState<Record<string, McpStatus>>(() =>
    Object.fromEntries(
      servers.flatMap(([name, server]) => {
        const entry = cachedMcpStatus(projectId, name, server)
        return entry ? [[name, entry.status]] : []
      }),
    ),
  )
  /** Resultado completo (lista de ferramentas) para a linha do MCP. */
  const [results, setResults] = useState<Record<string, McpTestResult>>(() =>
    Object.fromEntries(
      servers.flatMap(([name, server]) => {
        const result = cachedMcpStatus(projectId, name, server)?.result
        return result ? [[name, result]] : []
      }),
    ),
  )

  const commit = () => {
    if (!editing) return
    try {
      const [name, server] = fromForm(editing.form)
      setDraft((c) => {
        const next = { ...c.mcpServers }
        if (editing.original && editing.original !== name) delete next[editing.original]
        next[name] = server
        return { ...c, mcpServers: next }
      })
      setEditing(null)
      setFormError(null)
    } catch (e) {
      setFormError((e as Error).message)
    }
  }

  const removeServer = (name: string) =>
    setDraft((c) => {
      const next = { ...c.mcpServers }
      delete next[name]
      return { ...c, mcpServers: Object.keys(next).length ? next : undefined }
    })

  /** `silent`: confere em segundo plano, mantendo o selo atual até o resultado chegar. */
  const test = async (name: string, silent = false, server = draft.mcpServers?.[name]) => {
    // O teste usa o project.yaml salvo; salva antes se houver alterações.
    if (dirty && !(await save())) return
    if (!silent) setTests((t) => ({ ...t, [name]: { state: 'testing', since: Date.now() } }))
    let full: McpTestResult | undefined
    const next = await runMcpTest(async () => {
      full = await window.clawos.invoke('projects:testMcp', projectId, name)
      setResults((r) => ({ ...r, [name]: full! }))
      return full
    })
    storeMcpStatus(projectId, name, server, next, full)
    setTests((t) => ({ ...t, [name]: next }))
  }

  // MCPs de todos os projetos (Configurações do Clawos) e se valem aqui.
  const [shared, setShared] = useState<{ name: string; enabled: boolean }[]>([])
  useEffect(() => {
    void window.clawos.invoke('projects:sharedMcps', projectId).then(setShared)
  }, [projectId])

  // Ao abrir a aba: mostra o último resultado e só testa o que nunca conectou, falhou ou
  // está há muito tempo sem conferir (esse em segundo plano).
  useEffect(() => {
    const timer = setTimeout(() => {
      const now = Date.now()
      for (const [name, server] of servers) {
        const { retest, silent } = mcpStatusOnOpen(projectId, name, server, now)
        if (retest) void test(name, silent, server)
      }
    }, 0)
    return () => clearTimeout(timer)
    // Só na abertura da aba.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const toStatus = (name: string): McpStatus => tests[name] ?? { state: 'idle' }

  /** Adiciona do catálogo: grava no project.yaml, guarda os tokens e testa. */
  const addFromCatalog = async (selection: CatalogSelection) => {
    const next = {
      ...draft,
      mcpServers: { ...draft.mcpServers, [selection.name]: selection.server },
    }
    setDraft(() => next)
    for (const [name, value] of Object.entries(selection.secrets))
      await window.clawos.invoke('secrets:set', projectId, name, value)
    if (await save(next)) await test(selection.name, false, selection.server)
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Só estes MCPs ficam disponíveis para as sessões deste projeto. Use{' '}
        <code>{'${secret:nome}'}</code> para valores sensíveis.
      </p>
      {shared.length > 0 && (
        <div className="space-y-1.5 rounded-md border bg-muted/20 p-3">
          <div className="text-xs font-medium">De todos os projetos</div>
          {shared.map((m) => (
            <label key={m.name} className="flex items-center gap-2.5 text-sm">
              <McpIcon id={m.name} className="size-6" />
              <span className="flex-1">{m.name}</span>
              <span className="text-[11px] text-muted-foreground">
                {m.enabled ? 'ativo neste projeto' : 'desligado neste projeto'}
              </span>
              <input
                type="checkbox"
                checked={m.enabled}
                onChange={(e) => {
                  const enabled = e.target.checked
                  setShared((list) => list.map((x) => (x.name === m.name ? { ...x, enabled } : x)))
                  void window.clawos.invoke('projects:setSharedMcp', projectId, m.name, enabled)
                }}
              />
            </label>
          ))}
        </div>
      )}
      {servers.length === 0 && !editing && (
        <p className="text-sm text-muted-foreground">Nenhum MCP configurado.</p>
      )}
      {servers.map(([name, server]) => (
        <McpRow
          key={name}
          name={name}
          server={server}
          status={tests[name]}
          result={results[name]}
          onTest={() => void test(name)}
          onEdit={() => setEditing({ original: name, form: toForm(name, server) })}
          onRemove={() => removeServer(name)}
        />
      ))}
      {editing ? (
        <McpEditor
          form={editing.form}
          error={formError}
          onChange={(form) => setEditing({ ...editing, form })}
          onCancel={() => {
            setEditing(null)
            setFormError(null)
          }}
          onSubmit={commit}
        />
      ) : (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setEditing({ original: null, form: emptyMcpForm })}
        >
          <Plus /> MCP personalizado
        </Button>
      )}
      <div className="space-y-2 pt-2">
        <div className="text-xs font-medium">Catálogo</div>
        <McpCatalogGrid
          added={new Set(servers.map(([name]) => name))}
          globalNames={shared.filter((m) => m.enabled).map((m) => m.name)}
          statusOf={toStatus}
          onAdd={(selection) => addFromCatalog(selection)}
          onRemove={removeServer}
          onRetry={(name) => void test(name)}
        />
      </div>
    </div>
  )
}

function McpRow({
  name,
  server,
  status,
  result,
  onTest,
  onEdit,
  onRemove,
}: {
  name: string
  server: McpServerConfig
  status: McpStatus | undefined
  result: McpTestResult | undefined
  onTest: () => void
  onEdit: () => void
  onRemove: () => void
}) {
  const summary = isRemoteMcp(server)
    ? `${server.type} ${server.url}`
    : [server.command, ...(server.args ?? [])].join(' ')
  const testing = status?.state === 'testing'
  return (
    <div
      className={cn(
        'rounded-md border p-3',
        status?.state === 'ok' && 'border-emerald-500/40 bg-emerald-500/[0.04]',
      )}
    >
      <div className="flex items-center gap-2">
        <McpIcon id={name} className="size-7" />
        <span className="font-medium">{name}</span>
        <span
          className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground"
          title={summary}
        >
          {summary}
        </span>
        <Button variant="outline" size="sm" className="h-7" onClick={onTest} disabled={testing}>
          Testar
        </Button>
        <Button variant="ghost" size="icon" className="size-7" onClick={onEdit} title="Editar">
          <Pencil className="size-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="size-7" onClick={onRemove} title="Remover">
          <Trash2 className="size-3.5" />
        </Button>
      </div>
      {status && status.state !== 'idle' && (
        <div className="mt-2 space-y-1 pl-9">
          <McpStatusBadge status={status} />
          {status.state === 'ok' && result && (
            <p className="text-[11px] text-muted-foreground select-text">
              {result.tools.length} ferramenta(s): {result.tools.join(', ') || '(nenhuma)'}
            </p>
          )}
          {status.state === 'error' && (
            <pre className="max-h-32 overflow-auto rounded bg-red-500/5 p-2 text-[11px] whitespace-pre-wrap text-red-600 select-text dark:text-red-400">
              {status.error}
            </pre>
          )}
        </div>
      )}
    </div>
  )
}

export function McpEditor({
  form,
  error,
  onChange,
  onCancel,
  onSubmit,
}: {
  form: McpForm
  error: string | null
  onChange: (form: McpForm) => void
  onCancel: () => void
  onSubmit: () => void
}) {
  const set = (patch: Partial<McpForm>) => onChange({ ...form, ...patch })
  return (
    <div className="space-y-3 rounded-md border bg-muted/30 p-3">
      <div className="grid grid-cols-[1fr_auto] gap-3">
        <div className="space-y-1">
          <Label>Nome</Label>
          <Input
            value={form.name}
            placeholder="supabase"
            onChange={(e) => set({ name: e.target.value })}
          />
        </div>
        <div className="space-y-1">
          <Label>Tipo</Label>
          <select
            className="h-8 rounded-md border bg-background px-2 text-sm"
            value={form.type}
            onChange={(e) => set({ type: e.target.value as McpForm['type'] })}
          >
            <option value="stdio">stdio (comando local)</option>
            <option value="http">http</option>
            <option value="sse">sse</option>
          </select>
        </div>
      </div>
      {form.type === 'stdio' ? (
        <>
          <div className="space-y-1">
            <Label>Comando</Label>
            <Input
              value={form.command}
              placeholder="npx"
              className="font-mono"
              onChange={(e) => set({ command: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label>Argumentos (um por linha)</Label>
            <Textarea
              rows={3}
              value={form.args}
              placeholder={'-y\n@supabase/mcp-server-supabase'}
              onChange={(e) => set({ args: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label>Variáveis de ambiente (CHAVE=valor, uma por linha)</Label>
            <Textarea
              rows={2}
              value={form.env}
              placeholder={'SUPABASE_ACCESS_TOKEN=${secret:supabase_token}'}
              onChange={(e) => set({ env: e.target.value })}
            />
          </div>
        </>
      ) : (
        <>
          <div className="space-y-1">
            <Label>URL</Label>
            <Input
              value={form.url}
              placeholder="https://exemplo.com/mcp"
              className="font-mono"
              onChange={(e) => set({ url: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label>Headers (Nome: valor, um por linha)</Label>
            <Textarea
              rows={2}
              value={form.headers}
              placeholder={'Authorization: Bearer ${secret:api_token}'}
              onChange={(e) => set({ headers: e.target.value })}
            />
          </div>
        </>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancelar
        </Button>
        <Button size="sm" onClick={onSubmit}>
          OK
        </Button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------

function SkillsTab({
  project,
  draft,
  setDraft,
  save,
}: DraftProps & { project: Project; save: (config: ProjectConfig) => Promise<boolean> }) {
  const skills = draft.skills ?? []
  const fromCatalog = new Set(
    SKILL_CATALOG.map((s) => s.id).filter((id) => skills.includes(skillInstallPath(id))),
  )
  const custom = skills.filter((s) => !SKILL_CATALOG.some((c) => skillInstallPath(c.id) === s))

  /** Atualiza a lista a partir do rascunho mais recente (downloads terminam fora de ordem). */
  const setSkills = (update: (list: string[]) => string[], persist = false) =>
    setDraft((c) => {
      const next = update(c.skills ?? [])
      const config = { ...c, skills: next.length ? next : undefined }
      // Idempotente: salvar a mesma configuração duas vezes não muda nada.
      if (persist) queueMicrotask(() => void save(config))
      return config
    })

  const addSkill = async () => {
    const folder = await pickFolder('Pasta da skill (com SKILL.md)')
    if (!folder) return
    const base = project.path.endsWith('/') ? project.path : `${project.path}/`
    const entry = folder.startsWith(base) ? `./${folder.slice(base.length)}` : folder
    setSkills((list) => [...list.filter((s) => s !== entry), entry])
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Pastas com <code>SKILL.md</code>. O Clawos as expõe ao agente a partir de um diretório
        gerado fora do repositório.
      </p>
      <div className="space-y-2">
        <div className="text-xs font-medium">Suas skills</div>
        {custom.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhuma pasta de skill própria.</p>
        )}
        {custom.map((skill) => (
          <div key={skill} className="flex items-center gap-2 rounded-md border px-3 py-2">
            <span className="min-w-0 flex-1 truncate font-mono text-xs">{skill}</span>
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              title="Remover"
              onClick={() => setSkills((list) => list.filter((s) => s !== skill))}
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        ))}
        <Button variant="outline" size="sm" onClick={() => void addSkill()}>
          <FolderPlus /> Adicionar pasta
        </Button>
      </div>
      <div className="space-y-2 border-t pt-4">
        <div>
          <div className="text-xs font-medium">Skills prontas</div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            De fontes abertas e conhecidas. Ao adicionar, a skill é baixada para{' '}
            <code>.clawos/skills/</code> e já fica disponível para os agentes deste projeto.
          </p>
        </div>
        <SkillCatalogGrid
          projectPath={project.path}
          added={fromCatalog}
          onInstalled={(_, path) =>
            setSkills((list) => [...list.filter((s) => s !== path), path], true)
          }
          onRemove={(id) =>
            setSkills((list) => list.filter((s) => s !== skillInstallPath(id)), true)
          }
        />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------

function SecretsTab({
  projectId,
  draft,
  secrets,
  onChange,
}: {
  projectId: string
  draft: ProjectConfig
  secrets: string[]
  onChange: () => Promise<void>
}) {
  const [name, setName] = useState('')
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)

  const referenced = useMemo(() => {
    const refs = new Set<string>()
    for (const server of Object.values(draft.mcpServers ?? {})) {
      for (const text of [JSON.stringify(server)]) secretRefs(text).forEach((r) => refs.add(r))
    }
    return [...refs]
  }, [draft])
  const missing = referenced.filter((r) => !secrets.includes(r))

  const add = async () => {
    setError(null)
    try {
      await window.clawos.invoke('secrets:set', projectId, name.trim(), value)
      setName('')
      setValue('')
      await onChange()
    } catch (e) {
      setError(
        (e as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''),
      )
    }
  }

  return (
    <div className="max-w-lg space-y-3">
      <p className="text-xs text-muted-foreground">
        Guardados com a criptografia do sistema operacional, só neste computador. Nunca vão para o
        project.yaml nem para o git. Referencie com <code>{'${secret:nome}'}</code>.
      </p>
      {missing.length > 0 && (
        <div className="flex gap-2 rounded-md border border-amber-500/50 bg-amber-500/5 p-2 text-xs">
          <AlertTriangle className="size-4 shrink-0 text-amber-500" />
          Referenciados mas não definidos: {missing.join(', ')}
        </div>
      )}
      {secrets.map((secret) => (
        <div key={secret} className="flex items-center gap-2 rounded-md border px-3 py-2">
          <KeyRound className="size-3.5 text-muted-foreground" />
          <span className="flex-1 font-mono text-sm">{secret}</span>
          <span className="text-xs text-muted-foreground">••••••••</span>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            title="Apagar"
            onClick={async () => {
              await window.clawos.invoke('secrets:delete', projectId, secret)
              await onChange()
            }}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      ))}
      <div className="flex gap-2">
        <Input
          placeholder="nome"
          value={name}
          className="w-40 font-mono"
          onChange={(e) => setName(e.target.value)}
        />
        <Input
          placeholder="valor"
          type="password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <Button size="sm" disabled={!name.trim() || !value} onClick={() => void add()}>
          Salvar
        </Button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}
