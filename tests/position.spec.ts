/**
 * Viewport-edge position math for the wooden-fish overlay.
 */
import { describe, expect, it } from 'vitest'
import {
  applyPointerDelta,
  clampPosition,
  DRAG_COMMIT_PX,
  isCustomPosition,
  roundPosition,
  shouldCommitDrag,
} from '../src/client/position.ts'

describe('isCustomPosition', () => {
  it('is false only when both axes are zero', () => {
    expect(isCustomPosition({ rightPx: 0, bottomPx: 0 })).toBe(false)
    expect(isCustomPosition({ rightPx: 1, bottomPx: 0 })).toBe(true)
    expect(isCustomPosition({ rightPx: 0, bottomPx: -4 })).toBe(true)
  })
})

describe('shouldCommitDrag', () => {
  it('rejects sub-threshold travel so a click does not pin placement', () => {
    expect(shouldCommitDrag(0)).toBe(false)
    expect(shouldCommitDrag(DRAG_COMMIT_PX - 0.1)).toBe(false)
    expect(shouldCommitDrag(DRAG_COMMIT_PX)).toBe(true)
    expect(shouldCommitDrag(DRAG_COMMIT_PX + 10)).toBe(true)
  })
})

describe('roundPosition', () => {
  it('rounds each axis to the nearest integer', () => {
    expect(roundPosition({ rightPx: 4.4, bottomPx: 167.6 }))
      .toEqual({ rightPx: 4, bottomPx: 168 })
  })
})

describe('applyPointerDelta', () => {
  it('decreases right when dragging right, increases bottom when dragging up', () => {
    expect(applyPointerDelta({ rightPx: 40, bottomPx: 80 }, 10, -20))
      .toEqual({ rightPx: 30, bottomPx: 100 })
  })

  it('increases right when dragging left, decreases bottom when dragging down', () => {
    expect(applyPointerDelta({ rightPx: 40, bottomPx: 80 }, -5, 15))
      .toEqual({ rightPx: 45, bottomPx: 65 })
  })
})

describe('clampPosition', () => {
  const viewport = {
    viewportW: 1000,
    viewportH: 800,
    widgetW: 200,
    widgetH: 160,
    minVisiblePx: 24,
  }

  it('leaves an in-range position unchanged', () => {
    expect(clampPosition({ rightPx: 40, bottomPx: 80 }, viewport))
      .toEqual({ rightPx: 40, bottomPx: 80 })
  })

  it('pulls a far-right position back so 24px stay visible', () => {
    expect(clampPosition({ rightPx: 2000, bottomPx: 80 }, viewport))
      .toEqual({ rightPx: 1000 - 24, bottomPx: 80 })
  })

  it('pulls a negative right back so 24px stay on the right edge', () => {
    expect(clampPosition({ rightPx: -500, bottomPx: 80 }, viewport))
      .toEqual({ rightPx: -(200 - 24), bottomPx: 80 })
  })

  it('clamps bottom the same way against the viewport height', () => {
    expect(clampPosition({ rightPx: 40, bottomPx: 5000 }, viewport))
      .toEqual({ rightPx: 40, bottomPx: 800 - 24 })
    expect(clampPosition({ rightPx: 40, bottomPx: -500 }, viewport))
      .toEqual({ rightPx: 40, bottomPx: -(160 - 24) })
  })
})
