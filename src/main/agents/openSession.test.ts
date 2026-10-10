import { describe, expect, it, vi } from 'vitest'
import { isSessionNotFound, openSession } from './openSession'

const notFound = Object.assign(new Error('Resource not found: abc'), { code: -32002 })

describe('openSession', () => {
  it('sem sessão anterior: cria uma nova', async () => {
    const create = vi.fn(async () => ({ sessionId: 'nova' }))
    expect(await openSession(null, { resume: vi.fn(), create })).toEqual({
      sessionId: 'nova',
      contextLost: false,
      created: true,
    })
  })

  it('retoma a sessão anterior quando o agente a conhece', async () => {
    const resume = vi.fn(async () => ({}))
    const create = vi.fn()
    expect(await openSession('abc', { resume, create })).toEqual({
      sessionId: 'abc',
      contextLost: false,
      created: false,
    })
    expect(resume).toHaveBeenCalledWith('abc')
    expect(create).not.toHaveBeenCalled()
  })

  it('sessão desconhecida pelo agente (Resource not found): cria uma nova em vez de falhar', async () => {
    const resume = vi.fn(async () => {
      throw notFound
    })
    const create = vi.fn(async () => ({ sessionId: 'nova' }))
    expect(await openSession('abc', { resume, create })).toEqual({
      sessionId: 'nova',
      contextLost: true,
      created: true,
    })
  })

  it('usa session/load quando não há resume', async () => {
    const load = vi.fn(async () => ({}))
    expect(await openSession('abc', { load, create: vi.fn() })).toMatchObject({
      sessionId: 'abc',
      created: false,
    })
  })

  it('agente sem resume nem load: nova sessão, contexto perdido', async () => {
    expect(await openSession('abc', { create: async () => ({ sessionId: 'n' }) })).toEqual({
      sessionId: 'n',
      contextLost: true,
      created: true,
    })
  })

  it('outros erros na retomada continuam sendo erros', async () => {
    const resume = vi.fn(async () => {
      throw new Error('falha de rede')
    })
    await expect(openSession('abc', { resume, create: vi.fn() })).rejects.toThrow('falha de rede')
  })
})

describe('isSessionNotFound', () => {
  it('reconhece pelo código ou pela mensagem', () => {
    expect(isSessionNotFound(notFound)).toBe(true)
    expect(isSessionNotFound({ message: 'Session not found' })).toBe(true)
    expect(isSessionNotFound(new Error('outra coisa'))).toBe(false)
    expect(isSessionNotFound(null)).toBe(false)
  })
})
