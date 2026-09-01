/**
 * Browser-side muyu data lifecycle: detect persisted blobs, prompt ack, and wipe.
 */
import { resolveMuyuPrefs, type ResolvedMuyuPrefs } from '../config.ts'
import { artDbHasContent, deleteEntireArtDatabase } from './art-idb.ts'
import { normalizeMuyuStoreState } from './merit-map.ts'

/** localStorage key for merit/prefs persist blob. */
export const MUYU_MERIT_PERSIST_KEY = 'dsh.muyu.merit'

/** localStorage key: user chose to keep leftover data on the reinstall prompt. */
export const DATA_PROMPT_KEY = 'dsh.muyu.dataPrompt'

/** Value written to {@link DATA_PROMPT_KEY} when the user keeps existing data. */
export type DataPromptChoice = 'kept'

function readLocal(key: string): string | null {
  if (typeof localStorage === 'undefined') return null
  return localStorage.getItem(key)
}

function writeLocal(key: string, value: string): void {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(key, value)
}

function removeLocal(key: string): void {
  if (typeof localStorage === 'undefined') return
  localStorage.removeItem(key)
}

/** Whether the merit/prefs persist blob is present in localStorage. */
export function hasMeritPersistBlob(): boolean {
  return readLocal(MUYU_MERIT_PERSIST_KEY) !== null
}

/** Whether a stored merit blob carries user-visible state (not a fresh default persist). */
export function meritBlobIsMeaningful(raw: string | null): boolean {
  if (raw === null || raw.trim() === '') return false
  try {
    const parsed: unknown = JSON.parse(raw)
    const state = normalizeMuyuStoreState(
      typeof parsed === 'object' && parsed !== null ? parsed as Record<string, unknown> : {},
    )
    if (Object.keys(state.bySession).length > 0) return true
    return prefsDifferFromDefaults(state.prefs)
  } catch {
    return false
  }
}

function prefsDifferFromDefaults(prefs: ResolvedMuyuPrefs): boolean {
  const defaults = resolveMuyuPrefs()
  return (Object.keys(defaults) as Array<keyof ResolvedMuyuPrefs>).some(
    key => prefs[key] !== defaults[key],
  )
}

/** Whether any meaningful muyu browser data (merit store or art IDB) exists. */
export async function hasPersistedMuyuData(): Promise<boolean> {
  if (meritBlobIsMeaningful(readLocal(MUYU_MERIT_PERSIST_KEY))) return true
  return artDbHasContent()
}

/** Whether the user already chose to keep data on the reinstall prompt. */
export function hasAcknowledgedDataPrompt(): boolean {
  return readLocal(DATA_PROMPT_KEY) === 'kept'
}

/** Record that the user wants to keep leftover browser data. */
export function acknowledgeDataPrompt(choice: DataPromptChoice): void {
  writeLocal(DATA_PROMPT_KEY, choice)
}

/** Show the restore prompt when meaningful old data exists and the user has not kept it yet. */
export async function shouldShowDataPrompt(): Promise<boolean> {
  if (hasAcknowledgedDataPrompt()) return false
  return hasPersistedMuyuData()
}

/**
 * Wipe all muyu browser data: art IDB, merit localStorage, and the keep prompt flag.
 */
export async function clearAllMuyuData(): Promise<void> {
  await deleteEntireArtDatabase()
  removeLocal(MUYU_MERIT_PERSIST_KEY)
  removeLocal(DATA_PROMPT_KEY)
}
