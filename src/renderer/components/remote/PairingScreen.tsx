import { useState } from 'react'
import { Loader2, Smartphone } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { pairDevice } from '@/lib/webClient'
import logo from '../../../../resources/icon.svg?url'

/** Nome sugerido para o aparelho, a partir do navegador. */
function guessDeviceName(): string {
  const ua = navigator.userAgent
  if (/iPad/.test(ua)) return 'iPad'
  if (/iPhone/.test(ua)) return 'iPhone'
  if (/Android/.test(ua)) return /Mobile/.test(ua) ? 'Celular Android' : 'Tablet Android'
  if (/Macintosh/.test(ua)) return 'Mac (navegador)'
  if (/Windows/.test(ua)) return 'PC Windows'
  return 'Navegador'
}

/**
 * Tela do navegador antes do pareamento. O código vem no link do QR code mostrado no
 * Clawos do computador (Configurações → Acesso remoto) e vale uma vez, por 10 minutos.
 */
export function PairingScreen() {
  const code = new URLSearchParams(location.search).get('pair')
  const [name, setName] = useState(guessDeviceName)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const connect = async () => {
    if (!code) return
    setBusy(true)
    setError(null)
    try {
      await pairDevice(code, name)
      history.replaceState(null, '', '/')
      location.reload()
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-full items-center justify-center bg-background p-6 text-foreground">
      <div className="w-full max-w-sm space-y-5 text-center">
        <img src={logo} alt="" className="mx-auto size-14 rounded-2xl" />
        <div>
          <h1 className="text-lg font-semibold">Conectar ao Clawos</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Acesse suas conversas e projetos que estão no seu computador.
          </p>
        </div>
        {code ? (
          <div className="space-y-3 text-left">
            <label className="block space-y-1">
              <span className="text-xs text-muted-foreground">Nome deste aparelho</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring/40"
              />
            </label>
            <Button className="h-10 w-full" onClick={() => void connect()} disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : <Smartphone />} Conectar este aparelho
            </Button>
            {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          </div>
        ) : (
          <div className="rounded-lg border bg-card p-4 text-left text-sm text-muted-foreground">
            No computador, abra o Clawos e vá em{' '}
            <b className="text-foreground">Configurações → Acesso remoto</b>. Aponte a câmera deste
            aparelho para o QR code que aparece lá.
          </div>
        )}
        <p className="text-[11px] text-muted-foreground">
          Cada aparelho conectado aparece no Clawos do computador, onde pode ser desconectado a
          qualquer momento.
        </p>
      </div>
    </div>
  )
}
