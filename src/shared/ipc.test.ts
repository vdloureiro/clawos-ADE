import { describe, expectTypeOf, it } from 'vitest'
import type { InvokeArgs, InvokeResult } from './ipc'

describe('contrato IPC', () => {
  it('app:info não recebe argumentos e retorna AppInfo', () => {
    expectTypeOf<InvokeArgs<'app:info'>>().toEqualTypeOf<[]>()
    expectTypeOf<InvokeResult<'app:info'>>().toHaveProperty('version').toBeString()
  })
})
