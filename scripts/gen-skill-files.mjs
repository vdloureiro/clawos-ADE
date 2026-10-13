// Gera src/shared/skillFiles.generated.ts: a lista de arquivos (com hash git) de cada skill
// do catálogo, no commit fixado de cada fonte. Rode depois de mudar src/shared/skillCatalog.ts:
//   node scripts/gen-skill-files.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const catalog = readFileSync(`${root}src/shared/skillCatalog.ts`, 'utf8')

const sources = {}
for (const m of catalog.matchAll(
  /(\w+): \{\s*label: '[^']*',\s*repo: '([^']+)',\s*commit: '([0-9a-f]{40})'/g,
))
  sources[m[1]] = { repo: m[2], commit: m[3] }

const skills = [...catalog.matchAll(/skill\(\s*'(\w+)',\s*'([\w-]+)',/g)].map((m) => ({
  source: m[1],
  id: m[2],
}))

const headers = { 'User-Agent': 'clawos-gen-skill-files', Accept: 'application/vnd.github+json' }
if (process.env.GH_TOKEN) headers.Authorization = `Bearer ${process.env.GH_TOKEN}`

const trees = {}
async function tree(source) {
  const { repo, commit } = sources[source]
  if (!trees[source]) {
    const res = await fetch(
      `https://api.github.com/repos/${repo}/git/trees/${commit}?recursive=1`,
      {
        headers,
      },
    )
    if (!res.ok) throw new Error(`${repo}: HTTP ${res.status}`)
    const data = await res.json()
    if (data.truncated) throw new Error(`${repo}: árvore truncada`)
    trees[source] = data.tree
  }
  return trees[source]
}

const out = {}
for (const { source, id } of skills) {
  if (!sources[source]) throw new Error(`Fonte desconhecida: ${source}`)
  const dir = `skills/${id}/`
  const files = (await tree(source))
    .filter((t) => t.type === 'blob' && t.path.startsWith(dir))
    .map((t) => [t.path.slice(dir.length), t.sha, t.size])
  if (!files.some(([p]) => p === 'SKILL.md')) throw new Error(`${id}: sem SKILL.md`)
  out[id] = files
}

const body = Object.entries(out)
  .map(
    ([id, files]) =>
      `  '${id}': [\n${files.map((f) => `    ${JSON.stringify(f).replace(/,/g, ', ')},`).join('\n')}\n  ],`,
  )
  .join('\n')

writeFileSync(
  `${root}src/shared/skillFiles.generated.ts`,
  `// Gerado por scripts/gen-skill-files.mjs — não edite à mão.\nimport type { SkillFile } from './skillCatalog'\n\nexport const SKILL_FILES: Record<string, SkillFile[]> = {\n${body}\n}\n`,
)
console.log(`${skills.length} skills, ${Object.values(out).flat().length} arquivos`)
