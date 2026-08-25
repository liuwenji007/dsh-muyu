/**
 * ZIP store + CRC helpers for the art-pack exporter, and unzip round-trip.
 */
import { deflateRawSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { ART_PACK_FILES, crc32, zipStore } from '../src/client/art-pack.ts'
import { collectArtPackFromZip } from '../src/client/art-files.ts'
import {
  ART_PACK_MAX_UNCOMPRESSED_ENTRY, unzip,
} from '../src/client/art-zip.ts'

describe('zipStore', () => {
  it('builds a zip whose local header names the entry', () => {
    const payload = new TextEncoder().encode('hello')
    const zip = zipStore({ 'README.txt': payload })
    expect(zip[0]).toBe(0x50)
    expect(zip[1]).toBe(0x4b)
    expect(crc32(payload)).toBe(crc32(payload))
    const asText = new TextDecoder().decode(zip)
    expect(asText.includes('README.txt')).toBe(true)
    expect(asText.includes('hello')).toBe(true)
  })
})

describe('unzip', () => {
  it('reads a store zip back to the original bytes', async () => {
    const payload = new Uint8Array([7, 8, 9, 10])
    const zip = zipStore({ 'skin/idle.png': payload, 'README.txt': new TextEncoder().encode('hi') })
    const entries = await unzip(zip)
    expect(Array.from(entries['skin/idle.png'] ?? [])).toEqual([7, 8, 9, 10])
    expect(new TextDecoder().decode(entries['README.txt'])).toBe('hi')
  })

  it('inflates method-8 entries', async () => {
    const payload = new TextEncoder().encode('deflate-me-please')
    const zip = zipDeflate({ 'note.txt': payload })
    const entries = await unzip(zip)
    expect(new TextDecoder().decode(entries['note.txt'])).toBe('deflate-me-please')
  })

  it('rejects an entry whose uncompressed size exceeds the cap', async () => {
    const oversized = new Uint8Array(ART_PACK_MAX_UNCOMPRESSED_ENTRY + 1)
    await expect(unzip(zipStore({ 'bomb.png': oversized }))).rejects.toThrow(/too large/)
  })
})

describe('collectArtPackFromZip', () => {
  it('accepts a zip whose entries use the canonical filenames', async () => {
    const files: Record<string, Uint8Array> = {
      'README.txt': new TextEncoder().encode('hi'),
    }
    for (const name of ART_PACK_FILES) {
      files[`skin/${name}`] = new TextEncoder().encode(name)
    }
    const pack = await collectArtPackFromZip(zipStore(files))
    expect(pack.ok).toBe(true)
    if (pack.ok) {
      for (const name of ART_PACK_FILES) {
        expect(pack.files[name]).toBeDefined()
      }
    }
  })

  it('rejects when the zip itself is over the compressed-byte cap', async () => {
    const huge = new Uint8Array(33 * 1024 * 1024)
    const pack = await collectArtPackFromZip(huge)
    expect(pack.ok).toBe(false)
    if (!pack.ok) expect(pack.reason).toBe('tooLarge')
  })

  it('rejects when an entry exceeds the uncompressed cap', async () => {
    const oversized = new Uint8Array(ART_PACK_MAX_UNCOMPRESSED_ENTRY + 1)
    const pack = await collectArtPackFromZip(zipStore({ 'idle.png': oversized }))
    expect(pack.ok).toBe(false)
    if (!pack.ok) expect(pack.reason).toBe('tooLarge')
  })
})

/** Minimal deflate zip for tests (method 8, no extra fields). */
function zipDeflate(files: Readonly<Record<string, Uint8Array>>): Uint8Array {
  const encoder = new TextEncoder()
  const locals: Uint8Array[] = []
  const centrals: Uint8Array[] = []
  let offset = 0

  for (const [name, data] of Object.entries(files)) {
    const nameBytes = encoder.encode(name)
    const compressed = deflateRawSync(data)
    const crc = crc32(data)
    const local = new Uint8Array(30 + nameBytes.length + compressed.length)
    const lv = new DataView(local.buffer)
    lv.setUint32(0, 0x0403_4b50, true)
    lv.setUint16(8, 8, true)
    lv.setUint32(14, crc, true)
    lv.setUint32(18, compressed.length, true)
    lv.setUint32(22, data.length, true)
    lv.setUint16(26, nameBytes.length, true)
    local.set(nameBytes, 30)
    local.set(compressed, 30 + nameBytes.length)
    locals.push(local)

    const central = new Uint8Array(46 + nameBytes.length)
    const cv = new DataView(central.buffer)
    cv.setUint32(0, 0x0201_4b50, true)
    cv.setUint16(10, 8, true)
    cv.setUint32(16, crc, true)
    cv.setUint32(20, compressed.length, true)
    cv.setUint32(24, data.length, true)
    cv.setUint16(28, nameBytes.length, true)
    cv.setUint32(42, offset, true)
    central.set(nameBytes, 46)
    centrals.push(central)

    offset += local.length
  }

  const centralSize = centrals.reduce((sum, part) => sum + part.length, 0)
  const end = new Uint8Array(22)
  const ev = new DataView(end.buffer)
  ev.setUint32(0, 0x0605_4b50, true)
  ev.setUint16(8, centrals.length, true)
  ev.setUint16(10, centrals.length, true)
  ev.setUint32(12, centralSize, true)
  ev.setUint32(16, offset, true)

  const total = offset + centralSize + end.length
  const out = new Uint8Array(total)
  let at = 0
  for (const part of locals) {
    out.set(part, at)
    at += part.length
  }
  for (const part of centrals) {
    out.set(part, at)
    at += part.length
  }
  out.set(end, at)
  return out
}
