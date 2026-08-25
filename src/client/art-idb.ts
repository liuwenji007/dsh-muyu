/**
 * Persist local (make/debug) and zip (share/use) art packs in IndexedDB.
 * Two slots so importing a zip never overwrites the working folder pack.
 */
import type { ArtPackFile } from './art-pack.ts'

const DB_NAME = 'dsh.muyu.art'
const DB_VERSION = 1
const STORE = 'packs'

/** IndexedDB keys. `local` is the working pack; `zip` is an imported/shared pack. */
export type ArtPackSlot = 'local' | 'zip'

export type StoredArtPack = {
  files: Partial<Record<ArtPackFile, Blob>>
  names: ArtPackFile[]
  savedAt: number
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
 * Write a pack into one slot.
 * @param slot - local working pack or imported zip.
 * @param files - validated art blobs.
 */
export async function saveArtPack(
  slot: ArtPackSlot,
  files: Partial<Record<ArtPackFile, Blob>>,
): Promise<StoredArtPack> {
  const names = Object.keys(files) as ArtPackFile[]
  const record: StoredArtPack = { files, names, savedAt: Date.now() }
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
  return record
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
    return record
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
 * Turn stored blobs into object URLs. Caller must revoke.
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
 * Revoke every object URL in a map.
 * @param urls - values from {@link objectUrlsForPack}.
 */
export function revokeObjectUrls(urls: Partial<Record<string, string>> | null | undefined): void {
  if (urls === undefined || urls === null) return
  for (const href of Object.values(urls)) {
    if (typeof href === 'string' && href.startsWith('blob:')) URL.revokeObjectURL(href)
  }
}
