/**
 * Current-session read across the 0.1.6 list (`current`) and the 0.1.7 list
 * (open row held by `retainedBy.mainView`).
 */
import { describe, expect, it } from 'vitest'
import { currentSessionId, currentSessionRunning } from '../src/client/session-list.ts'

describe('currentSessionId', () => {
  it('uses list.current on hosts that still publish it', () => {
    expect(currentSessionId({
      current: 'old',
      byId: {
        other: { id: 'other', retainedBy: { mainView: 1 } },
      },
    })).toBe('old')
  })

  it('reads the main-view row when current is absent', () => {
    expect(currentSessionId({
      byId: {
        idle: { id: 'idle', retainedBy: { mainView: 0 } },
        open: { id: 'open', retainedBy: { mainView: 1 }, running: true },
      },
    })).toBe('open')
  })

  it('is undefined when no session is open', () => {
    expect(currentSessionId({ byId: {} })).toBeUndefined()
    expect(currentSessionId({
      byId: { idle: { id: 'idle', retainedBy: { mainView: 0 } } },
    })).toBeUndefined()
    expect(currentSessionId({})).toBeUndefined()
  })
})

describe('currentSessionRunning', () => {
  it('follows the open session, not some other row', () => {
    const list = {
      byId: {
        open: { id: 'open', retainedBy: { mainView: 1 }, running: false },
        other: { id: 'other', running: true },
      },
    }
    expect(currentSessionRunning(list)).toBe(false)
    expect(currentSessionRunning({
      current: 'old',
      byId: { old: { id: 'old', running: true } },
    })).toBe(true)
  })

  it('is false when nothing is open', () => {
    expect(currentSessionRunning({ byId: {} })).toBe(false)
  })
})
