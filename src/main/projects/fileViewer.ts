import {
  closeSync,
  openSync,
  readFileSync,
  readSync,
  statSync,
  unwatchFile,
  watchFile,
} from 'node:fs'
import { extname, isAbsolute, resolve } from 'node:path'
import { homedir } from 'node:os'
import type { FileContent } from '@shared/types'

/** Acima disso o visualizador não carrega o texto (oferece abrir no app padrão). */
export const MAX_TEXT_BYTES = 2 * 1024 * 1024
const MAX_IMAGE_BYTES = 10 * 1024 * 1024

const IMAGE_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.bmp': 'image/bmp',
}

/** Caminho absoluto a partir do que o agente escreveu (relativo à pasta da sessão, `~/`…). */
export function resolvePath(path: string, cwd: string): string {
  const clean = path.trim().replace(/^file:\/\//, '')
  if (clean.startsWith('~/')) return resolve(homedir(), clean.slice(2))
  return isAbsolute(clean) ? resolve(clean) : resolve(cwd, clean)
}

/** Para cada caminho, o absoluto se for um arquivo existente; senão null. */
export function resolveExisting(paths: string[], cwd: string): (string | null)[] {
  return paths.map((path) => {
    try {
      const full = resolvePath(decodeURIComponent(path), cwd)
      return statSync(full).isFile() ? full : null
    } catch {
      return null
    }
  })
}

/** Heurística do git: byte nulo no início = binário. */
export function looksBinary(buffer: Buffer): boolean {
  return buffer.subarray(0, 8000).includes(0)
}

export function readForViewer(path: string): FileContent {
  let stat
  try {
    stat = statSync(path)
  } catch {
    return { path, kind: 'missing', size: 0, mtime: 0 }
  }
  if (!stat.isFile()) return { path, kind: 'missing', size: 0, mtime: 0 }
  const base = { path, size: stat.size, mtime: stat.mtimeMs }

  const mime = IMAGE_TYPES[extname(path).toLowerCase()]
  if (mime) {
    if (stat.size > MAX_IMAGE_BYTES) return { ...base, kind: 'too_large' }
    return {
      ...base,
      kind: 'image',
      dataUrl: `data:${mime};base64,${readFileSync(path).toString('base64')}`,
    }
  }
  if (stat.size > MAX_TEXT_BYTES) return { ...base, kind: 'too_large' }

  const head = Buffer.alloc(Math.min(8000, stat.size))
  const fd = openSync(path, 'r')
  try {
    readSync(fd, head, 0, head.length, 0)
  } finally {
    closeSync(fd)
  }
  if (looksBinary(head)) return { ...base, kind: 'binary' }
  return { ...base, kind: 'text', text: readFileSync(path, 'utf8') }
}

/**
 * Observa arquivos abertos no visualizador. Usa polling (`watchFile`) porque agentes
 * costumam salvar trocando o arquivo inteiro, o que quebra o `fs.watch`.
 */
export class FileWatchers {
  private readonly watched = new Map<string, number>()

  constructor(private readonly onChange: (path: string) => void) {}

  watch(path: string): void {
    const count = this.watched.get(path) ?? 0
    this.watched.set(path, count + 1)
    if (count > 0) return
    watchFile(path, { interval: 1000 }, (current, previous) => {
      if (current.mtimeMs !== previous.mtimeMs || current.size !== previous.size)
        this.onChange(path)
    })
  }

  unwatch(path: string): void {
    const count = this.watched.get(path) ?? 0
    if (count <= 1) {
      this.watched.delete(path)
      unwatchFile(path)
    } else {
      this.watched.set(path, count - 1)
    }
  }
}
