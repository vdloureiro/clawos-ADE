import { Moon, Sun } from 'lucide-react'
import { AgentStatusList } from '@/components/agents/AgentStatusList'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { useThemeStore } from '@/stores/theme'

export function GlobalSettings({ onClose }: { onClose: () => void }) {
  const { theme, toggle } = useThemeStore()
  return (
    <Modal title="Configurações" onClose={onClose} className="max-w-md">
      <div className="space-y-5 p-4">
        <AgentStatusList />
        <div className="flex items-center justify-between px-3">
          <span className="text-sm">Tema</span>
          <Button variant="outline" size="sm" onClick={toggle}>
            {theme === 'dark' ? <Moon /> : <Sun />} {theme === 'dark' ? 'Escuro' : 'Claro'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
