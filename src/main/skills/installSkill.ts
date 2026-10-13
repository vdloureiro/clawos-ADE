import { createHash } from 'node:crypto'
import { mkdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, normalize, sep } from 'node:path'
import {
  SKILL_SOURCES,
  skillEntry,
  skillFiles,
  skillInstallPath,
  type SkillFile,
} from '@shared/skillCatalog'

/** Hash que o git usa para o conteúdo de um arquivo (blob). */
export function gitBlobSha(data: Uint8Array): string {
  return createHash('sha1').update(`blob ${data.byteLength}\0`).update(data).digest('hex')
}

type Fetcher = (url: string) => Promise<Uint8Array>

const defaultFetch: Fetcher = async (url) => {
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) })
  if (!res.ok) throw new Error(`HTTP ${res.status} ao baixar ${url}`)
  return new Uint8Array(await res.arrayBuffer())
}

/** Caminho do arquivo dentro da pasta da skill, sem escapar dela. */
function safeJoin(root: string, path: string): string {
  const clean = normalize(path)
  if (isAbsolute(clean) || clean === '..' || clean.startsWith(`..${sep}`))
    throw new Error(`Caminho inválido na skill: ${path}`)
  return join(root, clean)
}

/**
 * Instala uma skill do catálogo em `<projeto>/.clawos/skills/<id>`: baixa cada arquivo no
 * commit fixado, confere o hash git e só então troca a pasta (atômico). Retorna o caminho
 * relativo para pôr em `skills` da configuração.
 */
export async function installSkill(
  projectPath: string,
  id: string,
  fetchFile: Fetcher = defaultFetch,
): Promise<string> {
  const entry = skillEntry(id)
  const files = skillFiles(id)
  if (!entry || files.length === 0) throw new Error(`Skill desconhecida: ${id}`)
  if (!(await stat(projectPath)).isDirectory())
    throw new Error(`Pasta do projeto não encontrada: ${projectPath}`)

  const source = SKILL_SOURCES[entry.source]
  const skillsDir = join(projectPath, '.clawos', 'skills')
  const target = join(skillsDir, id)
  const temp = join(skillsDir, `.${id}.download`)
  await rm(temp, { recursive: true, force: true })

  try {
    const queue = [...files]
    let stopped = false
    const worker = async (): Promise<void> => {
      for (let file = queue.shift(); file; file = queue.shift()) {
        if (stopped) return
        try {
          await download(file)
        } catch (error) {
          stopped = true
          throw error
        }
      }
    }
    const download = async ([path, sha]: SkillFile): Promise<void> => {
      const url = `https://raw.githubusercontent.com/${source.repo}/${source.commit}/${entry.dir}/${path}`
      const data = await fetchFile(url)
      if (gitBlobSha(data) !== sha)
        throw new Error(`O arquivo ${path} veio diferente do esperado; instalação cancelada.`)
      const dest = safeJoin(temp, path)
      await mkdir(dirname(dest), { recursive: true })
      await writeFile(dest, data)
    }
    // Espera todos pararem antes de limpar, para nenhum gravar depois do rm.
    const results = await Promise.allSettled(Array.from({ length: 6 }, worker))
    const failed = results.find((r) => r.status === 'rejected')
    if (failed) throw failed.reason
    await rm(target, { recursive: true, force: true })
    await rename(temp, target)
  } catch (error) {
    await rm(temp, { recursive: true, force: true })
    throw error
  }
  return skillInstallPath(id)
}
