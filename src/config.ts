/**
 * Overlay feel tunables. The browser fiber reads this schema; Cordis applies
 * `.default()` before `apply`.
 */
import z from 'schemastery'

/** Plugin config before schema defaults. */
export interface MuyuConfig {
  /** When false, the overlay does not register. */
  enabled?: boolean
  /** Busy wait before the first auto-knock, in milliseconds. */
  autoDelayMs?: number
  /** Auto-knock spacing while still busy, in milliseconds. */
  autoIntervalMs?: number
  /** Auto-hit pose hold before returning to idle, in milliseconds. */
  autoHitMs?: number
  /** Manual knocks since idle that release into the big bump. */
  comboThreshold?: number
  /** Small-bump hold before returning to idle, in milliseconds. */
  bumpMs?: number
  /** Ceiling on small-bump hold, including combo extra, in milliseconds. */
  bumpMaxMs?: number
  /** Big-bump hold before stepping down to the small bump, in milliseconds. */
  bumpBigMs?: number
  /** Ceiling on big-bump hold, including combo extra, in milliseconds. */
  bumpBigMaxMs?: number
  /** Stick-cursor hotspot X in CSS pixels from the image's left. */
  stickHotspotX?: number
  /** Stick-cursor hotspot Y in CSS pixels from the image's top. */
  stickHotspotY?: number
  /** Merit plaque art: wooden board or incense censer. */
  plaque?: 'censer' | 'board'
}

/** Plugin config after schema defaults. */
export type ResolvedMuyuConfig = {
  readonly enabled: boolean
  readonly autoDelayMs: number
  readonly autoIntervalMs: number
  readonly autoHitMs: number
  readonly comboThreshold: number
  readonly bumpMs: number
  readonly bumpMaxMs: number
  readonly bumpBigMs: number
  readonly bumpBigMaxMs: number
  readonly stickHotspotX: number
  readonly stickHotspotY: number
  readonly plaque: 'board' | 'censer'
}

/** Cordis plugin config schema. */
export const Config: z<MuyuConfig> = z.object({
  enabled: z
    .boolean()
    .default(true)
    .description('Mount the wooden-fish overlay'),
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
  autoHitMs: z
    .number()
    .step(1)
    .min(1)
    .default(280)
    .description('Auto-hit pose hold before idle (ms)'),
  comboThreshold: z
    .number()
    .step(1)
    .min(1)
    .default(5)
    .description('Manual knocks since idle that release into the big bump'),
  bumpMs: z
    .number()
    .step(1)
    .min(1)
    .default(800)
    .description('Small-bump hold before idle (ms)'),
  bumpMaxMs: z
    .number()
    .step(1)
    .min(1)
    .default(2400)
    .description('Small-bump hold ceiling, including combo extra (ms)'),
  bumpBigMs: z
    .number()
    .step(1)
    .min(1)
    .default(800)
    .description('Big-bump hold before the small bump (ms)'),
  bumpBigMaxMs: z
    .number()
    .step(1)
    .min(1)
    .default(2400)
    .description('Big-bump hold ceiling, including combo extra (ms)'),
  stickHotspotX: z
    .number()
    .step(1)
    .min(0)
    .default(8)
    .description('Stick cursor hotspot X (px)'),
  stickHotspotY: z
    .number()
    .step(1)
    .min(0)
    .default(28)
    .description('Stick cursor hotspot Y (px)'),
  plaque: z
    .union(['board', 'censer'])
    .default('censer')
    .description('Merit plaque art: wooden board or incense censer'),
})

/**
 * Apply schema defaults without going through a Cordis fiber.
 * @param input - partial config, usually `{}` in tests.
 * @returns every tunable filled.
 */
export function resolveMuyuConfig(input: MuyuConfig = {}): ResolvedMuyuConfig {
  return Config(input) as ResolvedMuyuConfig
}
