import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'

/**
 * Pasta neutra de onde o `npx` dos MCPs roda (`npx --prefix`). Sem isso o npx lê o
 * package.json/node_modules do projeto, e numa pasta com arquivos só na nuvem (iCloud
 * "Otimizar armazenamento") ele trava esperando o download.
 */
export function npxPrefixDir(): string {
  const dir = join(app.getPath('userData'), 'mcp-npx')
  mkdirSync(dir, { recursive: true })
  return dir
}
