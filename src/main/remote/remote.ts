import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { powerSaveBlocker } from 'electron'
import type Database from 'better-sqlite3'
import type { RemoteStatus } from '@shared/types'
import { getShellEnv, which } from '../agents/shellEnv'
import { RemoteManager } from './RemoteManager'
import { RemoteServer } from './RemoteServer'

/**
 * Acesso remoto: liga/desliga o servidor local, mantém o computador acordado enquanto
 * estiver ligado e integra com o Tailscale (`tailscale serve`), que leva a interface aos
 * seus aparelhos por HTTPS sem abrir nenhuma porta para a internet.
 */
let manager: RemoteManager
let server: RemoteServer
let awakeId: number | null = null
let lastError: string | null = null

export function initRemote(db: Database.Database, rendererDir: string): void {
  manager = new RemoteManager(db)
  server = new RemoteServer(manager, rendererDir)
  if (manager.enabled) void start()
}

async function start(): Promise<void> {
  try {
    await server.start(manager.port)
    lastError = null
    // Mantém o app rodando com a tela apagada (fechar a tampa ainda faz o Mac dormir).
    awakeId ??= powerSaveBlocker.start('prevent-app-suspension')
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    lastError =
      code === 'EADDRINUSE'
        ? `A porta ${manager.port} já está em uso por outro programa.`
        : (error as Error).message
  }
}

function stop(): void {
  server.stop()
  if (awakeId !== null) powerSaveBlocker.stop(awakeId)
  awakeId = null
}

export function stopRemote(): void {
  stop()
}

export async function setRemoteEnabled(enabled: boolean): Promise<RemoteStatus> {
  manager.enabled = enabled
  if (enabled) {
    await start()
    if (!manager.currentPairing()) manager.newPairing()
  } else stop()
  return remoteStatus()
}

export function newPairing(): Promise<RemoteStatus> {
  manager.newPairing()
  return remoteStatus()
}

export function revokeDevice(id: string): Promise<RemoteStatus> {
  manager.revoke(id)
  server.dropRevoked()
  return remoteStatus()
}

// ---------------------------------------------------------------------------
// Tailscale

async function tailscaleCli(): Promise<string | null> {
  const app = '/Applications/Tailscale.app/Contents/MacOS/Tailscale'
  return (await which('tailscale')) ?? (existsSync(app) ? app : null)
}

function run(
  file: string,
  args: string[],
): Promise<{ code: number; stdout: string; stderr: string }> {
  return getShellEnv().then(
    (env) =>
      new Promise((resolve) => {
        execFile(file, args, { env, timeout: 20_000 }, (error, stdout, stderr) =>
          resolve({
            code: error ? (typeof error.code === 'number' ? error.code : 1) : 0,
            stdout: String(stdout),
            stderr: String(stderr),
          }),
        )
      }),
  )
}

async function tailscaleInfo(): Promise<RemoteStatus['tailscale']> {
  const cli = await tailscaleCli()
  if (!cli) return { installed: false, running: false, url: null, host: null }
  const status = await run(cli, ['status', '--json'])
  let host: string | null = null
  let running = false
  try {
    const data = JSON.parse(status.stdout) as { BackendState?: string; Self?: { DNSName?: string } }
    running = data.BackendState === 'Running'
    host = data.Self?.DNSName?.replace(/\.$/, '') || null
  } catch {
    // Tailscale instalado mas sem login.
  }
  let url: string | null = null
  if (running && host) {
    const serve = await run(cli, ['serve', 'status', '--json'])
    if (serve.stdout.includes(`127.0.0.1:${manager.port}`)) url = `https://${host}`
  }
  return { installed: true, running, url, host }
}

/** Publica o Clawos na sua rede Tailscale (HTTPS, só para os seus aparelhos). */
export async function setupTailscale(): Promise<RemoteStatus> {
  const cli = await tailscaleCli()
  if (!cli)
    throw new Error(
      'Tailscale não encontrado. Instale em tailscale.com/download e entre na sua conta.',
    )
  const result = await run(cli, [
    'serve',
    '--bg',
    '--https=443',
    `http://127.0.0.1:${manager.port}`,
  ])
  // Primeira vez: o dono da rede precisa autorizar o Serve (e o HTTPS) no Tailscale.
  const consent = `${result.stderr}\n${result.stdout}`.match(
    /https:\/\/login\.tailscale\.com\/\S+/,
  )?.[0]
  if (result.code !== 0 && consent)
    throw new Error(
      `TAILSCALE_CONSENT ${consent} O Tailscale precisa que você autorize o recurso Serve na sua rede (uma única vez).`,
    )
  if (result.code !== 0)
    throw new Error(
      (result.stderr || result.stdout).trim() ||
        'Não foi possível ativar o Tailscale Serve. Verifique se o HTTPS está habilitado no painel do Tailscale (DNS → HTTPS Certificates).',
    )
  return remoteStatus()
}

export async function stopTailscale(): Promise<RemoteStatus> {
  const cli = await tailscaleCli()
  if (cli) await run(cli, ['serve', '--https=443', 'off'])
  return remoteStatus()
}

export async function remoteStatus(): Promise<RemoteStatus> {
  const tailscale = await tailscaleInfo()
  const localUrl = `http://127.0.0.1:${manager.port}`
  const pairing = manager.currentPairing()
  const base = tailscale.url ?? localUrl
  return {
    enabled: manager.enabled && server.running,
    localUrl,
    error: manager.enabled ? lastError : null,
    tailscale,
    pairing:
      pairing && server.running
        ? { url: `${base}/?pair=${pairing.token}`, expiresAt: pairing.expiresAt }
        : null,
    devices: manager.devices(),
    connected: server.connected,
  }
}
