/**
 * Catálogo de skills prontas: pastas com SKILL.md de repositórios abertos e confiáveis.
 * Cada fonte fica presa a um commit; a lista de arquivos (com o hash git de cada um) é
 * gerada por `scripts/gen-skill-files.mts` e conferida na instalação.
 */
import { SKILL_FILES } from './skillFiles.generated'

export type SkillCategory = 'programacao' | 'design' | 'marketing' | 'escrita'

export const SKILL_CATEGORIES: { id: SkillCategory; label: string }[] = [
  { id: 'programacao', label: 'Programação' },
  { id: 'design', label: 'Design' },
  { id: 'marketing', label: 'Marketing' },
  { id: 'escrita', label: 'Escrita' },
]

export interface SkillSource {
  label: string
  repo: string
  commit: string
  license: string
}

export const SKILL_SOURCES = {
  anthropic: {
    label: 'Anthropic',
    repo: 'anthropics/skills',
    commit: 'dbd4588f9e1033efb41dad4bef2f7947c8993d44',
    license: 'Apache 2.0',
  },
  superpowers: {
    label: 'Superpowers',
    repo: 'obra/superpowers',
    commit: 'bb92a77741419a4ab5f06e711a283343f1ada0c3',
    license: 'MIT',
  },
  marketing: {
    label: 'Marketing Skills',
    repo: 'coreyhaines31/marketingskills',
    commit: '0f8d89961cdf782dd02644b9df3ddc671c21a7f0',
    license: 'MIT',
  },
  vercel: {
    label: 'Vercel',
    repo: 'vercel-labs/agent-skills',
    commit: '063bee94c3f4df8453406c830b0a7df0f2860278',
    license: 'MIT',
  },
} satisfies Record<string, SkillSource>

export type SkillSourceId = keyof typeof SKILL_SOURCES

export interface SkillCatalogEntry {
  /** Também é o nome da pasta instalada em `.clawos/skills/`. */
  id: string
  name: string
  category: SkillCategory
  description: string
  source: SkillSourceId
  /** Pasta da skill dentro do repositório. */
  dir: string
}

/** Arquivo da skill: caminho relativo à pasta, hash git (blob sha1) e tamanho. */
export type SkillFile = [path: string, sha: string, size: number]

const skill = (
  source: SkillSourceId,
  id: string,
  name: string,
  category: SkillCategory,
  description: string,
): SkillCatalogEntry => ({ id, name, category, description, source, dir: `skills/${id}` })

