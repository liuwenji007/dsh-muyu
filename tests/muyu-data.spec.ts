/**
 * Browser data lifecycle: detect, prompt ack, and full wipe.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveMuyuPrefs } from '../src/config.ts'
import { freshMuyuStoreState } from '../src/client/merit-map.ts'
import {
  acknowledgeDataPrompt,
  clearAllMuyuData,
  DATA_PROMPT_KEY,
  hasAcknowledgedDataPrompt,
  hasMeritPersistBlob,
  meritBlobIsMeaningful,
  MUYU_MERIT_PERSIST_KEY,
  shouldShowDataPrompt,
} from '../src/client/muyu-data.ts'

const meritKey = MUYU_MERIT_PERSIST_KEY

function mockLocalStorage(): void {
  const map = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => (map.has(key) ? map.get(key)! : null),
    setItem: (key: string, value: string) => { map.set(key, value) },
    removeItem: (key: string) => { map.delete(key) },
    clear: () => { map.clear() },
  })
}

function defaultMeritBlob(): string {
  return JSON.stringify(freshMuyuStoreState())
}

describe('muyu-data', () => {
  beforeEach(() => {
    mockLocalStorage()
    vi.restoreAllMocks()
  })

  it('detects a merit persist blob', () => {
    expect(hasMeritPersistBlob()).toBe(false)
    localStorage.setItem(meritKey, '{}')
    expect(hasMeritPersistBlob()).toBe(true)
  })

  it('treats a fresh default persist blob as not meaningful', () => {
    expect(meritBlobIsMeaningful(defaultMeritBlob())).toBe(false)
    expect(meritBlobIsMeaningful('{"bySession":{}}')).toBe(false)
  })

  it('treats merit or non-default prefs as meaningful', () => {
    expect(meritBlobIsMeaningful(JSON.stringify({
      ...freshMuyuStoreState(),
      bySession: { s1: 3 },
    }))).toBe(true)
    expect(meritBlobIsMeaningful(JSON.stringify({
      ...freshMuyuStoreState(),
      prefs: { ...resolveMuyuPrefs(), enabled: false },
    }))).toBe(true)
  })

  it('tracks kept acknowledgement only', () => {
    expect(hasAcknowledgedDataPrompt()).toBe(false)
    acknowledgeDataPrompt('kept')
    expect(localStorage.getItem(DATA_PROMPT_KEY)).toBe('kept')
    expect(hasAcknowledgedDataPrompt()).toBe(true)
    localStorage.setItem(DATA_PROMPT_KEY, 'cleared')
    expect(hasAcknowledgedDataPrompt()).toBe(false)
  })

  it('shouldShowDataPrompt is false with no meaningful data', async () => {
    localStorage.setItem(meritKey, defaultMeritBlob())
    vi.spyOn(await import('../src/client/art-idb.ts'), 'artDbHasContent').mockResolvedValue(false)
    expect(await shouldShowDataPrompt()).toBe(false)
  })

  it('shouldShowDataPrompt is true when meaningful merit exists and prompt not acked', async () => {
    localStorage.setItem(meritKey, JSON.stringify({
      ...freshMuyuStoreState(),
      bySession: { a: 1 },
    }))
    vi.spyOn(await import('../src/client/art-idb.ts'), 'artDbHasContent').mockResolvedValue(false)
    expect(await shouldShowDataPrompt()).toBe(true)
  })

  it('shouldShowDataPrompt is false after kept acknowledgement', async () => {
    localStorage.setItem(meritKey, JSON.stringify({
      ...freshMuyuStoreState(),
      bySession: { a: 1 },
    }))
    acknowledgeDataPrompt('kept')
    vi.spyOn(await import('../src/client/art-idb.ts'), 'artDbHasContent').mockResolvedValue(false)
    expect(await shouldShowDataPrompt()).toBe(false)
  })

  it('shouldShowDataPrompt is true again after clear removes kept acknowledgement', async () => {
    localStorage.setItem(meritKey, JSON.stringify({
      ...freshMuyuStoreState(),
      bySession: { a: 1 },
    }))
    acknowledgeDataPrompt('kept')
    const deleteSpy = vi.spyOn(await import('../src/client/art-idb.ts'), 'deleteEntireArtDatabase')
      .mockResolvedValue(undefined)
    await clearAllMuyuData()
    expect(deleteSpy).toHaveBeenCalled()
    expect(localStorage.getItem(DATA_PROMPT_KEY)).toBeNull()
    localStorage.setItem(meritKey, JSON.stringify({
      ...freshMuyuStoreState(),
      bySession: { b: 2 },
    }))
    expect(await shouldShowDataPrompt()).toBe(true)
  })

  it('clearAllMuyuData removes merit blob and prompt flag', async () => {
    localStorage.setItem(meritKey, JSON.stringify({
      ...freshMuyuStoreState(),
      bySession: { a: 1 },
    }))
    acknowledgeDataPrompt('kept')
    const deleteSpy = vi.spyOn(await import('../src/client/art-idb.ts'), 'deleteEntireArtDatabase')
      .mockResolvedValue(undefined)
    await clearAllMuyuData()
    expect(deleteSpy).toHaveBeenCalled()
    expect(localStorage.getItem(meritKey)).toBeNull()
    expect(localStorage.getItem(DATA_PROMPT_KEY)).toBeNull()
  })
})

describe('freshMuyuStoreState', () => {
  it('returns default prefs and empty merit maps', () => {
    const state = freshMuyuStoreState()
    expect(state.prefs).toEqual(resolveMuyuPrefs())
    expect(state.bySession).toEqual({})
    expect(state.touchedAt).toEqual({})
  })
})
