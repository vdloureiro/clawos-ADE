/**
 * Codificação das mensagens do acesso remoto (WebSocket/JSON). JSON não carrega bytes,
 * então `Uint8Array` (ex.: anexos colados) viaja como `{ __bytes: "<base64>" }`.
 */
const BYTES = '__bytes'

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binary)
}

function fromBase64(text: string): Uint8Array {
  const binary = atob(text)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

export function encodeWire(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    v instanceof Uint8Array ? { [BYTES]: toBase64(v) } : v,
  )
}

export function decodeWire<T = unknown>(text: string): T {
  return JSON.parse(text, (_key, v: unknown) =>
    v &&
    typeof v === 'object' &&
    BYTES in v &&
    typeof (v as Record<string, unknown>)[BYTES] === 'string'
      ? fromBase64((v as Record<string, string>)[BYTES]!)
      : v,
  ) as T
}

/** Mensagens cliente → servidor. */
export type ClientMessage = { id: number; channel: string; args: unknown[] }

/** Mensagens servidor → cliente. */
export type ServerMessage =
  | { id: number; ok: true; result: unknown }
  | { id: number; ok: false; error: string }
  | { event: string; payload: unknown }
