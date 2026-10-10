/** Abas de arquivo no dock usam o id `file:<caminho absoluto>`. */
const PREFIX = 'file:'

export const filePanelId = (path: string): string => `${PREFIX}${path}`
export const isFilePanel = (id: string): boolean => id.startsWith(PREFIX)
export const pathOfPanel = (id: string): string => id.slice(PREFIX.length)
export const fileName = (path: string): string => path.split(/[\\/]/).pop() || path

/** `src/db.sql:42` → caminho e linha. Também aceita `#L42` (links do GitHub/VS Code). */
export function splitLine(ref: string): { path: string; line?: number } {
  const match = /^(.*?)(?::(\d+)(?::\d+)?|#L(\d+)(?:-L?\d+)?)$/.exec(ref)
  if (!match) return { path: ref }
  const line = Number(match[2] ?? match[3])
  return { path: match[1]!, line }
}

/** Parece um caminho de arquivo? (`notas.md`, `src/app.ts:10`, `./a/b.sql`, `Dockerfile`) */
export function looksLikePath(text: string): boolean {
  if (text.length > 200 || /\s/.test(text) || /^[a-z]+:\/\//i.test(text)) return false
  const { path } = splitLine(text)
  const name = path.split('/').pop() ?? ''
  return (
    /^[\w.@~/-]+$/.test(path) &&
    (/\.[a-z0-9]{1,10}$/i.test(name) || /^(Dockerfile|Makefile|README|LICENSE)$/.test(name)) &&
    !/^\.+$/.test(name)
  )
}