export const SKILL_CATALOG: SkillCatalogEntry[] = [
  // Programação
  skill(
    'superpowers',
    'brainstorming',
    'Brainstorming',
    'programacao',
    'Antes de codar, explora a ideia com perguntas e alternativas até virar um design claro.',
  ),
  skill(
    'superpowers',
    'writing-plans',
    'Planos de implementação',
    'programacao',
    'Quebra uma funcionalidade em um plano passo a passo, com arquivos, testes e verificação.',
  ),
  skill(
    'superpowers',
    'test-driven-development',
    'TDD',
    'programacao',
    'Escreve o teste que falha primeiro, depois o código mínimo para passar, e refatora.',
  ),
  skill(
    'superpowers',
    'systematic-debugging',
    'Depuração sistemática',
    'programacao',
    'Investiga a causa raiz de um bug com método antes de propor qualquer correção.',
  ),
  skill(
    'superpowers',
    'verification-before-completion',
    'Verificar antes de concluir',
    'programacao',
    'Só declara "pronto" depois de rodar os comandos e ver a evidência de que funciona.',
  ),
  skill(
    'superpowers',
    'requesting-code-review',
    'Pedir code review',
    'programacao',
    'Revisa o trabalho contra o pedido original antes de integrar, apontando o que falta.',
  ),
  skill(
    'anthropic',
    'webapp-testing',
    'Testar apps web',
    'programacao',
    'Testa aplicações web locais com Playwright: navega, clica, tira prints e lê o console.',
  ),
  skill(
    'anthropic',
    'mcp-builder',
    'Criar servidores MCP',
    'programacao',
    'Guia para construir servidores MCP de qualidade (TypeScript ou Python) para integrar APIs.',
  ),
  skill(
    'anthropic',
    'skill-creator',
    'Criar skills',
    'programacao',
    'Ajuda a criar, testar e melhorar novas skills para os seus agentes.',
  ),
  skill(
    'vercel',
    'react-best-practices',
    'React e Next.js: performance',
    'programacao',
    'Regras de performance da Vercel para React e Next.js: dados, renderização e bundle.',
  ),
  skill(
    'vercel',
    'composition-patterns',
    'React: padrões de composição',
    'programacao',
    'Componentes React flexíveis: compound components, contexto e menos props booleanas.',
  ),

  // Design
  skill(
    'anthropic',
    'frontend-design',
    'Design de front-end',
    'design',
    'Interfaces com identidade visual marcante, longe do visual genérico de IA.',
  ),
  skill(
    'vercel',
    'web-design-guidelines',
    'Revisão de interface',
    'design',
    'Audita telas contra as diretrizes de interface da Vercel: acessibilidade, UX e detalhes.',
  ),
  skill(
    'anthropic',
    'theme-factory',
    'Fábrica de temas',
    'design',
    'Aplica temas prontos (cores e fontes) a slides, documentos, páginas e relatórios.',
  ),
  skill(
    'anthropic',
    'algorithmic-art',
    'Arte generativa',
    'design',
    'Cria arte algorítmica com p5.js: padrões, partículas e composições geradas por código.',
  ),

  // Marketing
  skill(
    'marketing',
    'product-marketing',
    'Contexto do produto',
    'marketing',
    'Documenta produto, público e posicionamento uma vez; as outras skills de marketing usam.',
  ),
  skill(
    'marketing',
    'copywriting',
    'Copywriting',
    'marketing',
    'Escreve textos de páginas: home, landing pages, preços e chamadas para ação.',
  ),
  skill(
    'marketing',
    'copy-editing',
    'Revisão de copy',
    'marketing',
    'Revisa e melhora textos de marketing existentes, em várias passadas.',
  ),
  skill(
    'marketing',
    'cro',
    'Conversão de páginas (CRO)',
    'marketing',
    'Diagnostica por que uma página não converte e sugere melhorias e testes.',
  ),
  skill(
    'marketing',
    'seo-audit',
    'Auditoria de SEO',
    'marketing',
    'Analisa SEO técnico e on-page de um site e prioriza o que corrigir.',
  ),
  skill(
    'marketing',
    'ai-seo',
    'SEO para IAs',
    'marketing',
    'Otimiza conteúdo para ser citado por ChatGPT, Perplexity e respostas de IA do Google.',
  ),
  skill(
    'marketing',
    'content-strategy',
    'Estratégia de conteúdo',
    'marketing',
    'Planeja pilares, temas e calendário de conteúdo que trazem tráfego e clientes.',
  ),
  skill(
    'marketing',
    'social',
    'Redes sociais',
    'marketing',
    'Cria e planeja posts para LinkedIn, X, Instagram e TikTok, com reaproveitamento.',
  ),
  skill(
    'marketing',
    'ad-creative',
    'Criativos de anúncios',
    'marketing',
    'Gera variações de títulos, textos e criativos para anúncios pagos.',
  ),
  skill(
    'marketing',
    'emails',
    'E-mail marketing',
    'marketing',
    'Sequências de e-mail: boas-vindas, nutrição, reengajamento e lançamentos.',
  ),
  skill(
    'marketing',
    'launch',
    'Lançamentos',
    'marketing',
    'Planeja o lançamento de produto ou funcionalidade, do pré-lançamento ao pós.',
  ),
  skill(
    'marketing',
    'pricing',
    'Precificação',
    'marketing',
    'Estrutura planos, preços e pacotes; ajuda a decidir quanto e como cobrar.',
  ),
  skill(
    'marketing',
    'marketing-psychology',
    'Psicologia de marketing',
    'marketing',
    'Aplica vieses e modelos mentais (prova social, ancoragem, escassez) com ética.',
  ),
  skill(
    'marketing',
    'marketing-ideas',
    'Ideias de marketing',
    'marketing',
    'Banco com mais de cem ideias de crescimento para escolher conforme o momento.',
  ),

  // Escrita
  skill(
    'anthropic',
    'internal-comms',
    'Comunicação interna',
    'escrita',
    'Atualizações de status, newsletters, FAQs e relatórios internos no formato certo.',
  ),
]

export function skillEntry(id: string): SkillCatalogEntry | undefined {
  return SKILL_CATALOG.find((s) => s.id === id)
}

export function skillFiles(id: string): SkillFile[] {
  return SKILL_FILES[id] ?? []
}

/** Pasta (relativa ao projeto) onde a skill do catálogo é instalada. */
export function skillInstallPath(id: string): string {
  return `./.clawos/skills/${id}`
}

/** Link da skill no GitHub, no commit fixado. */
export function skillSourceUrl(entry: SkillCatalogEntry): string {
  const source = SKILL_SOURCES[entry.source]
  return `https://github.com/${source.repo}/tree/${source.commit}/${entry.dir}`
}
