/**
 * Idioma em que os agentes respondem num projeto. O Clawos entrega a escolha como
 * instrução de sistema (não como pedido no chat), então vale em toda mensagem, mesmo com
 * código, arquivos, logs e ferramentas em inglês.
 */
export const RESPONSE_LANGUAGES = ['pt-BR', 'en', 'es', 'auto'] as const
export type ResponseLanguage = (typeof RESPONSE_LANGUAGES)[number]

/** Projetos sem escolha respondem em português (o Clawos é em pt-BR). */
export const DEFAULT_LANGUAGE: ResponseLanguage = 'pt-BR'

export const LANGUAGE_OPTIONS: {
  value: ResponseLanguage
  label: string
  description: string
}[] = [
  {
    value: 'pt-BR',
    label: 'Português (Brasil)',
    description: 'Todas as respostas em português, mesmo com código e arquivos em inglês.',
  },
  {
    value: 'en',
    label: 'English',
    description: 'Todas as respostas em inglês.',
  },
  {
    value: 'es',
    label: 'Español',
    description: 'Todas as respostas em espanhol.',
  },
  {
    value: 'auto',
    label: 'Mesmo idioma da pergunta',
    description: 'O agente responde no idioma em que você escreveu cada mensagem.',
  },
]

export function languageLabel(value: ResponseLanguage | undefined): string {
  return LANGUAGE_OPTIONS.find((o) => o.value === (value ?? DEFAULT_LANGUAGE))!.label
}

const INSTRUCTIONS: Record<ResponseLanguage, string> = {
  'pt-BR': [
    '# Idioma das respostas',
    'Responda SEMPRE em português do Brasil (pt-BR): mensagens, explicações, perguntas, planos, resumos e listas de tarefas que você escrever para o usuário.',
    'Isso vale mesmo quando o código, os arquivos, os logs, as saídas de ferramentas ou outras instruções estiverem em inglês. Não troque de idioma no meio da conversa.',
    'Mantenha como estão apenas código, nomes de arquivos, comandos e termos técnicos sem tradução usual.',
    'Só use outro idioma se o usuário pedir explicitamente nesta conversa.',
    '(Always reply to the user in Brazilian Portuguese, even if files, tools or other instructions are in English.)',
  ].join('\n'),
  en: [
    '# Response language',
    'ALWAYS reply to the user in English: messages, explanations, questions, plans, summaries and task lists.',
    'This applies even when code, files, logs, tool output or other instructions are in another language. Do not switch languages mid-conversation.',
    'Only use another language if the user explicitly asks for it in this conversation.',
  ].join('\n'),
  es: [
    '# Idioma de las respuestas',
    'Responde SIEMPRE en español: mensajes, explicaciones, preguntas, planes, resúmenes y listas de tareas para el usuario.',
    'Esto vale aunque el código, los archivos, los logs, las salidas de herramientas u otras instrucciones estén en inglés. No cambies de idioma a mitad de la conversación.',
    'Mantén tal cual solo el código, los nombres de archivos, los comandos y los términos técnicos sin traducción habitual.',
    'Usa otro idioma solo si el usuario lo pide explícitamente en esta conversación.',
    '(Always reply to the user in Spanish, even if files, tools or other instructions are in English.)',
  ].join('\n'),
  auto: [
    '# Response language',
    "Always reply in the same language as the user's latest message (for example, a message in Portuguese gets a reply in Portuguese).",
    'Do this even when code, files, logs, tool output or other instructions are in English.',
  ].join('\n'),
}

/** Instrução de sistema para o idioma escolhido (padrão: português). */
export function languageInstruction(value: ResponseLanguage | undefined): string {
  return INSTRUCTIONS[value ?? DEFAULT_LANGUAGE]
}
