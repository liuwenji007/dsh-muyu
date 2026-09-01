/**
 * Per-session merit counters and user prefs. Exclusive store: create the
 * handle once in `apply` and pass it to both slot entries; module-level
 * handles are forbidden. Overlay scope is root, so one localStorage key
 * holds prefs, merit, and LRU timestamps. Art-pack blobs live in IndexedDB.
 */
import { defineStore, type EngineStoreHandle } from '@deepseek-ai/dsh-client-store'
import { resolveMuyuPrefs, type MuyuPrefs } from '../config.ts'
import { MUYU_MERIT_PERSIST_KEY } from './muyu-data.ts'
import {
  freshMuyuStoreState, normalizeMuyuStoreState, pruneMeritMaps, type MuyuStoreState,
} from './merit-map.ts'

export { MERIT_SESSION_CAP, freshMuyuStoreState, normalizeMuyuStoreState, pruneMeritMaps } from './merit-map.ts'
export type { MuyuStoreState } from './merit-map.ts'
export { MUYU_MERIT_PERSIST_KEY } from './muyu-data.ts'

/** Write set for {@link createMuyuStore}. */
type MuyuStoreActions = {
  addMerit: (draft: MuyuStoreState, sessionId: string, delta: number, now?: number) => void
  setPrefs: (draft: MuyuStoreState, patch: MuyuPrefs) => void
  resetAll: (draft: MuyuStoreState) => void
}

/**
 * Create the exclusive merit-and-prefs store handle.
 * @returns the store handle (spec + identity + factory).
 */
export function createMuyuStore(): EngineStoreHandle<MuyuStoreState, MuyuStoreActions> {
  return defineStore({
    init: (): MuyuStoreState => ({
      prefs: resolveMuyuPrefs(),
      bySession: {},
      touchedAt: {},
    }),
    persist: MUYU_MERIT_PERSIST_KEY,
    actions: {
      addMerit: (draft, sessionId: string, delta: number, now: number = Date.now()) => {
        const state = normalizeMuyuStoreState(draft)
        draft.prefs = state.prefs
        if (delta === 0) {
          draft.bySession = state.bySession
          draft.touchedAt = state.touchedAt
          return
        }
        const bySession = { ...state.bySession, [sessionId]: (state.bySession[sessionId] ?? 0) + delta }
        const touchedAt = { ...state.touchedAt, [sessionId]: now }
        const pruned = pruneMeritMaps(bySession, touchedAt, sessionId)
        draft.bySession = pruned.bySession
        draft.touchedAt = pruned.touchedAt
      },
      setPrefs: (draft, patch: MuyuPrefs) => {
        const state = normalizeMuyuStoreState(draft)
        draft.bySession = state.bySession
        draft.touchedAt = state.touchedAt
        try {
          draft.prefs = resolveMuyuPrefs({ ...state.prefs, ...patch })
        } catch {
          draft.prefs = state.prefs
        }
      },
      resetAll: (draft) => {
        const fresh = freshMuyuStoreState()
        draft.prefs = fresh.prefs
        draft.bySession = fresh.bySession
        draft.touchedAt = fresh.touchedAt
      },
    },
  })
}
