/**
 * Pose machine: auto-knock delay/interval, bump recovery, combo interrupt,
 * session reset, and merit isolation in the exclusive store.
 */
import { describe, expect, it } from 'vitest'
import { resolveMuyuConfig } from '../src/config.ts'
import {
  initialMuyuState, stepMuyu, type MuyuEvent, type MuyuMachineState,
} from '../src/client/muyu-machine.ts'

const tunables = resolveMuyuConfig({
  autoDelayMs: 1000,
  autoIntervalMs: 1000,
  comboThreshold: 5,
  bumpMs: 100,
  bumpBigMs: 80,
})

function step(state: MuyuMachineState, event: MuyuEvent) {
  return stepMuyu(state, event, tunables)
}

describe('resolveMuyuConfig', () => {
  it('fills schema defaults', () => {
    expect(resolveMuyuConfig()).toEqual({
      enabled: true,
      autoDelayMs: 1000,
      autoIntervalMs: 1000,
      autoHitMs: 280,
      comboThreshold: 5,
      bumpMs: 800,
      bumpMaxMs: 2400,
      bumpBigMs: 800,
      bumpBigMaxMs: 2400,
      stickHotspotX: 8,
      stickHotspotY: 28,
      plaque: 'censer',
      artBaseUrl: '',
    })
  })

  it('selects the incense-censer plaque', () => {
    expect(resolveMuyuConfig({ plaque: 'censer' }).plaque).toBe('censer')
  })

  it('keeps an explicit disabled flag', () => {
    expect(resolveMuyuConfig({ enabled: false }).enabled).toBe(false)
  })
})

