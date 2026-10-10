import { describe, expect, it } from 'vitest'
import { prettyModelId } from './ConfigPickers'

describe('prettyModelId', () => {
  it('deixa legível o id cru de modelos do Claude', () => {
    expect(prettyModelId('claude-opus-4-6')).toBe('Opus 4.6')
    expect(prettyModelId('claude-sonnet-5-5-20260301')).toBe('Sonnet 5.5')
    expect(prettyModelId('claude-opus-4-6[1m]')).toBe('Opus 4.6 (1M)')
    expect(prettyModelId('claude-haiku-5')).toBe('Haiku 5')
  })
  it('mantém outros ids', () => {
    expect(prettyModelId('gpt-6-astra')).toBe('gpt-6-astra')
  })
})
