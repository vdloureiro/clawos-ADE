import { describe, expect, it } from 'vitest'
import { commandText, filterCommands, slashQuery } from './slashCommands'

describe('menu de comandos /', () => {
  it('abre só enquanto se digita o nome do comando', () => {
    expect(slashQuery('/')).toBe('')
    expect(slashQuery('/Comp')).toBe('comp')
    expect(slashQuery('/compact agora')).toBeNull()
    expect(slashQuery('oi /mcp')).toBeNull()
  })

  it('o /mcp do Clawos substitui o do agente; quem começa com o termo vem primeiro', () => {
    const agent = [
      { name: 'mcp', description: 'do agente' },
      { name: 'compact', description: 'resume' },
      { name: 'review-pr', description: 'revisa' },
      { name: 'pr-comments', description: 'comentários' },
    ]
    expect(filterCommands(agent, '').map((c) => c.name)).toEqual([
      'mcp',
      'compact',
      'review-pr',
      'pr-comments',
    ])
    expect(filterCommands(agent, 'mcp')[0]).toMatchObject({ name: 'mcp', clawos: true })
    expect(filterCommands(agent, 'pr').map((c) => c.name)).toEqual(['pr-comments', 'review-pr'])
  })
  it('skills do Codex ($nome) são inseridas sem a barra', () => {
    const skill = { name: '$firecrawl', description: 'busca' }
    expect(commandText(skill)).toBe('$firecrawl')
    expect(commandText({ name: 'compact', description: '' })).toBe('/compact')
    expect(filterCommands([skill], 'fire')[0]?.name).toBe('$firecrawl')
  })
})
