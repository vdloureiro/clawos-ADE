import type { SlashCommand } from '@shared/types'

/** Comandos que o próprio Clawos atende (abrem uma tela em vez de ir para o agente). */
export const CLAWOS_COMMANDS: (SlashCommand & { clawos: true })[] = [
  {
    name: 'mcp',
    description: 'Ver os MCPs desta conversa: status, login e reconectar',
    clawos: true,
  },
]

export type MenuCommand = SlashCommand & { clawos?: boolean }

/** Como o comando é digitado: skills do Codex são "$nome"; o resto é "/nome". */
export function commandText(command: SlashCommand): string {
  return command.name.startsWith('$') ? command.name : `/${command.name}`
}

/** Texto digitado é só "/algo" (ainda sem espaço): mostra o menu filtrado por "algo". */
export function slashQuery(text: string): string | null {
  const match = /^\/([^\s/]*)$/.exec(text)
  return match ? match[1]!.toLowerCase() : null
}

/** Comandos do Clawos + os do agente, filtrados: quem começa com o termo vem primeiro. */
export function filterCommands(agent: SlashCommand[], query: string): MenuCommand[] {
  const ours = new Set(CLAWOS_COMMANDS.map((c) => c.name))
  const all: MenuCommand[] = [...CLAWOS_COMMANDS, ...agent.filter((c) => !ours.has(c.name))]
  const key = (c: SlashCommand) => c.name.replace(/^\$/, '').toLowerCase()
  const starts = all.filter((c) => key(c).startsWith(query))
  const contains = all.filter((c) => !key(c).startsWith(query) && key(c).includes(query))
  return [...starts, ...contains].slice(0, 50)
}
