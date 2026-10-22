import { readFileSync } from 'node:fs'

/**
 * Erros passageiros de leitura. O caso real: pastas sincronizadas com o iCloud
 * ("Otimizar armazenamento do Mac") deixam arquivos só na nuvem, e a leitura que dispara
 * o download pode ser interrompida (EINTR) ou demorar (ETIMEDOUT). Tentar de novo resolve.
 */
const TRANSIENT = new Set(['EINTR', 'EAGAIN', 'ETIMEDOUT', 'EBUSY', 'EDEADLK'])
const ATTEMPTS = 6

const pause = (ms: number) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)

export function isTransientReadError(error: unknown): boolean {
  return TRANSIENT.has((error as NodeJS.ErrnoException)?.code ?? '')
}

/** `readFileSync` que tenta de novo (com espera crescente) em erros passageiros. */
export function readFileRetrying(path: string): Buffer
export function readFileRetrying(path: string, encoding: BufferEncoding): string
export function readFileRetrying(
  path: string,
  encoding?: BufferEncoding,
  read: (path: string) => Buffer = (p) => readFileSync(p),
): Buffer | string {
  for (let attempt = 1; ; attempt++) {
    try {
      const data = read(path)
      return encoding ? data.toString(encoding) : data
    } catch (error) {
      if (!isTransientReadError(error) || attempt >= ATTEMPTS) throw error
      pause(150 * attempt)
    }
  }
}
