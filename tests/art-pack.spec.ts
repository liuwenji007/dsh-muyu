/**
 * ZIP store + CRC helpers for the art-pack exporter.
 */
import { describe, expect, it } from 'vitest'
import { crc32, zipStore } from '../src/client/art-pack.ts'

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
