import { describe, expect, it } from 'vitest'
import { relativize } from './ToolCallCard'

describe('relativize', () => {
  it('remove o prefixo da pasta da sessão', () => {
    expect(relativize('npx tsx /w/proj/hello.ts', '/w/proj')).toBe('npx tsx hello.ts')
    expect(relativize('Read /outro/a.ts', '/w/proj')).toBe('Read /outro/a.ts')
  })
})
