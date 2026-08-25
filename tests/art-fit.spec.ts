/**
 * Shared crop math for the local-pack workbench.
 */
import { describe, expect, it } from 'vitest'
import {
  centerCopyFit, clampStage, containFit, panFit, zoomFit, ART_PACK_MAX_EDGE,
} from '../src/client/art-fit.ts'

describe('containFit', () => {
  it('centers a wide image in a square stage', () => {
    const fit = containFit(200, 100, { width: 100, height: 100 })
    expect(fit.scale).toBe(0.5)
    expect(fit.offsetX).toBe(0)
    expect(fit.offsetY).toBe(25)
  })

  it('centers a tall image in a square stage', () => {
    const fit = containFit(50, 200, { width: 100, height: 100 })
    expect(fit.scale).toBe(0.5)
    expect(fit.offsetX).toBe(37.5)
    expect(fit.offsetY).toBe(0)
  })
})

describe('zoomFit', () => {
  it('keeps the pivot glued to the same image pixel', () => {
    const fit = { scale: 1, offsetX: 0, offsetY: 0 }
    const next = zoomFit(fit, 2, 10, 20)
    expect(next.scale).toBe(2)
    expect(next.offsetX).toBe(-10)
    expect(next.offsetY).toBe(-20)
  })
})

describe('panFit', () => {
  it('translates in stage pixels', () => {
    const next = panFit({ scale: 1, offsetX: 3, offsetY: 4 }, 2, -1)
    expect(next).toEqual({ scale: 1, offsetX: 5, offsetY: 3 })
  })
})

describe('centerCopyFit', () => {
  it('keeps the stage-space center when source and dest sizes differ', () => {
    const sourceFit = { scale: 0.5, offsetX: 10, offsetY: 20 }
    const sourceSize = { width: 200, height: 100 }
    // source center = (10 + 50, 20 + 25) = (60, 45)
    const dest = centerCopyFit(sourceFit, sourceSize, { width: 100, height: 50 })
    expect(dest.scale).toBe(0.5)
    expect(dest.offsetX).toBe(60 - 25)
    expect(dest.offsetY).toBe(45 - 12.5)
  })

  it('is a no-op when sizes match', () => {
    const sourceFit = { scale: 1, offsetX: 3, offsetY: 4 }
    const size = { width: 80, height: 60 }
    expect(centerCopyFit(sourceFit, size, size)).toEqual(sourceFit)
  })
})

describe('clampStage', () => {
  it('caps edges at ART_PACK_MAX_EDGE', () => {
    expect(clampStage({ width: 4096, height: 100 })).toEqual({
      width: ART_PACK_MAX_EDGE,
      height: 100,
    })
  })
})
