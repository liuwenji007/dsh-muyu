/**
 * Merit map LRU and persist-blob rehydration. No runtime imports so tests
 * can run without the Harness client packages installed.
 */
import { resolveMuyuPrefs, type MuyuPrefs, type ResolvedMuyuPrefs } from '../config.ts'

/** Drop oldest sessions once the merit map exceeds this many keys. */
export const MERIT_SESSION_CAP = 100

/** Merit keyed by session id, plus settings-page prefs and LRU clocks. */
export type MuyuStoreState = {
  prefs: ResolvedMuyuPrefs
  bySession: Record<string, number>
  touchedAt: Record<string, number>
}

/**
 * Fill missing fields from an older persist blob (`{ bySession }` only).
 * @param draft - immer draft or a plain state object.
 */
export function normalizeMuyuStoreState(draft: Partial<MuyuStoreState> & Record<string, unknown>): MuyuStoreState {
  const bySession = isNumberMap(draft.bySession) ? draft.bySession : {}
  const touchedAt = isNumberMap(draft.touchedAt) ? draft.touchedAt : {}
  const prefs = resolveMuyuPrefs(isPrefsPatch(draft.prefs) ? draft.prefs : {})
  return { prefs, bySession, touchedAt }
}

/**
 * Evict the oldest merit rows until the map is at {@link MERIT_SESSION_CAP}.
 * Never drops `keepId`.
 * @param bySession - merit counts.
 * @param touchedAt - last-write clocks, missing keys count as 0.
 * @param keepId - session that just received merit.
 * @param cap - maximum keys to keep.
 * @returns copies with overflow removed.
 */
export function pruneMeritMaps(
  bySession: Readonly<Record<string, number>>,
  touchedAt: Readonly<Record<string, number>>,
  keepId: string,
  cap: number = MERIT_SESSION_CAP,
): { bySession: Record<string, number>; touchedAt: Record<string, number> } {
  const ids = Object.keys(bySession)
  if (ids.length <= cap) {
    return { bySession: { ...bySession }, touchedAt: { ...touchedAt } }
  }
  const dropCount = ids.length - cap
  const victims = ids
    .filter(id => id !== keepId)
    .sort((a, b) => (touchedAt[a] ?? 0) - (touchedAt[b] ?? 0))
    .slice(0, dropCount)
  const nextBy = { ...bySession }
  const nextAt = { ...touchedAt }
  for (const id of victims) {
    delete nextBy[id]
    delete nextAt[id]
  }
  return { bySession: nextBy, touchedAt: nextAt }
}

function isNumberMap(value: unknown): value is Record<string, number> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  for (const entry of Object.values(value as Record<string, unknown>)) {
    if (typeof entry !== 'number' || !Number.isFinite(entry)) return false
  }
  return true
}

function isPrefsPatch(value: unknown): value is MuyuPrefs {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
