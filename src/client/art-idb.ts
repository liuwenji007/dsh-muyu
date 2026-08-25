/**
 * Persist local working pack + a multi-entry art library in IndexedDB.
 * Library holds imported / saved packs so users can switch without overwriting.
 */
import { isArtPackPose, type ArtPackFile } from './art-pack.ts'
import { rasterizeFit, type ArtFit, type ArtStage } from './art-fit.ts'
import {
  resolvePropsLayout, type ArtPackLayout, type ArtPropsLayout,
} from './art-layout.ts'

const DB_NAME = 'dsh.muyu.art'
const DB_VERSION = 2
const STORE = 'packs'
const LIBRARY = 'library'

/** IndexedDB keys in the packs store. `local` is the working pack; `zip` is legacy. */
export type ArtPackSlot = 'local' | 'zip'

export type StoredArtPack = {
  files: Partial<Record<ArtPackFile, Blob>>
  names: ArtPackFile[]
  savedAt: number
  stage?: ArtStage
  fits?: Partial<Record<ArtPackFile, ArtFit>>
  props?: ArtPropsLayout
}

/** One named pack in the switchable library. */
export type LibraryPack = StoredArtPack & {
  id: string
  label: string
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
      if (!db.objectStoreNames.contains(LIBRARY)) db.createObjectStore(LIBRARY, { keyPath: 'id' })
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

function newPackId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `pack-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
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
 * @param pack - local or library pack with layout.
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
 * Write a pack into one slot (local working pack or legacy zip).
 * @param slot - local or zip.
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

function asLibraryPack(value: unknown): LibraryPack | null {
  if (value === null || typeof value !== 'object') return null
  const record = value as LibraryPack
  if (typeof record.id !== 'string' || record.id === '') return null
  if (typeof record.label !== 'string') return null
  if (record.files === undefined || typeof record.files !== 'object') return null
  const names = Array.isArray(record.names)
    ? record.names
    : (Object.keys(record.files) as ArtPackFile[])
  return {
    ...normalizeStoredPack({
      files: record.files,
      names,
      savedAt: typeof record.savedAt === 'number' ? record.savedAt : Date.now(),
      stage: record.stage,
      fits: record.fits,
      props: record.props,
    }),
    id: record.id,
    label: record.label.trim() === '' ? record.id : record.label.trim(),
  }
}

/**
 * Move the legacy single `zip` slot into the library once (if present).
 * @returns the new library id, or null when nothing to migrate.
 */
export async function migrateLegacyZipSlot(): Promise<string | null> {
  const zip = await loadArtPack('zip')
  if (zip === null) return null
  const saved = await saveLibraryPack({
    label: '已导入 zip',
    files: zip.files,
    layout: zip.stage !== undefined && zip.fits !== undefined
      ? { stage: zip.stage, fits: zip.fits, props: zip.props }
      : undefined,
  })
  await clearArtPack('zip')
  return saved.id
}

/**
 * List library packs, newest first. Migrates the legacy zip slot first.
 */
export async function listLibraryPacks(): Promise<LibraryPack[]> {
  if (idbFactory() === undefined) return []
  await migrateLegacyZipSlot()
  const db = await openDb()
  try {
    if (!db.objectStoreNames.contains(LIBRARY)) return []
    const tx = db.transaction(LIBRARY, 'readonly')
    const rows = await requestToPromise(tx.objectStore(LIBRARY).getAll())
    const packs = (rows as unknown[])
      .map(asLibraryPack)
      .filter((row): row is LibraryPack => row !== null)
    packs.sort((a, b) => b.savedAt - a.savedAt)
    return packs
  } finally {
    db.close()
  }
}

/**
 * Load one library pack by id.
 * @param id - library key.
 */
export async function loadLibraryPack(id: string): Promise<LibraryPack | null> {
  if (idbFactory() === undefined || id.trim() === '') return null
  await migrateLegacyZipSlot()
  const db = await openDb()
  try {
    if (!db.objectStoreNames.contains(LIBRARY)) return null
    const tx = db.transaction(LIBRARY, 'readonly')
    return asLibraryPack(await requestToPromise(tx.objectStore(LIBRARY).get(id)))
  } finally {
    db.close()
  }
}

/**
 * Insert or replace a library pack.
 * @param input - label, files, optional layout and id (omit id to create).
 */
export async function saveLibraryPack(input: {
  id?: string
  label: string
  files: Partial<Record<ArtPackFile, Blob>>
  layout?: ArtPackLayoutInput
}): Promise<LibraryPack> {
  const id = input.id?.trim() || newPackId()
  const names = Object.keys(input.files) as ArtPackFile[]
  const record: LibraryPack = {
    id,
    label: input.label.trim() === '' ? `图包 ${new Date().toLocaleString()}` : input.label.trim(),
    files: input.files,
    names,
    savedAt: Date.now(),
    stage: input.layout?.stage,
    fits: input.layout?.fits,
    props: input.layout?.props !== undefined
      ? resolvePropsLayout(input.layout.props)
      : undefined,
  }
  const db = await openDb()
  try {
    const tx = db.transaction(LIBRARY, 'readwrite')
    tx.objectStore(LIBRARY).put(record)
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB library write failed'))
      tx.onabort = () => reject(tx.error ?? new Error('IndexedDB library write aborted'))
    })
  } finally {
    db.close()
  }
  return { ...normalizeStoredPack(record), id: record.id, label: record.label }
}

/**
 * Rename a library pack without touching blobs.
 * @param id - library key.
 * @param label - new display name.
 */
export async function renameLibraryPack(id: string, label: string): Promise<LibraryPack | null> {
  const current = await loadLibraryPack(id)
  if (current === null) return null
  return await saveLibraryPack({
    id: current.id,
    label,
    files: current.files,
    layout: current.stage !== undefined && current.fits !== undefined
      ? { stage: current.stage, fits: current.fits, props: current.props }
      : undefined,
  })
}

/**
 * Delete one library pack.
 * @param id - library key.
 */
export async function deleteLibraryPack(id: string): Promise<void> {
  if (idbFactory() === undefined || id.trim() === '') return
  const db = await openDb()
  try {
    if (!db.objectStoreNames.contains(LIBRARY)) return
    const tx = db.transaction(LIBRARY, 'readwrite')
    tx.objectStore(LIBRARY).delete(id)
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB library delete failed'))
      tx.onabort = () => reject(tx.error ?? new Error('IndexedDB library delete aborted'))
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

/**
 * Default label for a freshly imported pack.
 * @param hint - optional zip / folder name.
 */
export function defaultLibraryLabel(hint?: string): string {
  const base = hint?.trim().replace(/\.(zip|png)$/i, '') ?? ''
  const stamp = new Date().toLocaleString()
  return base !== '' ? base : `导入 ${stamp}`
}
