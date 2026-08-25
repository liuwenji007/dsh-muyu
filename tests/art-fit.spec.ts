/**
 * Shared crop math for the local-pack workbench.
 */
import { describe, expect, it } from 'vitest'
import { containFit, panFit, zoomFit } from '../src/client/art-fit.ts'

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
