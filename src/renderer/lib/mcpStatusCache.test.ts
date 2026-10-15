import { describe, expect, it } from 'vitest'
import { MCP_STATUS_FRESH_MS, mcpStatusOnOpen, storeMcpStatus } from './mcpStatusCache'

const server = { command: 'npx', args: ['-y', 'pkg'] }

describe('cache de status dos MCPs', () => {
  it('sem histórico: testa mostrando o progresso', () => {
    expect(mcpStatusOnOpen('p1', 'novo', server, Date.now())).toEqual({
      show: null,
      retest: true,
      silent: false,
    })
  })

  it('conectado há pouco: abre já conectado, sem testar', () => {
    storeMcpStatus('p1', 'supabase', server, { state: 'ok', tools: 20 })
    const open = mcpStatusOnOpen('p1', 'supabase', server, Date.now())
    expect(open.show?.status).toEqual({ state: 'ok', tools: 20 })
    expect(open.retest).toBe(false)
  })

  it('conectado há muito tempo: confere em segundo plano, sem "Conectando…"', () => {
    storeMcpStatus('p1', 'vercel', server, { state: 'ok', tools: 5 })
    const later = Date.now() + MCP_STATUS_FRESH_MS + 1
    expect(mcpStatusOnOpen('p1', 'vercel', server, later)).toMatchObject({
      retest: true,
      silent: true,
    })
  })

  it('falhou ou mudou a configuração: testa de novo', () => {
    storeMcpStatus('p1', 'github', server, { state: 'error', error: 'x' })
    expect(mcpStatusOnOpen('p1', 'github', server, Date.now())).toMatchObject({
      retest: true,
      silent: false,
    })
    storeMcpStatus('p1', 'linear', server, { state: 'ok', tools: 1 })
    expect(
      mcpStatusOnOpen('p1', 'linear', { command: 'npx', args: ['-y', 'outro'] }, Date.now()),
    ).toMatchObject({ show: null, retest: true })
  })
})
