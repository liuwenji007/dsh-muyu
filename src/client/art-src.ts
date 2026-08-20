/**
 * Resolve sprite URLs: optional artBaseUrl prefix, else built-ins.
 * Expected files under the base (same basenames as src/client/assets/):
 * idle.png, auto-hit.png, manual-hit.png, bump.png, bump-big.png,
 * bump-recover.png (optional; missing packs fall back to bump.png),
 * stick.png, board.png, censer.png, add.png
 */
import {
  ADD_SRC, PLAQUE_SRC, POSE_SRC, STICK_SRC,
} from './assets/poses.ts'
import { resolveArtUrl } from './art-url.ts'
import type { MuyuPose } from './muyu-machine.ts'

export { resolveArtUrl } from './art-url.ts'

const POSE_FILE: Readonly<Record<MuyuPose, string>> = {
  idle: 'idle.png',
  autoHit: 'auto-hit.png',
  manualHit: 'manual-hit.png',
  bump: 'bump.png',
  bumpBig: 'bump-big.png',
  bumpRecover: 'bump-recover.png',
}

/** Pose map after applying {@link artBaseUrl}. */
export function resolvePoseSrc(artBaseUrl: string | undefined): Readonly<Record<MuyuPose, string>> {
  return {
    idle: resolveArtUrl(artBaseUrl, POSE_FILE.idle, POSE_SRC.idle),
    autoHit: resolveArtUrl(artBaseUrl, POSE_FILE.autoHit, POSE_SRC.autoHit),
    manualHit: resolveArtUrl(artBaseUrl, POSE_FILE.manualHit, POSE_SRC.manualHit),
    bump: resolveArtUrl(artBaseUrl, POSE_FILE.bump, POSE_SRC.bump),
    bumpBig: resolveArtUrl(artBaseUrl, POSE_FILE.bumpBig, POSE_SRC.bumpBig),
    bumpRecover: resolveArtUrl(artBaseUrl, POSE_FILE.bumpRecover, POSE_SRC.bumpRecover),
  }
}

/**
 * Whether `src` loads as an image. Custom packs may omit bump-recover.png.
 * @param src - resolved sprite URL (packaged data URL or remote).
 */
export function probeImageSrc(src: string): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve(true)
    img.onerror = () => resolve(false)
    img.src = src
  })
}

/** Stick cursor after applying {@link artBaseUrl}. */
export function resolveStickSrc(artBaseUrl: string | undefined): string {
  return resolveArtUrl(artBaseUrl, 'stick.png', STICK_SRC)
}

/** Plaque art after applying {@link artBaseUrl}. */
export function resolvePlaqueSrc(
  artBaseUrl: string | undefined,
  plaque: 'board' | 'censer',
): string {
  const file = plaque === 'board' ? 'board.png' : 'censer.png'
  return resolveArtUrl(artBaseUrl, file, PLAQUE_SRC[plaque])
}

/** Floating +1 after applying {@link artBaseUrl}. */
export function resolveAddSrc(artBaseUrl: string | undefined): string {
  return resolveArtUrl(artBaseUrl, 'add.png', ADD_SRC)
}
