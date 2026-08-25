/**
 * Persist local (make/debug) and zip (share/use) art packs in IndexedDB.
 * Two slots so importing a zip never overwrites the working folder pack.
 */
import { isArtPackPose, type ArtPackFile } from './art-pack.ts'
import { rasterizeFit, type ArtFit, type ArtStage } from './art-fit.ts'
import {
  resolvePropsLayout, type ArtPackLayout, type ArtPropsLayout,
} from './art-layout.ts'

const DB_NAME = 'dsh.muyu.art'
const DB_VERSION = 1
const STORE = 'packs'

/** IndexedDB keys. `local` is the working pack; `zip` is an imported/shared pack. */
export type ArtPackSlot = 'local' | 'zip'

export type StoredArtPack = {
  files: Partial<Record<ArtPackFile, Blob>>
  names: ArtPackFile[]
  savedAt: number
  /** Shared crop window for character poses; missing on packs imported before the workbench. */
  stage?: ArtStage
  /** Pan/zoom per pose, in {@link stage} pixel space. */
  fits?: Partial<Record<ArtPackFile, ArtFit>>
  /** Hotzone / stick / add / plaque placement; missing packs use defaults. */
  props?: ArtPropsLayout
}

/** Layout payload written with pose PNGs. */
export type ArtPackLayoutInput = {
  stage: ArtStage
  fits: Partial<Record<ArtPackFile, ArtFit>>
  props?: ArtPropsLayout
}

function idbFactory(): IDBFactory | undefined {
  return typeof indexedDB === 'undefined' ? undefined : indexedDB
}

function openDb(): Promise<IDBDatabase> {
  const factory = idbFactory()
  if (factory === undefined) {
    return Promise.reject(new Error('IndexedDB unavailable'))
  }
  return new Promise((resolve, reject) => {
    const req = factory.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'))
  })
}

function requestToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'))
  })
}

/**
 * Normalize a stored pack so callers see resolved props when any layout is present.
 * @param record - raw IDB value.
 */
export function normalizeStoredPack(record: StoredArtPack): StoredArtPack {
  if (record.props === undefined && record.stage === undefined) return record
  return {
    ...record,
    props: resolvePropsLayout(record.props),
  }
}

/**
 * Build a serializable layout from a stored pack (for export).
 * @param pack - local or zip pack with layout.
 */
export function layoutFromPack(pack: StoredArtPack): ArtPackLayout | null {
  if (pack.stage === undefined || pack.fits === undefined) return null
  return {
    stage: pack.stage,
    fits: pack.fits,
    props: resolvePropsLayout(pack.props),
  }
}

/**
 * Write a pack into one slot.
 * @param slot - local working pack or imported zip.
 * @param files - validated art blobs.
 */
export async function saveArtPack(
  slot: ArtPackSlot,
  files: Partial<Record<ArtPackFile, Blob>>,
  layout?: ArtPackLayoutInput,
): Promise<StoredArtPack> {
  const names = Object.keys(files) as ArtPackFile[]
  const record: StoredArtPack = {
    files,
    names,
    savedAt: Date.now(),
    stage: layout?.stage,
    fits: layout?.fits,
    props: layout?.props !== undefined ? resolvePropsLayout(layout.props) : undefined,
  }
  await putPack(slot, record)
  return normalizeStoredPack(record)
}

/**
 * Update crop + prop layout without replacing the original PNGs.
 * @param slot - local or zip.
 * @param layout - stage + fits + props.
 */
export async function saveArtPackLayout(
  slot: ArtPackSlot,
  layout: ArtPackLayoutInput,
): Promise<StoredArtPack | null> {
  const current = await loadArtPack(slot)
  if (current === null) return null
  const record: StoredArtPack = {
    ...current,
    stage: layout.stage,
    fits: layout.fits,
    props: resolvePropsLayout(layout.props ?? current.props),
    savedAt: Date.now(),
  }
  await putPack(slot, record)
  return normalizeStoredPack(record)
}

async function putPack(slot: ArtPackSlot, record: StoredArtPack): Promise<void> {
  const db = await openDb()
  try {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(record, slot)
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB write failed'))
      tx.onabort = () => reject(tx.error ?? new Error('IndexedDB write aborted'))
    })
  } finally {
    db.close()
  }
}

/**
 * Read a pack slot, or `null` if empty / IDB missing.
 * @param slot - local or zip.
 */
export async function loadArtPack(slot: ArtPackSlot): Promise<StoredArtPack | null> {
  if (idbFactory() === undefined) return null
  const db = await openDb()
  try {
    const tx = db.transaction(STORE, 'readonly')
    const value = await requestToPromise(tx.objectStore(STORE).get(slot))
    if (value === undefined || value === null || typeof value !== 'object') return null
    const record = value as StoredArtPack
    if (record.files === undefined || typeof record.files !== 'object') return null
    return normalizeStoredPack(record)
  } finally {
    db.close()
  }
}

/**
 * Drop one slot. The other slot is left alone.
 * @param slot - local or zip.
 */
export async function clearArtPack(slot: ArtPackSlot): Promise<void> {
  if (idbFactory() === undefined) return
  const db = await openDb()
  try {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).delete(slot)
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB delete failed'))
      tx.onabort = () => reject(tx.error ?? new Error('IndexedDB delete aborted'))
    })
  } finally {
    db.close()
  }
}

/**
 * Turn stored blobs into object URLs without cropping. Caller must revoke.
 * @param files - pack blobs.
 */
export function objectUrlsForPack(
  files: Partial<Record<ArtPackFile, Blob>>,
): Partial<Record<ArtPackFile, string>> {
  const out: Partial<Record<ArtPackFile, string>> = {}
  for (const [name, blob] of Object.entries(files)) {
    if (blob instanceof Blob) out[name as ArtPackFile] = URL.createObjectURL(blob)
  }
  return out
}

/**
 * Object URLs for overlay playback: pose frames are cropped to the shared stage.
 * Stick / plaque / add stay original.
 * @param pack - stored pack with optional layout.
 */
export async function objectUrlsForFittedPack(
  pack: StoredArtPack,
): Promise<Partial<Record<ArtPackFile, string>>> {
  const stage = pack.stage
  const fits = pack.fits
  const out: Partial<Record<ArtPackFile, string>> = {}
  for (const [name, blob] of Object.entries(pack.files)) {
    if (!(blob instanceof Blob)) continue
    const file = name as ArtPackFile
    const fit = fits?.[file]
    if (stage !== undefined && fit !== undefined && isArtPackPose(file)) {
      try {
        const cropped = await rasterizeFit(blob, fit, stage)
        out[file] = URL.createObjectURL(cropped)
        continue
      } catch {
        // fall through to the original blob
      }
    }
    out[file] = URL.createObjectURL(blob)
  }
  return out
}

/**
 * Revoke every object URL in a map.
 * @param urls - values from {@link objectUrlsForPack}.
 */
export function revokeObjectUrls(urls: Partial<Record<string, string>> | null | undefined): void {
  if (urls === undefined || urls === null) return
  for (const href of Object.values(urls)) {
    if (typeof href === 'string' && href.startsWith('blob:')) URL.revokeObjectURL(href)
  }
}
