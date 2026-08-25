/**
 * Collect and validate a muyu art pack from loose files or zip entries.
 * Matching is by basename so `skin/idle.png` still counts.
 */
import {
  ART_PACK_FILES, ART_PACK_REQUIRED, type ArtPackFile,
} from './art-pack.ts'
import { unzip } from './art-zip.ts'

/** Reject a single sprite larger than this. */
export const ART_PACK_MAX_FILE_BYTES = 8 * 1024 * 1024

/** Reject a zip larger than this before parsing. */
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

export type CollectArtPackResult =
  | { ok: true; files: Partial<Record<ArtPackFile, Blob>>; names: ArtPackFile[] }
  | { ok: false; missingRequired: Array<(typeof ART_PACK_REQUIRED)[number]>; names: string[] }

/**
 * Keep known art filenames from a file list. Required names must all be present.
 * @param inputs - zip entries or `<input type="file">` items.
 */
export function collectArtPack(
  inputs: ReadonlyArray<{ name: string; blob: Blob }>,
): CollectArtPackResult {
  const files: Partial<Record<ArtPackFile, Blob>> = {}
  const names: ArtPackFile[] = []
  for (const input of inputs) {
    if (isIgnoredArtPath(input.name)) continue
    const base = artPackBasename(input.name)
    if (!PACK_NAME_SET.has(base)) continue
    if (input.blob.size > ART_PACK_MAX_FILE_BYTES) continue
    const key = base as ArtPackFile
    files[key] = input.blob
    if (!names.includes(key)) names.push(key)
  }
  const missingRequired = ART_PACK_REQUIRED.filter(name => files[name] === undefined)
  if (missingRequired.length > 0) {
    return { ok: false, missingRequired, names }
  }
  return { ok: true, files, names }
}

function bytesToPngBlob(data: Uint8Array): Blob {
  const copy = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer
  return new Blob([copy], { type: 'image/png' })
}

/**
 * Unpack a zip and keep known art filenames.
 * @param bytes - zip file bytes (store or deflate).
 */
export async function collectArtPackFromZip(bytes: Uint8Array): Promise<CollectArtPackResult> {
  if (bytes.byteLength > ART_PACK_MAX_ZIP_BYTES) {
    return { ok: false, missingRequired: [...ART_PACK_REQUIRED], names: [] }
  }
  const entries = await unzip(bytes)
  return collectArtPack(
    Object.entries(entries).map(([name, data]) => ({ name, blob: bytesToPngBlob(data) })),
  )
}
