import { useEffect, useRef, useState, type ReactNode } from 'react'
import { LayoutGrid, Plus, Save, Trash2 } from 'lucide-react'
import type { LayoutPreset, Project } from '@shared/types'
import { Button } from '@/components/ui/button'
import {
  applyBuiltInPreset,
  applySavedPreset,
  BUILT_IN_PRESETS,
  currentLayoutJson,
  newSessionInDock,
} from '@/lib/dock'
import { AgentIcon } from '@/components/agents/AgentIcon'
import { useAgentsStore } from '@/stores/agents'

/** Botão com menu suspenso que fecha ao clicar fora. */
function Popover({
  trigger,
  children,
}: {
  trigger: (toggle: () => void) => ReactNode
  children: (close: () => void) => ReactNode
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [open])
  return (
    <div className="relative" ref={ref}>
      {trigger(() => setOpen(!open))}
      {open && children(() => setOpen(false))}
    </div>
  )
}

const menu =
  'absolute top-full right-0 z-40 mt-1 w-64 rounded-md border bg-popover p-1 text-popover-foreground shadow-lg'
const item =
  'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-accent disabled:opacity-40 disabled:hover:bg-transparent'

/** Barra do workspace: projeto atual, "+ Agente" e layouts. */
export function WorkspaceToolbar({ project }: { project: Project }) {
  const agents = useAgentsStore((s) => s.statuses)
  const [presets, setPresets] = useState<LayoutPreset[]>([])
  const [mode, setMode] = useState<'shared' | 'worktree'>('shared')
  const [disabled, setDisabled] = useState<string[]>([])

  // Agentes desligados no project.yaml não aparecem para este projeto.
  const refreshEnabled = async () => {
    const { config } = await window.clawos.invoke('projects:getConfig', project.id)
    setDisabled(
      Object.entries(config.agents ?? {})
        .filter(([, a]) => a.enabled === false)
        .map(([id]) => id),
    )
  }

  const refreshPresets = async () => setPresets(await window.clawos.invoke('presets:list'))

  const savePreset = async () => {
    const json = currentLayoutJson(project.id)
    const name = json && prompt('Nome do preset de layout:')
    if (!json || !name) return
    await window.clawos.invoke('presets:save', name, json)
    await refreshPresets()
  }

  return (
    <div className="flex items-center gap-2 [-webkit-app-region:no-drag]">
      <Popover
        trigger={(toggle) => (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              void refreshPresets()
              toggle()
            }}
          >
            <LayoutGrid /> Layout
          </Button>
        )}
      >
        {(close) => (
          <div className={menu}>
            {BUILT_IN_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className={item}
                onClick={() => {
                  applyBuiltInPreset(project.id, preset.id)
                  close()
                }}
              >
                {preset.name}
              </button>
            ))}
            {presets.length > 0 && <div className="my-1 border-t" />}
            {presets.map((preset) => (
              <div key={preset.id} className="flex items-center">
                <button
                  type="button"
                  className={item}
                  onClick={() => {
                    applySavedPreset(project.id, preset.json)
                    close()
                  }}
                >
                  {preset.name}
                </button>
                <button
                  type="button"
                  className="rounded p-1 text-muted-foreground hover:bg-accent"
                  title="Apagar preset"
                  onClick={async () => {
                    await window.clawos.invoke('presets:delete', preset.id)
                    await refreshPresets()
                  }}
                >
                  <Trash2 className="size-3" />
                </button>
              </div>
            ))}
            <div className="my-1 border-t" />
            <button
              type="button"
              className={item}
              onClick={() => {
                close()
                void savePreset()
              }}
            >
              <Save className="size-3" /> Salvar layout atual como preset…
            </button>
          </div>
        )}
      </Popover>

      <Popover
        trigger={(toggle) => (
          <Button
            size="sm"
            onClick={() => {
              void refreshEnabled()
              toggle()
            }}
          >
            <Plus /> Agente
          </Button>
        )}
      >
        {(close) => (
          <div className={menu}>
            <div className="px-2 py-1 text-[11px] text-muted-foreground">Modo</div>
            <div className="flex gap-1 px-2 pb-2">
              <button
                type="button"
                className={`flex-1 rounded border px-2 py-1 text-xs ${mode === 'shared' ? 'bg-accent' : ''}`}
                onClick={() => setMode('shared')}
              >
                Mesma pasta
              </button>
              <button
                type="button"
                title="Branch e pasta próprias: o agente não interfere nas outras sessões"
                className={`flex-1 rounded border px-2 py-1 text-xs ${mode === 'worktree' ? 'bg-accent' : ''}`}
                onClick={() => setMode('worktree')}
              >
                Worktree isolada
              </button>
            </div>
            <div className="px-2 py-1 text-[11px] text-muted-foreground">Agente</div>
            {agents
              .filter((agent) => !disabled.includes(agent.id))
              .map((agent) => {
                const ready = agent.installed && agent.loggedIn !== false
                return (
                  <button
                    key={agent.id}
                    type="button"
                    className={item}
                    disabled={!ready}
                    onClick={() => {
                      void newSessionInDock(project.id, { agentId: agent.id, mode })
                      close()
                    }}
                  >
                    <AgentIcon agentId={agent.id} className="size-5 text-[10px]" />
                    {agent.name}
                    {agent.id === project.defaultAgent && (
                      <span className="text-muted-foreground">(padrão)</span>
                    )}
                    {!ready && (
                      <span className="ml-auto text-muted-foreground">
                        {agent.installed ? 'não logado' : 'não instalado'}
                      </span>
                    )}
                  </button>
                )
              })}
          </div>
        )}
      </Popover>
    </div>
  )
}
