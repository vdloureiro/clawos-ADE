export interface Mention {
  /** Posição do `@`. */
  start: number
  /** Fim do termo digitado (posição do cursor). */
  end: number
  query: string
}

/** Detecta um `@termo` sendo digitado imediatamente antes do cursor. */
export function mentionAt(text: string, caret: number): Mention | null {
  const before = text.slice(0, caret)
  const match = /(^|\s)@([^\s@]*)$/.exec(before)
  if (!match) return null
  const start = caret - match[2]!.length - 1
  return { start, end: caret, query: match[2]! }
}

/** Filtra arquivos por subsequência, priorizando nome do arquivo e caminhos curtos. */
export function filterFiles(files: string[], query: string, limit = 30): string[] {
  const q = query.toLowerCase()
  if (!q) return files.slice(0, limit)
  const scored: { file: string; score: number }[] = []
  for (const file of files) {
    const lower = file.toLowerCase()
    const name = lower.slice(lower.lastIndexOf('/') + 1)
    let score: number
    if (name.startsWith(q)) score = 0
    else if (name.includes(q)) score = 1
    else if (lower.includes(q)) score = 2
    else if (isSubsequence(q, lower)) score = 3
    else continue
    scored.push({ file, score: score * 1000 + file.length })
  }
  return scored
    .sort((a, b) => a.score - b.score)
    .slice(0, limit)
    .map((s) => s.file)
}

function isSubsequence(needle: string, haystack: string): boolean {
  let i = 0
  for (const char of haystack) if (char === needle[i]) i++
  return i === needle.length
}
