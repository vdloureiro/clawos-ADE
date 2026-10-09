import type { HighlighterCore } from 'shiki/core'

/**
 * Shiki com engine JavaScript (sem WASM, compatível com a CSP) e um conjunto enxuto de
 * linguagens, carregado sob demanda na primeira vez que um bloco de código aparece.
 */
const LANGS: Record<string, () => Promise<unknown>> = {
  typescript: () => import('shiki/dist/langs/typescript.mjs'),
  tsx: () => import('shiki/dist/langs/tsx.mjs'),
  javascript: () => import('shiki/dist/langs/javascript.mjs'),
  jsx: () => import('shiki/dist/langs/jsx.mjs'),
  json: () => import('shiki/dist/langs/json.mjs'),
  bash: () => import('shiki/dist/langs/bash.mjs'),
  python: () => import('shiki/dist/langs/python.mjs'),
  css: () => import('shiki/dist/langs/css.mjs'),
  html: () => import('shiki/dist/langs/html.mjs'),
  markdown: () => import('shiki/dist/langs/markdown.mjs'),
  yaml: () => import('shiki/dist/langs/yaml.mjs'),
  sql: () => import('shiki/dist/langs/sql.mjs'),
  rust: () => import('shiki/dist/langs/rust.mjs'),
  go: () => import('shiki/dist/langs/go.mjs'),
  diff: () => import('shiki/dist/langs/diff.mjs'),
}

const ALIASES: Record<string, string> = {
  ts: 'typescript',
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  sh: 'bash',
  shell: 'bash',
  zsh: 'bash',
  console: 'bash',
  py: 'python',
  yml: 'yaml',
  md: 'markdown',
  rs: 'rust',
}

let highlighter: Promise<HighlighterCore> | null = null
const loadedLangs = new Set<string>()

function getHighlighter(): Promise<HighlighterCore> {
  highlighter ??= (async () => {
    const [{ createHighlighterCore }, { createJavaScriptRegexEngine }] = await Promise.all([
      import('shiki/core'),
      import('shiki/engine/javascript'),
    ])
    return createHighlighterCore({
      themes: [
        import('shiki/dist/themes/github-dark.mjs'),
        import('shiki/dist/themes/github-light.mjs'),
      ],
      langs: [],
      engine: createJavaScriptRegexEngine(),
    })
  })()
  return highlighter
}

export function resolveLang(lang: string | undefined): string | null {
  if (!lang) return null
  const name = ALIASES[lang.toLowerCase()] ?? lang.toLowerCase()
  return name in LANGS ? name : null
}

/** Retorna HTML destacado (temas claro e escuro via CSS vars), ou null se a linguagem não for suportada. */
export async function highlight(code: string, lang: string | undefined): Promise<string | null> {
  const name = resolveLang(lang)
  if (!name) return null
  const hl = await getHighlighter()
  if (!loadedLangs.has(name)) {
    const mod = (await LANGS[name]!()) as {
      default: Parameters<HighlighterCore['loadLanguage']>[0]
    }
    await hl.loadLanguage(mod.default)
    loadedLangs.add(name)
  }
  return hl.codeToHtml(code, {
    lang: name,
    themes: { light: 'github-light', dark: 'github-dark' },
    defaultColor: false,
  })
}
