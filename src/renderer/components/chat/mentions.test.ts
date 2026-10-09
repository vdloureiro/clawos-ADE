import { describe, expect, it } from 'vitest'
import { filterFiles, mentionAt } from './mentions'

describe('mentionAt', () => {
  it('detecta @ no início e após espaço, mas não em e-mails', () => {
    expect(mentionAt('@src/a', 6)).toEqual({ start: 0, end: 6, query: 'src/a' })
    expect(mentionAt('veja @aut', 9)).toEqual({ start: 5, end: 9, query: 'aut' })
    expect(mentionAt('a@b.com', 7)).toBeNull()
    expect(mentionAt('veja @aut e mais', 16)).toBeNull()
  })
})

describe('filterFiles', () => {
  const files = ['src/auth/login.ts', 'src/app.ts', 'docs/authoring.md', 'src/components/Auth.tsx']
  it('prioriza nome do arquivo que começa com o termo', () => {
    expect(filterFiles(files, 'auth')).toEqual([
      'docs/authoring.md',
      'src/components/Auth.tsx',
      'src/auth/login.ts',
    ])
  })
  it('aceita subsequência', () => {
    expect(filterFiles(files, 'sapp')).toEqual(['src/app.ts'])
  })
})
