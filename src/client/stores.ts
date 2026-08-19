/**
 * Per-session merit counters and user prefs. Exclusive store: create the
 * handle once in `apply` and pass it to both slot entries; module-level
 * handles are forbidden. Overlay scope is root, so one localStorage key
 * holds prefs, merit, and LRU timestamps.
 */
import { defineStore, type EngineStoreHandle } from '@deepseek-ai/dsh-client-runtime/client'
import { resolveMuyuPrefs, type MuyuPrefs } from '../config.ts'
import {
  normalizeMuyuStoreState, pruneMeritMaps, type MuyuStoreState,
} from './merit-map.ts'

export { MERIT_SESSION_CAP, normalizeMuyuStoreState, pruneMeritMaps } from './merit-map.ts'
export type { MuyuStoreState } from './merit-map.ts'

/** localStorage key for {@link createMuyuStore} (root-scoped exclusive instance). */
export const MUYU_MERIT_PERSIST_KEY = 'dsh.muyu.merit'

/** Write set for {@link createMuyuStore}. */
type MuyuStoreActions = {
  addMerit: (draft: MuyuStoreState, sessionId: string, delta: number, now?: number) => void
  setPrefs: (draft: MuyuStoreState, patch: MuyuPrefs) => void
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
    },
  })
}
