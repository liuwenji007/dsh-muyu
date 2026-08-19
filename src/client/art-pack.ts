/**
 * Build a zip of the canonical art-pack filenames for remix / redistribution.
 * Uses packaged sprites (data URLs) so export always works offline.
 * ZIP uses store (no recompress) — PNGs are already compressed.
 */
import {
  ADD_SRC, PLAQUE_SRC, POSE_SRC, STICK_SRC,
} from './assets/poses.ts'

/** Filenames expected by artBaseUrl resolution. */
export const ART_PACK_FILES = [
  'idle.png',
  'auto-hit.png',
  'manual-hit.png',
  'bump.png',
  'bump-big.png',
  'stick.png',
  'board.png',
  'censer.png',
  'add.png',
] as const

const PACK_README = `dsh-muyu art pack
=================

Put these PNGs in one folder (keep the filenames), host the folder on any
static CDN, then paste the folder URL into Settings → Wooden fish →
Custom art base URL.

Required files:
${ART_PACK_FILES.map(name => `- ${name}`).join('\n')}

Leave the base URL empty to use the packaged sprites again.
`

const FILE_TO_SRC: Readonly<Record<(typeof ART_PACK_FILES)[number], string>> = {
  'idle.png': POSE_SRC.idle,
  'auto-hit.png': POSE_SRC.autoHit,
  'manual-hit.png': POSE_SRC.manualHit,
  'bump.png': POSE_SRC.bump,
  'bump-big.png': POSE_SRC.bumpBig,
  'stick.png': STICK_SRC,
  'board.png': PLAQUE_SRC.board,
  'censer.png': PLAQUE_SRC.censer,
  'add.png': ADD_SRC,
}

/**
 * Decode a packaged data URL into bytes.
 * @param src - data: URL from the client bundle.
 */
export function bytesFromSrc(src: string): Uint8Array {
  if (!src.startsWith('data:')) {
    throw new Error('exportArtPack only packs built-in data URLs')
  }
  const comma = src.indexOf(',')
  if (comma < 0) throw new Error('invalid data URL')
  const meta = src.slice(0, comma)
  const body = src.slice(comma + 1)
  if (meta.includes(';base64')) {
    const bin = atob(body)
    const out = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i)
    return out
  }
  return new TextEncoder().encode(decodeURIComponent(body))
}

/** CRC-32 (ISO 3309) for ZIP local/central headers. */
export function crc32(data: Uint8Array): number {
  let crc = 0xffff_ffff
  for (let i = 0; i < data.length; i += 1) {
    crc ^= data[i]!
    for (let bit = 0; bit < 8; bit += 1) {
      const mask = -(crc & 1)
      crc = (crc >>> 1) ^ (0xedb8_8320 & mask)
    }
  }
  return (crc ^ 0xffff_ffff) >>> 0
}

/**
 * Build an uncompressed (store) ZIP from named entries.
 * @param files - basename → file bytes.
 */
export function zipStore(files: Readonly<Record<string, Uint8Array>>): Uint8Array {
  const encoder = new TextEncoder()
  const locals: Uint8Array[] = []
  const centrals: Uint8Array[] = []
  let offset = 0

  for (const [name, data] of Object.entries(files)) {
    const nameBytes = encoder.encode(name)
    const crc = crc32(data)
    const local = new Uint8Array(30 + nameBytes.length + data.length)
    const lv = new DataView(local.buffer)
    lv.setUint32(0, 0x0403_4b50, true)
    lv.setUint16(8, 0, true) // method store
    lv.setUint32(14, crc, true)
    lv.setUint32(18, data.length, true)
    lv.setUint32(22, data.length, true)
    lv.setUint16(26, nameBytes.length, true)
    local.set(nameBytes, 30)
    local.set(data, 30 + nameBytes.length)
    locals.push(local)

    const central = new Uint8Array(46 + nameBytes.length)
    const cv = new DataView(central.buffer)
    cv.setUint32(0, 0x0201_4b50, true)
    cv.setUint16(10, 0, true)
    cv.setUint32(16, crc, true)
    cv.setUint32(20, data.length, true)
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

/**
 * Zip the built-in art pack (template for 二创).
 * @returns zip bytes and suggested download name.
 */
export function buildBuiltinArtPackZip(): { bytes: Uint8Array; filename: string } {
  const files: Record<string, Uint8Array> = {
    'README.txt': new TextEncoder().encode(PACK_README),
  }
  for (const name of ART_PACK_FILES) {
    files[name] = bytesFromSrc(FILE_TO_SRC[name])
  }
  return { bytes: zipStore(files), filename: 'dsh-muyu-art-pack.zip' }
}

/**
 * Trigger a browser download of the built-in art pack.
 */
export function downloadBuiltinArtPack(): void {
  const { bytes, filename } = buildBuiltinArtPackZip()
  const blob = new Blob([bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer], {
    type: 'application/zip',
  })
  const href = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = href
  anchor.download = filename
  anchor.rel = 'noopener'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => { URL.revokeObjectURL(href) }, 1_000)
}
