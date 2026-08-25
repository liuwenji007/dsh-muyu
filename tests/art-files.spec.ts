/**
 * Collect art-pack files from folders, loose PNGs, and zip entries.
 */
import { describe, expect, it } from 'vitest'
import { ART_PACK_REQUIRED } from '../src/client/art-pack.ts'
import {
  artPackBasename, collectArtPack, isIgnoredArtPath, isZipArtUrl,
} from '../src/client/art-files.ts'

function png(name: string, path = name): { name: string; blob: Blob } {
  return { name: path, blob: new Blob([name], { type: 'image/png' }) }
}

describe('isZipArtUrl', () => {
  it('detects a zip URL including query strings', () => {
    expect(isZipArtUrl('https://cdn.example/muyu.zip')).toBe(true)
    expect(isZipArtUrl('https://cdn.example/muyu.zip?dl=1')).toBe(true)
    expect(isZipArtUrl('https://cdn.example/muyu.ZIP#pack')).toBe(true)
  })

  it('leaves directory URLs as prefixes', () => {
    expect(isZipArtUrl('https://cdn.example/muyu/')).toBe(false)
    expect(isZipArtUrl('https://cdn.example/muyu')).toBe(false)
    expect(isZipArtUrl('')).toBe(false)
    expect(isZipArtUrl('  ')).toBe(false)
  })
})

describe('artPackBasename', () => {
  it('keeps zip folder prefixes out of the match', () => {
    expect(artPackBasename('skin/idle.png')).toBe('idle.png')
    expect(artPackBasename('skin\\stick.png')).toBe('stick.png')
  })
})

describe('collectArtPack', () => {
  it('accepts required files under a folder prefix', () => {
    const result = collectArtPack(ART_PACK_REQUIRED.map(name => png(name, `skin/${name}`)))
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.names).toContain('idle.png')
      expect(result.files['idle.png']).toBeDefined()
    }
  })

  it('rejects a pack missing a required file', () => {
    const result = collectArtPack(ART_PACK_REQUIRED.slice(1).map(name => png(name)))
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe('missing')
      expect(result.missingRequired).toContain('idle.png')
    }
  })

  it('accepts a partial set when requireComplete is false', () => {
    const result = collectArtPack([png('idle.png'), png('stick.png')], { requireComplete: false })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.names).toEqual(['idle.png', 'stick.png'])
      expect(result.files['idle.png']).toBeDefined()
      expect(result.files['stick.png']).toBeDefined()
    }
  })

  it('still rejects an empty pick when requireComplete is false', () => {
    const result = collectArtPack([png('readme.txt')], { requireComplete: false })
    expect(result.ok).toBe(false)
  })

  it('marks oversized known files as tooLarge when they leave required gaps', () => {
    const huge = new Blob([new Uint8Array(9 * 1024 * 1024)])
    const result = collectArtPack([
      ...ART_PACK_REQUIRED.slice(1).map(name => png(name)),
      { name: 'idle.png', blob: huge },
    ])
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('tooLarge')
  })

  it('ignores macOS junk and optional recover can be omitted', () => {
    const result = collectArtPack([
      ...ART_PACK_REQUIRED.map(name => png(name)),
      png('idle.png', '__MACOSX/idle.png'),
      png('idle.png', '._idle.png'),
    ])
    expect(result.ok).toBe(true)
    expect(isIgnoredArtPath('__MACOSX/idle.png')).toBe(true)
  })
})
