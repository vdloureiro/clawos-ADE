import { describe, expect, it } from 'vitest'
import { EditTracker } from './EditTracker'

describe('EditTracker', () => {
  it('avisa uma vez por arquivo e par de sessões', () => {
    const tracker = new EditTracker()
    expect(tracker.record('/p/a.ts', 's1')).toEqual([])
    expect(tracker.record('/p/a.ts', 's1')).toEqual([])
    expect(tracker.record('/p/a.ts', 's2')).toEqual(['s1'])
    expect(tracker.record('/p/a.ts', 's2')).toEqual([])
    expect(tracker.record('/p/a.ts', 's1')).toEqual([])
    expect(tracker.record('/p/b.ts', 's2')).toEqual([])
    expect(tracker.record('/p/a.ts', 's3')).toEqual(['s1', 's2'])
  })

  it('esquece sessões encerradas', () => {
    const tracker = new EditTracker()
    tracker.record('/p/a.ts', 's1')
    tracker.forget('s1')
    expect(tracker.record('/p/a.ts', 's2')).toEqual([])
  })
})
