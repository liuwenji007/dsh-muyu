/**
 * Merit map LRU: cap, keep the session that just scored, treat missing clocks as oldest.
 */
import { describe, expect, it } from 'vitest'
import { resolveMuyuPrefs } from '../src/config.ts'
import {
  MERIT_SESSION_CAP, normalizeMuyuStoreState, pruneMeritMaps,
} from '../src/client/merit-map.ts'

describe('resolveMuyuPrefs', () => {
  it('fills the five user-pref defaults', () => {
    expect(resolveMuyuPrefs()).toEqual({
      enabled: true,
      autoDelayMs: 1000,
      autoIntervalMs: 1000,
      comboThreshold: 5,
      plaque: 'censer',
    })
  })
})

describe('normalizeMuyuStoreState', () => {
  it('rehydrates an old persist blob that only had bySession', () => {
    const next = normalizeMuyuStoreState({ bySession: { a: 3 } })
    expect(next.bySession).toEqual({ a: 3 })
    expect(next.touchedAt).toEqual({})
    expect(next.prefs).toEqual(resolveMuyuPrefs())
  })
})

describe('pruneMeritMaps', () => {
  it('keeps maps at or under the cap unchanged in size', () => {
    const bySession = { a: 1, b: 2 }
    const touchedAt = { a: 10, b: 20 }
    expect(pruneMeritMaps(bySession, touchedAt, 'b', 10).bySession).toEqual(bySession)
  })

  it('drops the oldest sessions and never the keep id', () => {
    const bySession: Record<string, number> = {}
    const touchedAt: Record<string, number> = {}
    for (let i = 0; i < MERIT_SESSION_CAP; i += 1) {
      const id = `old-${i}`
      bySession[id] = 1
      touchedAt[id] = i
    }
    bySession.fresh = 1
    touchedAt.fresh = 10_000
    const next = pruneMeritMaps(bySession, touchedAt, 'fresh')
    expect(Object.keys(next.bySession)).toHaveLength(MERIT_SESSION_CAP)
    expect(next.bySession.fresh).toBe(1)
    expect(next.bySession['old-0']).toBeUndefined()
    expect(next.touchedAt['old-0']).toBeUndefined()
    expect(next.bySession['old-1']).toBe(1)
  })

  it('treats a missing touchedAt as oldest', () => {
    const next = pruneMeritMaps(
      { keep: 1, stale: 9, recent: 2 },
      { keep: 50, recent: 40 },
      'keep',
      2,
    )
    expect(next.bySession).toEqual({ keep: 1, recent: 2 })
    expect(next.touchedAt.stale).toBeUndefined()
  })
})
