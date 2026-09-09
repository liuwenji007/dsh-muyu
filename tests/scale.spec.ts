/**
 * Overlay display-scale helpers.
 */
import { describe, expect, it } from 'vitest'
import {
  clampScale, nudgeScale, SCALE_DEFAULT, SCALE_MAX, SCALE_MIN, SCALE_STEP,
} from '../src/client/scale.ts'

describe('clampScale', () => {
  it('keeps values inside the allowed range', () => {
    expect(clampScale(1)).toBe(SCALE_DEFAULT)
    expect(clampScale(0.1)).toBe(SCALE_MIN)
    expect(clampScale(9)).toBe(SCALE_MAX)
  })

  it('rounds to two decimals', () => {
    expect(clampScale(1.049)).toBe(1.05)
  })

  it('falls back for non-finite input', () => {
    expect(clampScale(Number.NaN)).toBe(SCALE_DEFAULT)
  })
})

describe('nudgeScale', () => {
  it('steps by SCALE_STEP and clamps at the edges', () => {
    expect(nudgeScale(1, SCALE_STEP)).toBe(1.1)
    expect(nudgeScale(1, -SCALE_STEP)).toBe(0.9)
    expect(nudgeScale(SCALE_MIN, -SCALE_STEP)).toBe(SCALE_MIN)
    expect(nudgeScale(SCALE_MAX, SCALE_STEP)).toBe(SCALE_MAX)
  })
})