describe('stepMuyu', () => {
  it('auto-knocks after the busy delay and again on the interval, without combo', () => {
    let { state, meritDelta } = step(initialMuyuState(), { type: 'tick', now: 0, running: true })
    expect(state.pose).toBe('idle')
    expect(meritDelta).toBe(0)

    ;({ state, meritDelta } = step(state, { type: 'tick', now: 1000, running: true }))
    expect(state.pose).toBe('autoHit')
    expect(state.combo).toBe(0)
    expect(meritDelta).toBe(1)

    ;({ state, meritDelta } = step(state, { type: 'tick', now: 1279, running: true }))
    expect(state.pose).toBe('autoHit')
    expect(meritDelta).toBe(0)

    ;({ state, meritDelta } = step(state, { type: 'tick', now: 1280, running: true }))
    expect(state.pose).toBe('idle')
    expect(state.combo).toBe(0)
    expect(meritDelta).toBe(0)

    ;({ state, meritDelta } = step(state, { type: 'tick', now: 1500, running: true }))
    expect(state.pose).toBe('idle')
    expect(meritDelta).toBe(0)

    ;({ state, meritDelta } = step(state, { type: 'tick', now: 2000, running: true }))
    expect(state.pose).toBe('autoHit')
    expect(state.combo).toBe(0)
    expect(meritDelta).toBe(1)
  })

  it('returns to idle when running ends during autoHit', () => {
    let { state } = step(initialMuyuState(), { type: 'tick', now: 0, running: true })
    ;({ state } = step(state, { type: 'tick', now: 1000, running: true }))
    expect(state.pose).toBe('autoHit')
    ;({ state } = step(state, { type: 'tick', now: 1100, running: false }))
    expect(state.pose).toBe('idle')
    expect(state.combo).toBe(0)
  })

  it('returns autoHit to idle when the hold clock is missing', () => {
    let { state } = step(initialMuyuState(), { type: 'tick', now: 0, running: true })
    ;({ state } = step(state, { type: 'tick', now: 1000, running: true }))
    const next = step({ ...state, recoverAt: null }, { type: 'tick', now: 1001, running: true })
    expect(next.state.pose).toBe('idle')
    expect(next.meritDelta).toBe(0)
  })

  it('releases a small bump below the combo threshold, then idle', () => {
    let { state, meritDelta } = step(initialMuyuState(), { type: 'pointerDown', now: 10 })
    expect(state.pose).toBe('manualHit')
    expect(state.combo).toBe(1)
    expect(meritDelta).toBe(1)

    ;({ state, meritDelta } = step(state, { type: 'pointerUp', now: 20 }))
    expect(state.pose).toBe('bump')
    expect(state.recoveryExtraMs).toBe(10)
    expect(meritDelta).toBe(0)

    ;({ state } = step(state, { type: 'tick', now: 129, running: false }))
    expect(state.pose).toBe('bump')
    ;({ state } = step(state, { type: 'tick', now: 130, running: false }))
    expect(state.pose).toBe('idle')
    expect(state.combo).toBe(0)
    expect(state.comboStartedAt).toBeNull()
  })

  it('releases big bump then small bump once combo reaches the threshold', () => {
    let state = initialMuyuState()
    for (let now = 0; now < 5; now += 1) {
      ;({ state } = step(state, { type: 'pointerDown', now }))
      if (now < 4) ({ state } = step(state, { type: 'pointerUp', now }))
    }
    expect(state.combo).toBe(5)
    ;({ state } = step(state, { type: 'pointerUp', now: 50 }))
    expect(state.pose).toBe('bumpBig')
    expect(state.recoveryExtraMs).toBe(50)

    ;({ state } = step(state, { type: 'tick', now: 179, running: false }))
    expect(state.pose).toBe('bumpBig')
    ;({ state } = step(state, { type: 'tick', now: 180, running: false }))
    expect(state.pose).toBe('bump')
    ;({ state } = step(state, { type: 'tick', now: 329, running: false }))
    expect(state.pose).toBe('bump')
    ;({ state } = step(state, { type: 'tick', now: 330, running: false }))
    expect(state.pose).toBe('idle')
  })

  it('lets a further knock interrupt recovery and keep combo', () => {
    let { state } = step(initialMuyuState(), { type: 'pointerDown', now: 0 })
    ;({ state } = step(state, { type: 'pointerUp', now: 1 }))
    expect(state.pose).toBe('bump')
    ;({ state } = step(state, { type: 'pointerDown', now: 2 }))
    expect(state.pose).toBe('manualHit')
    expect(state.combo).toBe(2)
    expect(state.recoverAt).toBeNull()
  })

  it('does not let auto-knock interrupt an in-progress bump', () => {
    const longBump = resolveMuyuConfig({
      autoDelayMs: 1000, autoIntervalMs: 1000, comboThreshold: 5, bumpMs: 5000, bumpBigMs: 80,
    })
    let { state } = stepMuyu(initialMuyuState(), { type: 'tick', now: 0, running: true }, longBump)
    ;({ state } = stepMuyu(state, { type: 'pointerDown', now: 10 }, longBump))
    ;({ state } = stepMuyu(state, { type: 'pointerUp', now: 20 }, longBump))
    expect(state.pose).toBe('bump')
    ;({ state } = stepMuyu(state, { type: 'tick', now: 1000, running: true }, longBump))
    expect(state.pose).toBe('bump')
  })

  it('ignores a second pointerDown and a pointerUp with no press', () => {
    const idle = initialMuyuState()
    expect(step(idle, { type: 'pointerUp', now: 1 }).meritDelta).toBe(0)
    const { state } = step(idle, { type: 'pointerDown', now: 2 })
    const again = step(state, { type: 'pointerDown', now: 3 })
    expect(again.state).toBe(state)
    expect(again.meritDelta).toBe(0)
  })

  it('does not auto-knock while the pointer is down', () => {
    let { state } = step(initialMuyuState(), { type: 'tick', now: 0, running: true })
    ;({ state } = step(state, { type: 'pointerDown', now: 1 }))
    const next = step(state, { type: 'tick', now: 5000, running: true })
    expect(next.state.pose).toBe('manualHit')
    expect(next.meritDelta).toBe(0)
  })

  it('resets pose and combo on session change', () => {
    let { state } = step(initialMuyuState(), { type: 'pointerDown', now: 0 })
    ;({ state } = step(state, { type: 'sessionChange' }))
    expect(state).toEqual(initialMuyuState())
  })

  it('clears the busy wait when running ends before the first auto-knock', () => {
    let { state } = step(initialMuyuState(), { type: 'tick', now: 0, running: true })
    expect(state.waitStartedAt).toBe(0)
    ;({ state } = step(state, { type: 'tick', now: 500, running: false }))
    expect(state.waitStartedAt).toBeNull()
    expect(state.pose).toBe('idle')
  })

  it('lets a knock interrupt a big-bump recovery', () => {
    let state = initialMuyuState()
    for (let now = 0; now < 5; now += 1) {
      ;({ state } = step(state, { type: 'pointerDown', now }))
      if (now < 4) ({ state } = step(state, { type: 'pointerUp', now }))
    }
    ;({ state } = step(state, { type: 'pointerUp', now: 50 }))
    expect(state.pose).toBe('bumpBig')
    ;({ state } = step(state, { type: 'pointerDown', now: 51 }))
    expect(state.pose).toBe('manualHit')
    expect(state.combo).toBe(6)
  })

  it('holds bump longer after a longer manual combo', () => {
    let { state } = step(initialMuyuState(), { type: 'pointerDown', now: 0 })
    ;({ state } = step(state, { type: 'pointerUp', now: 400 }))
    expect(state.recoveryExtraMs).toBe(400)
    ;({ state } = step(state, { type: 'tick', now: 899, running: false }))
    expect(state.pose).toBe('bump')
    ;({ state } = step(state, { type: 'tick', now: 900, running: false }))
    expect(state.pose).toBe('idle')
  })

  it('treats a missing combo start as no extra hold', () => {
    const { state } = step(initialMuyuState(), { type: 'pointerDown', now: 5 })
    const next = step({ ...state, comboStartedAt: null }, { type: 'pointerUp', now: 50 })
    expect(next.state.recoveryExtraMs).toBe(0)
    expect(next.state.recoverAt).toBe(150)
  })

  it('caps each bump stage at its configured ceiling', () => {
    const cap = resolveMuyuConfig({
      bumpMs: 100, bumpMaxMs: 250, bumpBigMs: 80, bumpBigMaxMs: 200, comboThreshold: 5,
    })
    let { state } = stepMuyu(initialMuyuState(), { type: 'pointerDown', now: 0 }, cap)
    ;({ state } = stepMuyu(state, { type: 'pointerUp', now: 1000 }, cap))
    expect(state.pose).toBe('bump')
    expect(state.recoveryExtraMs).toBe(1000)
    expect(state.recoverAt).toBe(1250)

    let streak = initialMuyuState()
    for (let now = 0; now < 5; now += 1) {
      ;({ state: streak } = stepMuyu(streak, { type: 'pointerDown', now }, cap))
      if (now < 4) ({ state: streak } = stepMuyu(streak, { type: 'pointerUp', now }, cap))
    }
    ;({ state: streak } = stepMuyu(streak, { type: 'pointerUp', now: 1000 }, cap))
    expect(streak.pose).toBe('bumpBig')
    expect(streak.recoverAt).toBe(1200)
    ;({ state: streak } = stepMuyu(streak, { type: 'tick', now: 1200, running: false }, cap))
    expect(streak.pose).toBe('bump')
    expect(streak.recoverAt).toBe(1450)
  })

  it('rejects an unhandled event tag', () => {
    expect(() => step(initialMuyuState(), { type: 'nope' } as unknown as MuyuEvent))
      .toThrow(/unhandled muyu event/)
  })
})
