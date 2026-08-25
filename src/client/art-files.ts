/**
 * Collect and validate a muyu art pack from loose files or zip entries.
 * Matching is by basename so `skin/idle.png` still counts.
 */
import {
  ART_PACK_FILES, ART_PACK_REQUIRED, type ArtPackFile,
} from './art-pack.ts'
import { ART_PACK_MAX_EDGE, blobSize } from './art-fit.ts'
import { unzip } from './art-zip.ts'

/** Reject a single sprite larger than this (compressed bytes). */
export const ART_PACK_MAX_FILE_BYTES = 8 * 1024 * 1024

/** Reject a zip larger than this before parsing (compressed bytes). */
export const ART_PACK_MAX_ZIP_BYTES = 32 * 1024 * 1024

const PACK_NAME_SET: ReadonlySet<string> = new Set(ART_PACK_FILES)

/** Basename of a zip or folder path, ignoring junk prefixes. */
export function artPackBasename(path: string): string {
  const normalized = path.replace(/\\/g, '/').replace(/\/+$/, '')
  const parts = normalized.split('/')
  return parts[parts.length - 1] ?? ''
}

/**
 * Skip macOS resource forks and hidden junk inside a zip or folder.
 * @param path - entry path or file name.
 */
export function isIgnoredArtPath(path: string): boolean {
  const normalized = path.replace(/\\/g, '/')
  if (normalized.startsWith('__MACOSX/') || normalized.includes('/__MACOSX/')) return true
  const base = artPackBasename(normalized)
  return base.startsWith('.') || base.startsWith('._')
}

/**
 * Whether a remote art URL should be fetched as a zip instead of a directory prefix.
 * @param base - user-supplied URL, possibly with query/hash.
 */
export function isZipArtUrl(base: string | undefined): boolean {
  const trimmed = base?.trim() ?? ''
  if (trimmed === '') return false
  const path = trimmed.split(/[?#]/, 1)[0] ?? trimmed
  return path.toLowerCase().endsWith('.zip')
}

export type ArtPackBlobs = Partial<Record<ArtPackFile, Blob>>

export type CollectArtPackFailReason = 'missing' | 'tooLarge' | 'notImage'

export type CollectArtPackResult =
  | { ok: true; files: Partial<Record<ArtPackFile, Blob>>; names: ArtPackFile[] }
  | {
    ok: false
    reason: CollectArtPackFailReason
    missingRequired: Array<(typeof ART_PACK_REQUIRED)[number]>
    names: string[]
  }

function fail(
  reason: CollectArtPackFailReason,
  missingRequired: Array<(typeof ART_PACK_REQUIRED)[number]> = [...ART_PACK_REQUIRED],
  names: string[] = [],
): CollectArtPackResult {
  return { ok: false, reason, missingRequired, names }
}

/**
 * Keep known art filenames from a file list. Required names must all be present.
 * @param inputs - zip entries or `<input type="file">` items.
 */
export function collectArtPack(
  inputs: ReadonlyArray<{ name: string; blob: Blob }>,
): CollectArtPackResult {
  const files: Partial<Record<ArtPackFile, Blob>> = {}
  const names: ArtPackFile[] = []
  let sawTooLarge = false
  for (const input of inputs) {
    if (isIgnoredArtPath(input.name)) continue
    const base = artPackBasename(input.name)
    if (!PACK_NAME_SET.has(base)) continue
    if (input.blob.size > ART_PACK_MAX_FILE_BYTES) {
      sawTooLarge = true
      continue
    }
    const key = base as ArtPackFile
    files[key] = input.blob
    if (!names.includes(key)) names.push(key)
  }
  const missingRequired = ART_PACK_REQUIRED.filter(name => files[name] === undefined)
  if (missingRequired.length > 0) {
    return fail(sawTooLarge ? 'tooLarge' : 'missing', missingRequired, names)
  }
  return { ok: true, files, names }
}

function bytesToPngBlob(data: Uint8Array): Blob {
  const copy = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer
  return new Blob([copy], { type: 'image/png' })
}

/**
 * Copy picker/zip blobs into independent PNG Blobs and verify they decode
 * within the pixel cap. Chrome can drop directory-picker File handles after restart.
 * @param files - collected pack blobs (may still be live File handles).
 */
export async function freezeArtBlobs(
  files: Partial<Record<ArtPackFile, Blob>>,
): Promise<CollectArtPackResult> {
  const next: Partial<Record<ArtPackFile, Blob>> = {}
  const names: ArtPackFile[] = []
  let notImage = false
  let tooLarge = false

  for (const [name, blob] of Object.entries(files)) {
    if (!(blob instanceof Blob)) continue
    const key = name as ArtPackFile
    try {
      const buffer = new Uint8Array(await blob.arrayBuffer())
      if (buffer.byteLength > ART_PACK_MAX_FILE_BYTES) {
        tooLarge = true
        continue
      }
      const frozen = new Blob([buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer], {
        type: 'image/png',
      })
      const size = await blobSize(frozen)
      if (size.width <= 0 || size.height <= 0) {
        notImage = true
        continue
      }
      if (size.width > ART_PACK_MAX_EDGE || size.height > ART_PACK_MAX_EDGE) {
        tooLarge = true
        continue
      }
      next[key] = frozen
      names.push(key)
    } catch {
      notImage = true
    }
  }

  const missingRequired = ART_PACK_REQUIRED.filter(name => next[name] === undefined)
  if (missingRequired.length > 0) {
    const reason: CollectArtPackFailReason = tooLarge ? 'tooLarge' : notImage ? 'notImage' : 'missing'
    return fail(reason, missingRequired, names)
  }
  return { ok: true, files: next, names }
}

/**
 * Unpack a zip and keep known art filenames.
 * Caller should {@link freezeArtBlobs} before IndexedDB or object URLs.
 * @param bytes - zip file bytes (store or deflate).
 */
export async function collectArtPackFromZip(bytes: Uint8Array): Promise<CollectArtPackResult> {
  if (bytes.byteLength > ART_PACK_MAX_ZIP_BYTES) {
    return fail('tooLarge')
  }
  try {
    const entries = await unzip(bytes)
    return collectArtPack(
      Object.entries(entries).map(([name, data]) => ({ name, blob: bytesToPngBlob(data) })),
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message.includes('too large') || message.includes('zip entry too large') || message.includes('zip total')) {
      return fail('tooLarge')
    }
    return fail('missing')
  }
}

/**
 * Fetch a remote zip with a byte cap (Content-Length or streamed read).
 * @param url - zip URL.
 */
export async function fetchZipBytesCapped(url: string): Promise<Uint8Array> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`zip fetch ${response.status}`)
  const lengthHeader = response.headers.get('content-length')
  if (lengthHeader !== null) {
    const length = Number(lengthHeader)
    if (Number.isFinite(length) && length > ART_PACK_MAX_ZIP_BYTES) {
      throw new Error('zip too large')
    }
  }
  if (response.body === null) {
    const buffer = new Uint8Array(await response.arrayBuffer())
    if (buffer.byteLength > ART_PACK_MAX_ZIP_BYTES) throw new Error('zip too large')
    return buffer
  }
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (value === undefined) continue
    total += value.byteLength
    if (total > ART_PACK_MAX_ZIP_BYTES) {
      await reader.cancel()
      throw new Error('zip too large')
    }
    chunks.push(value)
  }
  const out = new Uint8Array(total)
  let at = 0
  for (const chunk of chunks) {
    out.set(chunk, at)
    at += chunk.byteLength
  }
  return out
}
