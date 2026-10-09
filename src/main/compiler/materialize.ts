import { existsSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { CompiledSession } from './ConfigCompiler'

/**
 * Escreve em `dir` (fora do repositório do projeto) os arquivos e links que o compilador
 * pediu. Links apontam para as pastas originais — editar uma skill no projeto reflete na
 * próxima sessão sem copiar nada. O diretório é recriado do zero a cada sessão.
 */
export function materialize(dir: string, compiled: Pick<CompiledSession, 'files' | 'links'>): void {
  for (const link of compiled.links) {
    if (link.requires && !existsSync(join(link.target, link.requires))) {
      throw new Error(`${link.requires} não encontrado em: ${link.target}`)
    }
  }
  rmSync(dir, { recursive: true, force: true })
  if (compiled.files.length === 0 && compiled.links.length === 0) return
  for (const file of compiled.files) {
    mkdirSync(dirname(file.path), { recursive: true })
    writeFileSync(file.path, file.content)
  }
  for (const link of compiled.links) {
    mkdirSync(dirname(link.path), { recursive: true })
    // 'junction' funciona sem privilégios de administrador no Windows.
    symlinkSync(link.target, link.path, 'junction')
  }
}
