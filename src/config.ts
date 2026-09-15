/**
 * Overlay tunables: user prefs (settings page + store) and art constants
 * (sprite timing / hotspot). The pose machine still consumes the merged
 * {@link ResolvedMuyuConfig}.
 */
import z from 'schemastery'

/** Which sprite set the overlay paints. Library holds multiple imported packs. */
export type MuyuArtSource = 'builtin' | 'local' | 'url' | 'library' | 'zip'

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
   * Active art source. `local` is the working pack (debug / make).
   * `library` is a saved/imported pack keyed by {@link artPackId}.
   * `zip` is legacy (migrated into the library).
   */
  artSource?: MuyuArtSource
  /**
   * Remote directory prefix, or a `.zip` URL. Empty is ignored unless
   * {@link artSource} is `url`.
   */
  artBaseUrl?: string
  /** Active library pack id when {@link artSource} is `library`. */
  artPackId?: string
  /** Bumped when a local or library pack is saved or cleared so the overlay reloads. */
  artPackRev?: number
  /**
   * Legacy right-edge distance. Prefer {@link positionXPx} + {@link positionXEdge}.
   * Still read when the newer fields are absent.
   */
  positionRightPx?: number
  /**
   * Legacy bottom-edge distance. Prefer {@link positionYPx} + {@link positionYEdge}.
   * Still read when the newer fields are absent.
   */
  positionBottomPx?: number
  /** Distance from {@link positionXEdge} in px when customized. */
  positionXPx?: number
  /** Distance from {@link positionYEdge} in px when customized. */
  positionYPx?: number
  /** Horizontal edge the X offset is measured from. */
  positionXEdge?: 'left' | 'right'
  /** Vertical edge the Y offset is measured from. */
  positionYEdge?: 'top' | 'bottom'
  /**
   * When true, the overlay should pick nearer edges once from layout
   * (legacy right/bottom-only prefs). Cleared after that write.
   */
  positionEdgesProvisional?: boolean
  /** When false, the overlay lock chip is hidden; position stays locked. */
  showLockButton?: boolean
  /** Overlay display scale; 1 is the default sprite size. */
  scale?: number
}

/** User-facing prefs after schema defaults. */
export type ResolvedMuyuPrefs = {
  readonly enabled: boolean
  readonly autoDelayMs: number
  readonly autoIntervalMs: number
  readonly comboThreshold: number
  readonly plaque: 'board' | 'censer'
  readonly artSource: MuyuArtSource
  readonly artBaseUrl: string
  readonly artPackId: string
  readonly artPackRev: number
  readonly positionXPx: number
  readonly positionYPx: number
  readonly positionXEdge: 'left' | 'right'
  readonly positionYEdge: 'top' | 'bottom'
  /** See {@link MuyuPrefs.positionEdgesProvisional}. */
  readonly positionEdgesProvisional: boolean
  readonly showLockButton: boolean
  readonly scale: number
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

/** Settings-page / store schema for user prefs. */
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
  artSource: z
    .union(['builtin', 'local', 'url', 'library', 'zip'])
    .default('builtin')
    .description('Active art source: packaged, local working pack, remote URL, or library pack'),
  artBaseUrl: z
    .string()
    .default('')
    .description('Remote sprite directory URL or .zip URL'),
  artPackId: z
    .string()
    .default('')
    .description('Library pack id when artSource is library'),
  artPackRev: z
    .number()
    .step(1)
    .min(0)
    .default(0)
    .description('Local/library pack generation; overlay reloads when this changes'),
  positionRightPx: z
    .number()
    .step(1)
    .default(0)
    .description('Legacy right-edge distance; used only when positionXPx is unset'),
  positionBottomPx: z
    .number()
    .step(1)
    .default(0)
    .description('Legacy bottom-edge distance; used only when positionYPx is unset'),
  positionXPx: z
    .number()
    .step(1)
    .default(0)
    .description('Custom distance from positionXEdge in px'),
  positionYPx: z
    .number()
    .step(1)
    .default(0)
    .description('Custom distance from positionYEdge in px'),
  positionXEdge: z
    .union(['left', 'right'])
    .default('right')
    .description('Horizontal edge for custom placement'),
  positionYEdge: z
    .union(['top', 'bottom'])
    .default('bottom')
    .description('Vertical edge for custom placement'),
  positionEdgesProvisional: z
    .boolean()
    .default(false)
    .description('Pick nearer edges once from layout for legacy right/bottom prefs'),
  showLockButton: z
    .boolean()
    .default(true)
    .description('Show the overlay lock chip used to unlock and drag'),
  scale: z
    .number()
    .step(0.01)
    .min(0.6)
    .max(1.4)
    .default(1)
    .description('Overlay display scale (0.6–1.4)'),
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
  const artSource = input.artSource
    ?? (typeof input.artBaseUrl === 'string' && input.artBaseUrl.trim() !== '' ? 'url' : undefined)
  // Edges/offsets written by the new model win. Legacy right/bottom apply only
  // when those keys were never present (undefined), not when they are 0.
  const hasExplicitEdges = input.positionXEdge !== undefined || input.positionYEdge !== undefined
  const hasNewX = input.positionXPx !== undefined
  const hasNewY = input.positionYPx !== undefined
  const legacyX = input.positionRightPx
  const legacyY = input.positionBottomPx
  const legacyCustom = (legacyX !== undefined && legacyX !== 0)
    || (legacyY !== undefined && legacyY !== 0)
  // Old blobs had offsets but no edge fields — pick nearer edges once from layout.
  const provisional = input.positionEdgesProvisional === true
    || (!hasExplicitEdges && !hasNewX && !hasNewY && legacyCustom)
  const migrated: MuyuPrefs = {
    ...input,
    positionXPx: hasNewX ? input.positionXPx : legacyX,
    positionYPx: hasNewY ? input.positionYPx : legacyY,
    positionXEdge: input.positionXEdge ?? 'right',
    positionYEdge: input.positionYEdge ?? 'bottom',
    positionEdgesProvisional: provisional,
  }
  const raw = Prefs(artSource === undefined ? migrated : { ...migrated, artSource }) as ResolvedMuyuPrefs & {
    positionRightPx?: number
    positionBottomPx?: number
  }
  const {
    positionRightPx: _legacyRight,
    positionBottomPx: _legacyBottom,
    ...prefs
  } = raw
  // Legacy `zip` + pack id → library; bare `zip` still loads the migrated slot via library list.
  if (prefs.artSource === 'zip' && prefs.artPackId.trim() !== '') {
    return { ...prefs, artSource: 'library' }
  }
  return prefs
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
    artSource: input.artSource,
    artBaseUrl: input.artBaseUrl,
    artPackId: input.artPackId,
    artPackRev: input.artPackRev,
    positionRightPx: input.positionRightPx,
    positionBottomPx: input.positionBottomPx,
    positionXPx: input.positionXPx,
    positionYPx: input.positionYPx,
    positionXEdge: input.positionXEdge,
    positionYEdge: input.positionYEdge,
    positionEdgesProvisional: input.positionEdgesProvisional,
    showLockButton: input.showLockButton,
    scale: input.scale,
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
