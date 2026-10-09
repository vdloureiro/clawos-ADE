// Ajustes locais executados após `pnpm install`.
import { execFileSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

// 1. O pnpm instala os prebuilds do node-pty sem o bit de execução no `spawn-helper`,
//    o que faz todo `pty.spawn` falhar no macOS com "posix_spawnp failed".
if (process.platform !== 'win32') {
  const require = createRequire(import.meta.url)
  const root = dirname(require.resolve('node-pty/package.json'))
  const dirs = [join(root, 'build/Release')]
  const prebuilds = join(root, 'prebuilds')
  if (existsSync(prebuilds)) {
    for (const entry of readdirSync(prebuilds)) dirs.push(join(prebuilds, entry))
  }
  for (const dir of dirs) {
    const helper = join(dir, 'spawn-helper')
    if (existsSync(helper)) chmodSync(helper, 0o755)
  }
}

// 2. Se o projeto estiver numa pasta sincronizada pelo iCloud (ex.: Mesa/Documentos),
//    o macOS "evicta" arquivos de node_modules para a nuvem e qualquer import passa a
//    travar. Este atributo exclui as pastas geradas da sincronização.
if (process.platform === 'darwin') {
  for (const dir of ['node_modules', 'out', 'dist']) {
    mkdirSync(dir, { recursive: true })
    try {
      execFileSync('xattr', ['-w', 'com.apple.fileprovider.ignore#P', '1', dir])
    } catch {
      // Sem iCloud/FileProvider o atributo é irrelevante.
    }
  }
}
