import { useCallback, useEffect, useState } from 'react'
import QRCode from 'qrcode'
import {
  CheckCircle2,
  ExternalLink,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Trash2,
  TriangleAlert,
} from 'lucide-react'
import type { RemoteStatus } from '@shared/types'
import { Button } from '@/components/ui/button'
import { CopyCommand } from '@/components/ui/copy-button'
import { cleanIpcError } from '@/lib/dock'
import { cn } from '@/lib/utils'

function since(ms: number | null, now: number): string {
  if (!ms) return 'nunca'
  const minutes = Math.round((now - ms) / 60_000)
  if (minutes < 2) return 'agora'
  if (minutes < 60) return `há ${minutes} min`
  const hours = Math.round(minutes / 60)
  return hours < 48 ? `há ${hours} h` : `há ${Math.round(hours / 24)} dias`
}

/**
 * Acesso remoto (só no app desktop): liga o servidor local, publica na rede Tailscale
 * e pareia aparelhos por QR code.
 */
export function RemoteAccessSettings() {
  const [status, setStatus] = useState<RemoteStatus | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [qr, setQr] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())

  const run = useCallback(async (label: string, action: () => Promise<RemoteStatus>) => {
    setBusy(label)
    setError(null)
    try {
      setStatus(await action())
    } catch (e) {
      setError(cleanIpcError(e))
    } finally {
      setBusy(null)
    }
  }, [])

  useEffect(() => {
    void window.clawos.invoke('remote:status').then(setStatus)
    // Atualiza aparelhos conectados e a validade do código enquanto a tela está aberta.
    const timer = setInterval(() => {
      setNow(Date.now())
      void window.clawos.invoke('remote:status').then(setStatus)
    }, 5000)
    return () => clearInterval(timer)
  }, [])

  const pairingUrl = status?.pairing?.url ?? null
  useEffect(() => {
    if (!pairingUrl) return
    let alive = true
    void QRCode.toDataURL(pairingUrl, { margin: 1, width: 220, errorCorrectionLevel: 'M' }).then(
      (url) => alive && setQr(url),
    )
    return () => {
      alive = false
    }
  }, [pairingUrl])

  if (!status)
    return (
      <div className="flex items-center gap-2 px-3 text-xs text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" /> Carregando…
      </div>
    )

  const ts = status.tailscale
  const consentUrl = error?.match(/TAILSCALE_CONSENT (\S+)/)?.[1] ?? null
  const minutesLeft = status.pairing
    ? Math.max(0, Math.ceil((status.pairing.expiresAt - now) / 60_000))
    : 0

  return (
    <div className="space-y-3 px-3">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Acesso remoto
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Use o Clawos deste computador pelo celular, tablet ou outro computador. As conversas e
            os arquivos continuam aqui.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={status.enabled}
          disabled={busy !== null}
          onClick={() =>
            void run('toggle', () => window.clawos.invoke('remote:setEnabled', !status.enabled))
          }
          className={cn(
            'relative mt-1 h-5 w-9 shrink-0 rounded-full transition-colors disabled:opacity-50',
            status.enabled ? 'bg-emerald-500' : 'bg-muted-foreground/30',
          )}
          title={status.enabled ? 'Desligar acesso remoto' : 'Ligar acesso remoto'}
        >
          <span
            className={cn(
              'absolute top-0.5 left-0.5 size-4 rounded-full bg-white shadow transition-transform',
              status.enabled && 'translate-x-4',
            )}
          />
        </button>
      </div>

      {error && consentUrl && (
        <div className="space-y-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs">
          <p className="flex items-start gap-1.5 text-amber-700 dark:text-amber-400">
            <TriangleAlert className="mt-px size-3.5 shrink-0" />
            <span>
              Falta um passo no Tailscale: autorizar o recurso <b>Serve</b> na sua rede (uma única
              vez). Na página que abrir, confirme a ativação — e, se aparecer, ative também os
              certificados HTTPS.
            </span>
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => window.open(consentUrl)}>
              <ExternalLink /> Autorizar no Tailscale
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={busy !== null}
              onClick={() =>
                void run('tailscale', () => window.clawos.invoke('remote:setupTailscale'))
              }
            >
              {busy === 'tailscale' ? <Loader2 className="animate-spin" /> : <RefreshCw />}
              Já autorizei — tentar de novo
            </Button>
          </div>
        </div>
      )}
      {error && !consentUrl && (
        <p className="flex items-start gap-1.5 rounded-md border border-red-500/30 bg-red-500/10 px-2 py-1.5 text-xs text-red-600 dark:text-red-400">
          <TriangleAlert className="mt-px size-3.5 shrink-0" /> {error}
        </p>
      )}
      {status.error && (
        <p className="rounded-md border border-red-500/30 bg-red-500/10 px-2 py-1.5 text-xs text-red-600 dark:text-red-400">
          {status.error}
        </p>
      )}

      {status.enabled && (
        <>
          {/* 1. Rede */}
          <div className="space-y-2 rounded-lg border p-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <span className="flex size-5 items-center justify-center rounded-full bg-muted text-[11px]">
                1
              </span>
              Conectar pela rede Tailscale
              {ts.url && <CheckCircle2 className="size-4 text-emerald-500" />}
            </div>
            {!ts.installed && (
              <div className="space-y-2 text-xs text-muted-foreground">
                <p>
                  O Tailscale cria uma rede privada entre os seus aparelhos — o Clawos não fica
                  exposto na internet. Instale no computador e no celular e entre com a mesma conta.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => window.open('https://tailscale.com/download')}
                >
                  <ExternalLink /> Baixar o Tailscale
                </Button>
              </div>
            )}
            {ts.installed && !ts.running && (
              <p className="text-xs text-muted-foreground">
                O Tailscale está instalado, mas desconectado. Abra o app do Tailscale e entre na sua
                conta.
              </p>
            )}
            {ts.running && !ts.url && (
              <div className="space-y-2 text-xs text-muted-foreground">
                <p>
                  Publique o Clawos na sua rede Tailscale ({ts.host}). Só os seus aparelhos
                  conseguem acessar, com HTTPS.
                </p>
                <Button
                  size="sm"
                  disabled={busy !== null}
                  onClick={() =>
                    void run('tailscale', () => window.clawos.invoke('remote:setupTailscale'))
                  }
                >
                  {busy === 'tailscale' ? <Loader2 className="animate-spin" /> : <ShieldCheck />}
                  Publicar na minha rede Tailscale
                </Button>
              </div>
            )}
            {ts.url && (
              <div className="space-y-1.5 text-xs text-muted-foreground">
                <p>Disponível para os seus aparelhos em:</p>
                <CopyCommand command={ts.url} />
                <button
                  type="button"
                  className="text-[11px] underline-offset-2 hover:underline"
                  onClick={() =>
                    void run('tailscale-off', () => window.clawos.invoke('remote:stopTailscale'))
                  }
                >
                  Parar de publicar no Tailscale
                </button>
              </div>
            )}
            <details className="text-[11px] text-muted-foreground">
              <summary className="cursor-pointer">Outras formas (avançado)</summary>
              <p className="mt-1">
                O Clawos escuta só neste computador em <code>{status.localUrl}</code>. Você pode
                levá-lo até seus aparelhos com um túnel SSH (<code>ssh -L</code>) ou um Cloudflare
                Tunnel com Cloudflare Access na frente. Nunca exponha essa porta direto na internet.
              </p>
            </details>
          </div>

          {/* 2. Pareamento */}
          <div className="space-y-2 rounded-lg border p-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <span className="flex size-5 items-center justify-center rounded-full bg-muted text-[11px]">
                2
              </span>
              Conectar um aparelho
            </div>
            {status.pairing && qr ? (
              <div className="flex gap-3">
                <img
                  src={qr}
                  alt="QR code de pareamento"
                  className="size-32 shrink-0 rounded-md bg-white p-1"
                />
                <div className="min-w-0 space-y-2 text-xs text-muted-foreground">
                  <p>
                    Aponte a câmera do celular para o QR code
                    {ts.url ? '' : ' (com o Tailscale ativo no celular)'}. O código vale uma vez,
                    por mais {minutesLeft} min.
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy !== null}
                    onClick={() =>
                      void run('pair', () => window.clawos.invoke('remote:newPairing'))
                    }
                  >
                    <RefreshCw /> Novo código
                  </Button>
                </div>
              </div>
            ) : null}
            {status.pairing && qr ? (
              <div className="space-y-1">
                <p className="text-[11px] text-muted-foreground">
                  Sem câmera, ou abrindo pelo ícone da tela de início? Copie o link e cole no
                  aparelho:
                </p>
                <CopyCommand command={status.pairing.url} />
              </div>
            ) : (
              <Button
                size="sm"
                variant="outline"
                disabled={busy !== null}
                onClick={() => void run('pair', () => window.clawos.invoke('remote:newPairing'))}
              >
                <Smartphone /> Gerar QR code
              </Button>
            )}
          </div>

          {/* Aparelhos */}
          <div className="space-y-1.5">
            <div className="text-xs font-medium">
              Aparelhos conectados
              <span className="ml-1 font-normal text-muted-foreground">
                ({status.connected} online agora)
              </span>
            </div>
            {status.devices.length === 0 && (
              <p className="text-xs text-muted-foreground">Nenhum aparelho pareado ainda.</p>
            )}
            {status.devices.map((device) => (
              <div
                key={device.id}
                className="flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm"
              >
                <Smartphone className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">{device.name}</span>
                <span className="text-[11px] text-muted-foreground">
                  visto {since(device.lastSeenAt, now)}
                </span>
                <button
                  type="button"
                  className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-red-500"
                  title="Desconectar este aparelho"
                  onClick={() => {
                    if (confirm(`Desconectar "${device.name}"? Ele precisará ser pareado de novo.`))
                      void run('revoke', () => window.clawos.invoke('remote:revoke', device.id))
                  }}
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            ))}
          </div>

          <p className="text-[11px] text-muted-foreground">
            Enquanto o acesso remoto estiver ligado, o Clawos impede o computador de dormir. Num
            notebook, fechar a tampa ainda faz ele dormir — deixe aberto ou ligado na tomada com
            monitor externo.
          </p>
        </>
      )}
    </div>
  )
}
