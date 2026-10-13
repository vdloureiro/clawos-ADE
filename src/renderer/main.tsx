import { StrictMode, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/App'
import { PairingScreen } from './components/remote/PairingScreen'
import { installWebClient, remoteSession } from './lib/webClient'
import './styles.css'

const render = (node: ReactNode) =>
  createRoot(document.getElementById('root')!).render(<StrictMode>{node}</StrictMode>)

async function boot(): Promise<void> {
  // No app desktop a ponte do Electron já existe. No navegador (acesso remoto), o
  // aparelho precisa estar pareado antes de abrir a interface.
  if (!window.clawos) {
    const session = await remoteSession().catch(() => ({ paired: false }))
    if (!session.paired) return render(<PairingScreen />)
    if (location.search.includes('pair=')) history.replaceState(null, '', '/')
    installWebClient()
  }
  render(<App />)
}

void boot()
