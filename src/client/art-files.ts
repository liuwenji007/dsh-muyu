/**
 * Collect and validate a muyu art pack from loose files or zip entries.
 * Matching is by basename so `skin/idle.png` still counts.
 * Optional `layout.json` carries pose crop + prop placement.
 */
import {
  ART_PACK_FILES, ART_PACK_REQUIRED, type ArtPackFile,
} from './art-pack.ts'
import { ART_PACK_MAX_EDGE, blobSize } from './art-fit.ts'
import { parseLayoutJson, type ParsedArtLayout } from './art-layout.ts'
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
  | {
    ok: true
    files: Partial<Record<ArtPackFile, Blob>>
    names: ArtPackFile[]
    /** Present when the pack shipped a valid `layout.json`. */
    layout?: ParsedArtLayout
  }
  | {
    ok: false
    reason: CollectArtPackFailReason
    missingRequired: Array<(typeof ART_PACK_REQUIRED)[number]>
    names: string[]
  }

/** Basename used for shared layout beside the PNGs. */
export const ART_LAYOUT_FILENAME = 'layout.json'

async function readLayoutBlob(blob: Blob): Promise<ParsedArtLayout | undefined> {
  try {
    const text = await blob.text()
    return parseLayoutJson(text) ?? undefined
  } catch {
    return undefined
  }
}

function fail(
  reason: CollectArtPackFailReason,
  missingRequired: Array<(typeof ART_PACK_REQUIRED)[number]> = [...ART_PACK_REQUIRED],
  names: string[] = [],
): CollectArtPackResult {
  return { ok: false, reason, missingRequired, names }
}

export type CollectArtPackOptions = {
  /**
   * When true (default), every required sprite must be present.
   * When false, any non-empty set of known filenames is accepted (workshop patch).
   */
  requireComplete?: boolean
}

/**
 * Keep known art filenames from a file list.
 * By default required names must all be present; pass `{ requireComplete: false }` to patch.
 * Also picks up optional `layout.json` (async companion: {@link collectArtPackAsync}).
 * @param inputs - zip entries or `<input type="file">` items.
 * @param options - completeness gate.
 */
export function collectArtPack(
  inputs: ReadonlyArray<{ name: string; blob: Blob }>,
  options?: CollectArtPackOptions,
): CollectArtPackResult {
  const requireComplete = options?.requireComplete !== false
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
  if (!requireComplete) {
    if (names.length === 0) {
      return fail(sawTooLarge ? 'tooLarge' : 'missing', [...ART_PACK_REQUIRED], names)
    }
    return { ok: true, files, names }
  }
  const missingRequired = ART_PACK_REQUIRED.filter(name => files[name] === undefined)
  if (missingRequired.length > 0) {
    return fail(sawTooLarge ? 'tooLarge' : 'missing', missingRequired, names)
  }
  return { ok: true, files, names }
}

/**
 * Like {@link collectArtPack}, but also parses `layout.json` when present.
 * @param inputs - zip entries or file picker items.
 * @param options - completeness gate (same as {@link collectArtPack}).
 */
export async function collectArtPackAsync(
  inputs: ReadonlyArray<{ name: string; blob: Blob }>,
  options?: CollectArtPackOptions,
): Promise<CollectArtPackResult> {
  let layoutBlob: Blob | undefined
  const images: Array<{ name: string; blob: Blob }> = []
  for (const input of inputs) {
    if (isIgnoredArtPath(input.name)) continue
    const base = artPackBasename(input.name)
    if (base === ART_LAYOUT_FILENAME) {
      layoutBlob = input.blob
      continue
    }
    images.push(input)
  }
  const collected = collectArtPack(images, options)
  if (!collected.ok) return collected
  if (layoutBlob === undefined) return collected
  const layout = await readLayoutBlob(layoutBlob)
  return layout === undefined ? collected : { ...collected, layout }
}

function bytesToPngBlob(data: Uint8Array): Blob {
  const copy = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer
  return new Blob([copy], { type: 'image/png' })
}

/**
 * Copy picker/zip blobs into independent PNG Blobs and verify they decode
 * within the pixel cap. Chrome can drop directory-picker File handles after restart.
 * @param files - collected pack blobs (may still be live File handles).
 * @param options - completeness gate; false keeps a partial set for workshop merge.
 */
export async function freezeArtBlobs(
  files: Partial<Record<ArtPackFile, Blob>>,
  options?: CollectArtPackOptions,
): Promise<CollectArtPackResult> {
  const requireComplete = options?.requireComplete !== false
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

  if (!requireComplete) {
    if (names.length === 0) {
      const reason: CollectArtPackFailReason = tooLarge ? 'tooLarge' : notImage ? 'notImage' : 'missing'
      return fail(reason, [...ART_PACK_REQUIRED], names)
    }
    return { ok: true, files: next, names }
  }

  const missingRequired = ART_PACK_REQUIRED.filter(name => next[name] === undefined)
  if (missingRequired.length > 0) {
    const reason: CollectArtPackFailReason = tooLarge ? 'tooLarge' : notImage ? 'notImage' : 'missing'
    return fail(reason, missingRequired, names)
  }
  return { ok: true, files: next, names }
}

/**
 * Unpack a zip and keep known art filenames (+ optional `layout.json`).
 * Caller should {@link freezeArtBlobs} before IndexedDB or object URLs.
 * @param bytes - zip file bytes (store or deflate).
 */
export async function collectArtPackFromZip(bytes: Uint8Array): Promise<CollectArtPackResult> {
  if (bytes.byteLength > ART_PACK_MAX_ZIP_BYTES) {
    return fail('tooLarge')
  }
  try {
    const entries = await unzip(bytes)
    const inputs: Array<{ name: string; blob: Blob }> = []
    for (const [name, data] of Object.entries(entries)) {
      const base = artPackBasename(name)
      if (base === ART_LAYOUT_FILENAME) {
        inputs.push({
          name,
          blob: new Blob([data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer], {
            type: 'application/json',
          }),
        })
      } else {
        inputs.push({ name, blob: bytesToPngBlob(data) })
      }
    }
    return await collectArtPackAsync(inputs)
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
