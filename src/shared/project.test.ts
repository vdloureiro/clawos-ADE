import { describe, expect, it } from 'vitest'
import { projectConfigSchema, resolveSecrets, secretRefs } from './project'

describe('project.yaml', () => {
  it('aceita o exemplo da especificação', () => {
    const parsed = projectConfigSchema.safeParse({
      name: 'DraLab',
      defaultAgent: 'claude',
      instructions: './CLAUDE.md',
      skills: ['./.clawos/skills/revisao-pr'],
      mcpServers: {
        supabase: {
          command: 'npx',
          args: ['-y', '@supabase/mcp-server-supabase', '--project-ref=xxxx'],
          env: { SUPABASE_ACCESS_TOKEN: '${secret:supabase_token}' },
        },
      },
      agents: { claude: { enabled: true }, codex: { enabled: true }, gemini: { enabled: false } },
    })
    expect(parsed.success).toBe(true)
  })

  it('rejeita MCP sem comando nem url', () => {
    expect(projectConfigSchema.safeParse({ mcpServers: { x: { args: [] } } }).success).toBe(false)
  })
})

describe('segredos', () => {
  it('lista e resolve referências', () => {
    expect(secretRefs('a ${secret:x} b ${secret:y-z}')).toEqual(['x', 'y-z'])
    expect(resolveSecrets('Bearer ${secret:x}', () => 'v')).toBe('Bearer v')
    expect(() => resolveSecrets('${secret:x}', () => null)).toThrow(/x/)
  })
})
