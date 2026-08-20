/**
 * Overlay tunables: user prefs (settings page + store) and art constants
 * (sprite timing / hotspot). The pose machine still consumes the merged
 * {@link ResolvedMuyuConfig}.
 */
import z from 'schemastery'

/** User-facing prefs before schema defaults. */
export interface MuyuPrefs {
  /** When false, the overlay widget does not paint. The settings page stays. */
  enabled?: boolean
  /** Busy wait before the first auto-knock, in milliseconds. */
  autoDelayMs?: number
  /** Auto-knock spacing while still busy, in milliseconds. */
  autoIntervalMs?: number
  /** Manual knocks since idle that release into the big bump. */
  comboThreshold?: number
  /** Merit plaque art: wooden board or incense censer. */
  plaque?: 'censer' | 'board'
  /**
   * Optional URL/path prefix for custom sprites. Empty uses packaged art.
   * Files under the prefix must match the built-in basenames (idle.png, …).
   */
  artBaseUrl?: string
}

/** User-facing prefs after schema defaults. */
export type ResolvedMuyuPrefs = {
  readonly enabled: boolean
  readonly autoDelayMs: number
  readonly autoIntervalMs: number
  readonly comboThreshold: number
  readonly plaque: 'board' | 'censer'
  readonly artBaseUrl: string
}

/** Art-locked timings and cursor hotspot, keyed to the shipped sprites. */
export type MuyuArtTunables = {
  readonly autoHitMs: number
  readonly bumpMs: number
  readonly bumpMaxMs: number
  readonly bumpBigMs: number
  readonly bumpBigMaxMs: number
  readonly stickHotspotX: number
  readonly stickHotspotY: number
}

/**
 * Runtime art capability: whether the current pack has `bump-recover.png`.
 * Packaged sprites always do; a custom prefix is probed in the widget.
 */
export type MuyuArtCapabilities = {
  readonly hasBumpRecover: boolean
}

/** Full overlay tunables before defaults (prefs + optional art overrides). */
export interface MuyuConfig extends MuyuPrefs, Partial<MuyuArtTunables>, Partial<MuyuArtCapabilities> {}

/** Full overlay tunables after defaults. */
export type ResolvedMuyuConfig = ResolvedMuyuPrefs & MuyuArtTunables & MuyuArtCapabilities

/** Sprite timing and stick hotspot. Not shown on the settings page. */
export const ART_TUNABLES: MuyuArtTunables = {
  autoHitMs: 280,
  bumpMs: 800,
  bumpMaxMs: 2400,
  bumpBigMs: 800,
  bumpBigMaxMs: 2400,
  stickHotspotX: 8,
  stickHotspotY: 28,
}

/** Settings-page / store schema for the five user prefs. */
export const Prefs: z<MuyuPrefs> = z.object({
  enabled: z
    .boolean()
    .default(true)
    .description('Show the wooden-fish overlay'),
  autoDelayMs: z
    .number()
    .step(1)
    .min(0)
    .default(1000)
    .description('Busy wait before the first auto-knock (ms)'),
  autoIntervalMs: z
    .number()
    .step(1)
    .min(1)
    .default(1000)
    .description('Auto-knock interval while busy (ms)'),
  comboThreshold: z
    .number()
    .step(1)
    .min(1)
    .default(5)
    .description('Manual knocks since idle that release into the big bump'),
  plaque: z
    .union(['board', 'censer'])
    .default('censer')
    .description('Merit plaque art: wooden board or incense censer'),
  artBaseUrl: z
    .string()
    .default('')
    .description('Optional sprite base URL; empty keeps packaged art'),
})

/**
 * Host plugin config. User prefs live in the browser store, not Host yaml.
 * An empty schema keeps Cordis from advertising fields the browser never reads.
 */
export const Config = z.object({})

/**
 * Fill user-pref defaults.
 * @param input - partial prefs, usually `{}` or a store patch.
 * @returns every user pref filled.
 */
export function resolveMuyuPrefs(input: MuyuPrefs = {}): ResolvedMuyuPrefs {
  return Prefs(input) as ResolvedMuyuPrefs
}

/**
 * Merge user prefs with art constants. Tests may override art timings.
 * @param input - partial prefs and optional art overrides.
 * @returns every overlay tunable filled.
 */
export function resolveMuyuConfig(input: MuyuConfig = {}): ResolvedMuyuConfig {
  const prefs = resolveMuyuPrefs({
    enabled: input.enabled,
    autoDelayMs: input.autoDelayMs,
    autoIntervalMs: input.autoIntervalMs,
    comboThreshold: input.comboThreshold,
    plaque: input.plaque,
    artBaseUrl: input.artBaseUrl,
  })
  return {
    ...prefs,
    autoHitMs: input.autoHitMs ?? ART_TUNABLES.autoHitMs,
    bumpMs: input.bumpMs ?? ART_TUNABLES.bumpMs,
    bumpMaxMs: input.bumpMaxMs ?? ART_TUNABLES.bumpMaxMs,
    bumpBigMs: input.bumpBigMs ?? ART_TUNABLES.bumpBigMs,
    bumpBigMaxMs: input.bumpBigMaxMs ?? ART_TUNABLES.bumpBigMaxMs,
    stickHotspotX: input.stickHotspotX ?? ART_TUNABLES.stickHotspotX,
    stickHotspotY: input.stickHotspotY ?? ART_TUNABLES.stickHotspotY,
    hasBumpRecover: input.hasBumpRecover ?? true,
  }
}
