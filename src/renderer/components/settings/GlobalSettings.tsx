import type { ThemePreference } from '@/stores/theme'
import { AgentStatusList } from '@/components/agents/AgentStatusList'
import { Modal } from '@/components/ui/modal'
import { RemoteAccessSettings } from '@/components/remote/RemoteAccessSettings'
import { isRemote } from '@/lib/platform'
import { SHORTCUTS } from '@/app/commands'
import { cn } from '@/lib/utils'
import { useThemeStore } from '@/stores/theme'

const THEMES: { id: ThemePreference; label: string }[] = [
  { id: 'system', label: 'Sistema' },
  { id: 'light', label: 'Claro' },
  { id: 'dark', label: 'Escuro' },
]

export function GlobalSettings({ onClose }: { onClose: () => void }) {
  const { preference, setPreference } = useThemeStore()
  const mod = navigator.platform.startsWith('Mac') ? '⌘' : 'Ctrl+'
  return (
    <Modal title="Configurações" onClose={onClose} className="max-w-md">
      <div className="space-y-6 p-4">
        <AgentStatusList />
        {!isRemote() && <RemoteAccessSettings />}
        <div className="space-y-2 px-3">
          <div className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Tema
          </div>
          <div className="flex gap-1">
            {THEMES.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setPreference(t.id)}
                className={cn(
                  'flex-1 rounded-md border px-2 py-1 text-sm',
                  preference === t.id && 'bg-accent font-medium',
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-2 px-3">
          <div className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Atalhos
          </div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
            {SHORTCUTS.map(([keys, label]) => (
              <div key={keys} className="contents">
                <dt className="font-mono text-muted-foreground">{keys.replaceAll('⌘', mod)}</dt>
                <dd>{label}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </Modal>
  )
}
