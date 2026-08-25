/**
 * layout.json parse / resolve for remix prop placement.
 */
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PROPS_LAYOUT, parseLayoutJson, resolvePropsLayout, serializeLayoutJson,
} from '../src/client/art-layout.ts'

describe('resolvePropsLayout', () => {
  it('returns defaults when partial is missing', () => {
    expect(resolvePropsLayout()).toEqual(DEFAULT_PROPS_LAYOUT)
  })

  it('fills missing plaque skins from defaults', () => {
    const next = resolvePropsLayout({
      hotzone: { top: 5, left: 15, width: 70, height: 40 },
    })
    expect(next.hotzone).toEqual({ top: 5, left: 15, width: 70, height: 40 })
    expect(next.stick).toEqual(DEFAULT_PROPS_LAYOUT.stick)
    expect(next.plaque.censer.text).toEqual(DEFAULT_PROPS_LAYOUT.plaque.censer.text)
  })

  it('clamps out-of-range percentages', () => {
    const next = resolvePropsLayout({
      hotzone: { top: -10, left: 200, width: 50, height: 50 },
    })
    expect(next.hotzone.top).toBe(0)
    expect(next.hotzone.left).toBe(100)
  })
})

describe('parseLayoutJson', () => {
  it('returns null on invalid JSON', () => {
    expect(parseLayoutJson('{')).toBeNull()
  })

  it('parses props and optional stage/fits', () => {
    const text = serializeLayoutJson({
      stage: { width: 100, height: 80 },
      fits: { 'idle.png': { scale: 1, offsetX: 0, offsetY: 0 } },
      props: {
        ...DEFAULT_PROPS_LAYOUT,
        stick: { hotspotX: 4, hotspotY: 12, maxPx: 64 },
      },
    })
    const parsed = parseLayoutJson(text)
    expect(parsed).not.toBeNull()
    expect(parsed?.stage).toEqual({ width: 100, height: 80 })
    expect(parsed?.fits?.['idle.png']).toEqual({ scale: 1, offsetX: 0, offsetY: 0 })
    expect(parsed?.props.stick.maxPx).toBe(64)
  })

  it('accepts props-only layout.json', () => {
    const parsed = parseLayoutJson(JSON.stringify({
      version: 1,
      props: { add: { top: 20, left: 40, maxPx: 48 } },
    }))
    expect(parsed?.stage).toBeUndefined()
    expect(parsed?.props.add.top).toBe(20)
    expect(parsed?.props.hotzone).toEqual(DEFAULT_PROPS_LAYOUT.hotzone)
  })
})
