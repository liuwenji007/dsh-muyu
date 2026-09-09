/**
 * Overlay display scale for the wooden-fish widget.
 */

/** Smallest allowed overlay scale. */
export const SCALE_MIN = 0.6
/** Largest allowed overlay scale. */
export const SCALE_MAX = 1.4
/** Default scale (no transform). */
export const SCALE_DEFAULT = 1
/** One notch for buttons / wheel. */
export const SCALE_STEP = 0.1

/**
 * Clamp and round scale to two decimals within {@link SCALE_MIN}..{@link SCALE_MAX}.
 * @param value - raw scale.
 */
export function clampScale(value: number): number {
  if (!Number.isFinite(value)) return SCALE_DEFAULT
  const clamped = Math.min(SCALE_MAX, Math.max(SCALE_MIN, value))
  return Math.round(clamped * 100) / 100
}

/**
 * Nudge scale by a signed step (buttons / wheel).
 * @param current - current scale.
 * @param delta - usually ±{@link SCALE_STEP}.
 */
export function nudgeScale(current: number, delta: number): number {
  return clampScale(current + delta)
}
