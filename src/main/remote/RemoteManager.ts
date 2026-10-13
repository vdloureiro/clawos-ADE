import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import type Database from 'better-sqlite3'
import type { RemoteDevice } from '@shared/types'

/** Validade do código de pareamento (QR code). */
const PAIRING_TTL_MS = 10 * 60 * 1000

const hash = (token: string) => createHash('sha256').update(token).digest('hex')
const newToken = () => randomBytes(32).toString('base64url')

interface DeviceRow {
  id: string
  name: string
  token_hash: string
  created_at: number
  last_seen_at: number | null
}

/**
 * Estado do acesso remoto: ajustes, aparelhos pareados e o código de pareamento.
 *
 * Cada aparelho recebe uma chave aleatória (256 bits) que vira cookie no navegador; o
 * banco guarda só o hash. O código de pareamento vale 10 minutos e uma única vez.
 */
export class RemoteManager {
  private pairing: { token: string; expiresAt: number } | null = null

  constructor(private readonly db: Database.Database) {}

  // Ajustes ------------------------------------------------------------------

  setting(key: string): string | null {
    const row = this.db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key) as
      { value: string } | undefined
    return row?.value ?? null
  }

  setSetting(key: string, value: string): void {
    this.db
      .prepare(
        'INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      )
      .run(key, value)
  }

  get enabled(): boolean {
    return this.setting('remote.enabled') === '1'
  }

  set enabled(value: boolean) {
    this.setSetting('remote.enabled', value ? '1' : '0')
  }

  get port(): number {
    const port = Number(this.setting('remote.port'))
    return Number.isInteger(port) && port > 1024 && port < 65536 ? port : 4317
  }

  // Pareamento -----------------------------------------------------------------

  /** Novo código de pareamento (invalida o anterior). */
  newPairing(now = Date.now()): { token: string; expiresAt: number } {
    this.pairing = { token: newToken(), expiresAt: now + PAIRING_TTL_MS }
    return this.pairing
  }

  currentPairing(now = Date.now()): { token: string; expiresAt: number } | null {
    return this.pairing && this.pairing.expiresAt > now ? this.pairing : null
  }

  /** Troca o código de pareamento por uma chave de aparelho. O código só vale uma vez. */
  pair(
    code: string,
    name: string,
    now = Date.now(),
  ): { device: RemoteDevice; token: string } | null {
    const pairing = this.currentPairing(now)
    if (!pairing || !safeEqual(code, pairing.token)) return null
    this.pairing = null
    const token = newToken()
    const device: RemoteDevice = {
      id: randomUUID(),
      name: name.trim().slice(0, 80) || 'Aparelho',
      createdAt: now,
      lastSeenAt: now,
    }
    this.db
      .prepare(
        'INSERT INTO remote_devices (id, name, token_hash, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?)',
      )
      .run(device.id, device.name, hash(token), device.createdAt, device.lastSeenAt)
    return { device, token }
  }

  /** Aparelho dono da chave, ou null (revogado/inexistente). Atualiza "visto por último". */
  verify(token: string | undefined, now = Date.now()): RemoteDevice | null {
    if (!token) return null
    const row = this.db
      .prepare('SELECT * FROM remote_devices WHERE token_hash = ?')
      .get(hash(token)) as DeviceRow | undefined
    if (!row) return null
    if (!row.last_seen_at || now - row.last_seen_at > 60_000)
      this.db.prepare('UPDATE remote_devices SET last_seen_at = ? WHERE id = ?').run(now, row.id)
    return toDevice({ ...row, last_seen_at: now })
  }

  devices(): RemoteDevice[] {
    const rows = this.db
      .prepare('SELECT * FROM remote_devices ORDER BY created_at DESC')
      .all() as DeviceRow[]
    return rows.map(toDevice)
  }

  revoke(id: string): void {
    this.db.prepare('DELETE FROM remote_devices WHERE id = ?').run(id)
  }
}

function toDevice(row: DeviceRow): RemoteDevice {
  return { id: row.id, name: row.name, createdAt: row.created_at, lastSeenAt: row.last_seen_at }
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}
