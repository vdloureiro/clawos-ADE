import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  FolderPlus,
  KeyRound,
  Loader2,
  Pencil,
  Plug,
  Plus,
  Trash2,
  XCircle,
} from 'lucide-react'
import type { McpTestResult, ProjectConfigResult } from '@shared/ipc'
import { isRemoteMcp, secretRefs, type McpServerConfig, type ProjectConfig } from '@shared/project'
import { AGENT_IDS, AGENT_META } from '@shared/agents'
import type { AgentId, Project } from '@shared/types'
import { AgentIcon } from '@/components/agents/AgentIcon'
import { Button } from '@/components/ui/button'
import { Input, Label, Textarea } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import { emptyMcpForm, fromForm, toForm, type McpForm } from '@/lib/mcpForm'
import { cn } from '@/lib/utils'
import { useProjectsStore } from '@/stores/projects'

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
  const [tab, setTab] = useState<Tab>('geral')
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
            <SkillsTab project={project} draft={draft} setDraft={setDraft} />
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
  const [tests, setTests] = useState<Record<string, McpTestResult | 'loading'>>({})
  const servers = Object.entries(draft.mcpServers ?? {})

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

  const test = async (name: string) => {
    // O teste usa o project.yaml salvo; salva antes se houver alterações.
    if (dirty && !(await save())) return
    setTests((t) => ({ ...t, [name]: 'loading' }))
    const result = await window.clawos.invoke('projects:testMcp', projectId, name)
    setTests((t) => ({ ...t, [name]: result }))
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Só estes MCPs ficam disponíveis para as sessões deste projeto. Use{' '}
        <code>{'${secret:nome}'}</code> para valores sensíveis.
      </p>
      {servers.length === 0 && !editing && (
        <p className="text-sm text-muted-foreground">Nenhum MCP configurado.</p>
      )}
      {servers.map(([name, server]) => (
        <McpRow
          key={name}
          name={name}
          server={server}
          test={tests[name]}
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
          <Plus /> Adicionar MCP
        </Button>
      )}
    </div>
  )
}

function McpRow({
  name,
  server,
  test,
  onTest,
  onEdit,
  onRemove,
}: {
  name: string
  server: McpServerConfig
  test: McpTestResult | 'loading' | undefined
  onTest: () => void
  onEdit: () => void
  onRemove: () => void
}) {
  const summary = isRemoteMcp(server)
    ? `${server.type} ${server.url}`
    : [server.command, ...(server.args ?? [])].join(' ')
  return (
    <div className="rounded-md border p-3">
      <div className="flex items-center gap-2">
        <Plug className="size-4 text-muted-foreground" />
        <span className="font-medium">{name}</span>
        <span
          className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground"
          title={summary}
        >
          {summary}
        </span>
        <Button
          variant="outline"
          size="sm"
          className="h-7"
          onClick={onTest}
          disabled={test === 'loading'}
        >
          {test === 'loading' ? <Loader2 className="animate-spin" /> : null} Testar
        </Button>
        <Button variant="ghost" size="icon" className="size-7" onClick={onEdit} title="Editar">
          <Pencil className="size-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="size-7" onClick={onRemove} title="Remover">
          <Trash2 className="size-3.5" />
        </Button>
      </div>
      {test && test !== 'loading' && (
        <div
          className={cn(
            'mt-2 flex gap-2 text-xs',
            test.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400',
          )}
        >
          {test.ok ? (
            <CheckCircle2 className="size-4 shrink-0" />
          ) : (
            <XCircle className="size-4 shrink-0" />
          )}
          <span className="select-text">
            {test.ok
              ? `Conectado — ${test.tools.length} ferramenta(s): ${test.tools.join(', ') || '(nenhuma)'}`
              : test.error}
          </span>
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

function SkillsTab({ project, draft, setDraft }: DraftProps & { project: Project }) {
  const skills = draft.skills ?? []

  const addSkill = async () => {
    const folder = await window.clawos.invoke('dialog:pickFolder', 'Pasta da skill (com SKILL.md)')
    if (!folder) return
    const base = project.path.endsWith('/') ? project.path : `${project.path}/`
    const entry = folder.startsWith(base) ? `./${folder.slice(base.length)}` : folder
    setDraft((c) => ({ ...c, skills: [...(c.skills ?? []).filter((s) => s !== entry), entry] }))
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Pastas com <code>SKILL.md</code>. O Clawos as expõe ao agente a partir de um diretório
        gerado fora do repositório.
      </p>
      {skills.length === 0 && (
        <p className="text-sm text-muted-foreground">Nenhuma skill configurada.</p>
      )}
      {skills.map((skill) => (
        <div key={skill} className="flex items-center gap-2 rounded-md border px-3 py-2">
          <span className="min-w-0 flex-1 truncate font-mono text-xs">{skill}</span>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            title="Remover"
            onClick={() =>
              setDraft((c) => {
                const next = (c.skills ?? []).filter((s) => s !== skill)
                return { ...c, skills: next.length ? next : undefined }
              })
            }
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      ))}
      <Button variant="outline" size="sm" onClick={() => void addSkill()}>
        <FolderPlus /> Adicionar pasta
      </Button>
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
