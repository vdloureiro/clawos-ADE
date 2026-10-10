import type { Extension } from '@codemirror/state'

/**
 * Suporte de linguagem do editor por extensão de arquivo, carregado sob demanda
 * (cada pacote só entra quando um arquivo daquele tipo é aberto).
 */
type Loader = () => Promise<Extension>

/** Modos "legados" (StreamLanguage): o módulo exporta a definição com este nome. */
const legacy =
  (name: string, mod: () => Promise<Record<string, unknown>>): Loader =>
  async () => {
    const [{ StreamLanguage }, m] = await Promise.all([import('@codemirror/language'), mod()])
    return StreamLanguage.define(m[name] as Parameters<typeof StreamLanguage.define>[0])
  }

const js =
  (options: { typescript?: boolean; jsx?: boolean }): Loader =>
  async () =>
    (await import('@codemirror/lang-javascript')).javascript(options)

const LOADERS: Record<string, Loader> = {
  sql: async () => (await import('@codemirror/lang-sql')).sql(),
  md: async () => (await import('@codemirror/lang-markdown')).markdown(),
  ts: js({ typescript: true }),
  tsx: js({ typescript: true, jsx: true }),
  js: js({}),
  jsx: js({ jsx: true }),
  py: async () => (await import('@codemirror/lang-python')).python(),
  json: async () => (await import('@codemirror/lang-json')).json(),
  html: async () => (await import('@codemirror/lang-html')).html(),
  css: async () => (await import('@codemirror/lang-css')).css(),
  yaml: async () => (await import('@codemirror/lang-yaml')).yaml(),
  php: async () => (await import('@codemirror/lang-php')).php(),
  java: async () => (await import('@codemirror/lang-java')).java(),
  rust: async () => (await import('@codemirror/lang-rust')).rust(),
  go: async () => (await import('@codemirror/lang-go')).go(),
  xml: async () => (await import('@codemirror/lang-xml')).xml(),
  cpp: async () => (await import('@codemirror/lang-cpp')).cpp(),
  shell: legacy('shell', () => import('@codemirror/legacy-modes/mode/shell')),
  toml: legacy('toml', () => import('@codemirror/legacy-modes/mode/toml')),
  ruby: legacy('ruby', () => import('@codemirror/legacy-modes/mode/ruby')),
  swift: legacy('swift', () => import('@codemirror/legacy-modes/mode/swift')),
  dockerfile: legacy('dockerFile', () => import('@codemirror/legacy-modes/mode/dockerfile')),
  properties: legacy('properties', () => import('@codemirror/legacy-modes/mode/properties')),
  kotlin: legacy('kotlin', () => import('@codemirror/legacy-modes/mode/clike')),
  csharp: legacy('csharp', () => import('@codemirror/legacy-modes/mode/clike')),
  diff: legacy('diff', () => import('@codemirror/legacy-modes/mode/diff')),
}

const BY_EXTENSION: Record<string, string> = {
  sql: 'sql',
  md: 'md',
  mdx: 'md',
  markdown: 'md',
  ts: 'ts',
  mts: 'ts',
  cts: 'ts',
  tsx: 'tsx',
  js: 'js',
  mjs: 'js',
  cjs: 'js',
  jsx: 'jsx',
  py: 'py',
  json: 'json',
  jsonc: 'json',
  html: 'html',
  htm: 'html',
  vue: 'html',
  svelte: 'html',
  css: 'css',
  scss: 'css',
  less: 'css',
  yaml: 'yaml',
  yml: 'yaml',
  php: 'php',
  java: 'java',
  rs: 'rust',
  go: 'go',
  xml: 'xml',
  svg: 'xml',
  plist: 'xml',
  c: 'cpp',
  h: 'cpp',
  cpp: 'cpp',
  cc: 'cpp',
  hpp: 'cpp',
  sh: 'shell',
  bash: 'shell',
  zsh: 'shell',
  toml: 'toml',
  rb: 'ruby',
  swift: 'swift',
  kt: 'kotlin',
  kts: 'kotlin',
  cs: 'csharp',
  ini: 'properties',
  cfg: 'properties',
  conf: 'properties',
  properties: 'properties',
  env: 'properties',
  diff: 'diff',
  patch: 'diff',
}

/** Chave de linguagem do editor para um caminho, ou null (texto puro). */
export function editorLanguageFor(path: string): string | null {
  const name = path.split(/[\\/]/).pop()?.toLowerCase() ?? ''
  if (name === 'dockerfile' || name.startsWith('dockerfile.')) return 'dockerfile'
  if (name.startsWith('.env')) return 'properties'
  const ext = name.includes('.') ? name.split('.').pop()! : ''
  return BY_EXTENSION[ext] ?? null
}

export async function loadEditorLanguage(path: string): Promise<Extension | null> {
  const key = editorLanguageFor(path)
  if (!key) return null
  try {
    return await LOADERS[key]!()
  } catch {
    return null
  }
}
