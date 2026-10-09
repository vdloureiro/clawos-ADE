/**
 * Agentes suportados e dados de exibição. Para adicionar um agente compatível com ACP:
 * 1. inclua o id aqui;
 * 2. descreva como iniciá-lo em `main/agents/registry.ts`;
 * 3. (opcional) um compilador próprio em `main/compiler/` — sem ele, os MCPs do projeto
 *    vão pelo `session/new` do ACP e o resto fica com o comportamento nativo do agente.
 */
export const AGENT_IDS = ['claude', 'codex', 'gemini'] as const

export type AgentId = (typeof AGENT_IDS)[number]

export interface AgentMeta {
  id: AgentId
  name: string
  /** Letra e cor do ícone na interface. */
  letter: string
  color: string
}

export const AGENT_META: Record<AgentId, AgentMeta> = {
  claude: { id: 'claude', name: 'Claude', letter: 'C', color: '#d97757' },
  codex: { id: 'codex', name: 'Codex', letter: 'X', color: '#10a37f' },
  gemini: { id: 'gemini', name: 'Gemini', letter: 'G', color: '#4285f4' },
}

export function isAgentId(value: string): value is AgentId {
  return (AGENT_IDS as readonly string[]).includes(value)
}
