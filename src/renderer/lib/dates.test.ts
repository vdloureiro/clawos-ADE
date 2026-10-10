import { describe, expect, it } from 'vitest'
import { addDays, dueLabel, isoDate } from './dates'

describe('datas de tarefas', () => {
  it('isoDate e addDays (inclusive virada de mês)', () => {
    expect(isoDate(new Date(2026, 9, 5))).toBe('2026-10-05')
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01')
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31')
  })

  it('rótulos relativos a hoje', () => {
    const today = '2026-10-10' // sábado
    expect(dueLabel('2026-10-10', today)).toEqual({ label: 'Hoje', tone: 'today' })
    expect(dueLabel('2026-10-11', today)).toEqual({ label: 'Amanhã', tone: 'soon' })
    expect(dueLabel('2026-10-13', today)).toEqual({ label: 'terça', tone: 'soon' })
    expect(dueLabel('2026-10-25', today)).toEqual({ label: '25 out', tone: 'later' })
    expect(dueLabel('2026-10-09', today)).toEqual({ label: 'Ontem', tone: 'overdue' })
    expect(dueLabel('2026-09-30', today)).toEqual({ label: '30 set', tone: 'overdue' })
  })
})
