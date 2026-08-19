/**
 * Per-session merit counters. Exclusive store: the framework instantiates
 * one handle per overlay entry; module-level handles are forbidden.
 * Overlay scope is root, so one localStorage key holds the whole map.
 */
import { defineStore, type EngineStoreHandle } from '@deepseek-ai/dsh-client-runtime/client'

/** localStorage key for {@link createMuyuStore} (root-scoped exclusive instance). */
export const MUYU_MERIT_PERSIST_KEY = 'dsh.muyu.merit'

/** Merit keyed by the current session id string. */
export type MuyuStoreState = {
  bySession: Record<string, number>
}

/** Write set for {@link createMuyuStore}. */
type MuyuStoreActions = {
  addMerit: (draft: MuyuStoreState, sessionId: string, delta: number) => void
}

/**
 * Create the exclusive merit-store handle.
 * @returns the store handle (spec + identity + factory).
 */
export function createMuyuStore(): EngineStoreHandle<MuyuStoreState, MuyuStoreActions> {
  return defineStore({
    init: (): MuyuStoreState => ({ bySession: {} }),
    persist: MUYU_MERIT_PERSIST_KEY,
    actions: {
      addMerit: (draft, sessionId: string, delta: number) => {
        if (delta === 0) return
        draft.bySession[sessionId] = (draft.bySession[sessionId] ?? 0) + delta
      },
    },
  })
}
