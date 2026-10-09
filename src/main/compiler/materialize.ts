import { existsSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { CompiledSession } from './ConfigCompiler'

/**
 * Gera em disco (fora do repositório do projeto) o plugin local com as skills do
 * projeto, apontando por symlink para as pastas originais — editar a skill no projeto
 * reflete na próxima sessão sem copiar nada.
 */
export function materializePlugin(plugin: NonNullable<CompiledSession['plugin']>): void {
  for (const skill of plugin.skills) {
    if (!existsSync(join(skill.source, 'SKILL.md'))) {
      throw new Error(`Skill sem SKILL.md: ${skill.source}`)
    }
  }
  rmSync(plugin.dir, { recursive: true, force: true })
  mkdirSync(join(plugin.dir, '.claude-plugin'), { recursive: true })
  mkdirSync(join(plugin.dir, 'skills'), { recursive: true })
  writeFileSync(
    join(plugin.dir, '.claude-plugin', 'plugin.json'),
    JSON.stringify(
      {
        name: plugin.name,
        version: '0.0.0',
        description: 'Skills do projeto, geradas pelo Clawos',
      },
      null,
      2,
    ),
  )
  for (const skill of plugin.skills) {
    // 'junction' funciona sem privilégios de administrador no Windows.
    symlinkSync(skill.source, join(plugin.dir, 'skills', skill.name), 'junction')
  }
}
