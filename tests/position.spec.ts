/**
 * Viewport-edge position math for the wooden-fish overlay.
 */
import { describe, expect, it } from 'vitest'
import {
  applyPointerDelta,
  clampPosition,
  composerPosition,
  DRAG_COMMIT_PX,
  isCustomPosition,
  pickAnchoredPosition,
  positionStyle,
  roundPosition,
  shouldCommitDrag,
  transformOriginFor,
} from '../src/client/position.ts'

describe('isCustomPosition', () => {
  it('is false only for the composer default (right/bottom 0)', () => {
    expect(isCustomPosition(composerPosition())).toBe(false)
    expect(isCustomPosition({ xEdge: 'right', xPx: 1, yEdge: 'bottom', yPx: 0 })).toBe(true)
    expect(isCustomPosition({ xEdge: 'left', xPx: 0, yEdge: 'bottom', yPx: 100 })).toBe(true)
    expect(isCustomPosition({ xEdge: 'right', xPx: 0, yEdge: 'top', yPx: 0 })).toBe(true)
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
  it('rounds each axis offset to the nearest integer', () => {
    expect(roundPosition({ xEdge: 'right', xPx: 4.4, yEdge: 'bottom', yPx: 167.6 }))
      .toEqual({ xEdge: 'right', xPx: 4, yEdge: 'bottom', yPx: 168 })
  })
})

describe('applyPointerDelta', () => {
  it('decreases right when dragging right, increases bottom when dragging up', () => {
    expect(applyPointerDelta({ xEdge: 'right', xPx: 40, yEdge: 'bottom', yPx: 80 }, 10, -20))
      .toEqual({ xEdge: 'right', xPx: 30, yEdge: 'bottom', yPx: 100 })
  })

  it('increases left when dragging right, increases top when dragging down', () => {
    expect(applyPointerDelta({ xEdge: 'left', xPx: 40, yEdge: 'top', yPx: 80 }, 10, 15))
      .toEqual({ xEdge: 'left', xPx: 50, yEdge: 'top', yPx: 95 })
  })
})

describe('pickAnchoredPosition', () => {
  it('anchors to the nearer horizontal and vertical edges', () => {
    // rect near top-left of a 1000x800 viewport
    expect(pickAnchoredPosition({ left: 40, right: 240, top: 60, bottom: 220 }, 1000, 800))
      .toEqual({ xEdge: 'left', xPx: 40, yEdge: 'top', yPx: 60 })
  })

  it('anchors to right/bottom when closer to those edges', () => {
    expect(pickAnchoredPosition({ left: 760, right: 960, top: 600, bottom: 760 }, 1000, 800))
      .toEqual({ xEdge: 'right', xPx: 40, yEdge: 'bottom', yPx: 40 })
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

  it('leaves an in-range right/bottom position unchanged', () => {
    expect(clampPosition({ xEdge: 'right', xPx: 40, yEdge: 'bottom', yPx: 80 }, viewport))
      .toEqual({ xEdge: 'right', xPx: 40, yEdge: 'bottom', yPx: 80 })
  })

  it('clamps a left-anchored position without converting it to right', () => {
    expect(clampPosition({ xEdge: 'left', xPx: -500, yEdge: 'bottom', yPx: 80 }, viewport))
      .toEqual({ xEdge: 'left', xPx: -(200 - 24), yEdge: 'bottom', yPx: 80 })
  })

  it('keeps left anchor when the viewport shrinks (screen zoom / resize)', () => {
    const leftSide = { xEdge: 'left' as const, xPx: 40, yEdge: 'bottom' as const, yPx: 80 }
    const shrunk = { ...viewport, viewportW: 500, viewportH: 400 }
    expect(clampPosition(leftSide, shrunk))
      .toEqual({ xEdge: 'left', xPx: 40, yEdge: 'bottom', yPx: 80 })
  })

  it('keeps an intentional right anchor when the viewport shrinks past center', () => {
    // rightPx=800 on a 2000-wide view sits left of center; after shrink it is
    // nearer the left, but clamp must not rewrite the edge (widget layer owns that).
    const intentionalRight = { xEdge: 'right' as const, xPx: 800, yEdge: 'bottom' as const, yPx: 80 }
    const shrunk = { ...viewport, viewportW: 1400, viewportH: 800 }
    expect(clampPosition(intentionalRight, shrunk))
      .toEqual({ xEdge: 'right', xPx: 800, yEdge: 'bottom', yPx: 80 })
  })

  it('pulls a far-right position back so 24px stay visible', () => {
    expect(clampPosition({ xEdge: 'right', xPx: 2000, yEdge: 'bottom', yPx: 80 }, viewport))
      .toEqual({ xEdge: 'right', xPx: 1000 - 24, yEdge: 'bottom', yPx: 80 })
  })

  it('pulls a negative right back so 24px stay on the right edge', () => {
    expect(clampPosition({ xEdge: 'right', xPx: -500, yEdge: 'bottom', yPx: 80 }, viewport))
      .toEqual({ xEdge: 'right', xPx: -(200 - 24), yEdge: 'bottom', yPx: 80 })
  })

  it('clamps bottom the same way against the viewport height', () => {
    expect(clampPosition({ xEdge: 'right', xPx: 40, yEdge: 'bottom', yPx: 5000 }, viewport))
      .toEqual({ xEdge: 'right', xPx: 40, yEdge: 'bottom', yPx: 800 - 24 })
    expect(clampPosition({ xEdge: 'right', xPx: 40, yEdge: 'bottom', yPx: -500 }, viewport))
      .toEqual({ xEdge: 'right', xPx: 40, yEdge: 'bottom', yPx: -(160 - 24) })
  })
})

describe('positionStyle + transformOriginFor', () => {
  it('emits left/top CSS for a left/top anchor and matching transform origin', () => {
    const pos = { xEdge: 'left' as const, xPx: 40, yEdge: 'top' as const, yPx: 60 }
    expect(positionStyle(pos)).toEqual({
      left: '40px',
      right: 'auto',
      top: '60px',
      bottom: 'auto',
    })
    expect(transformOriginFor(pos)).toBe('top left')
  })

  it('emits right/bottom CSS for a right/bottom anchor', () => {
    const pos = { xEdge: 'right' as const, xPx: 12, yEdge: 'bottom' as const, yPx: 80 }
    expect(positionStyle(pos)).toEqual({
      left: 'auto',
      right: '12px',
      top: 'auto',
      bottom: '80px',
    })
    expect(transformOriginFor(pos)).toBe('bottom right')
  })
})
