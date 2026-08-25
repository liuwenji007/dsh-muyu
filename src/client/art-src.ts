/**
 * Resolve sprite URLs: blob/file map, optional artBaseUrl prefix, else built-ins.
 * Expected files (same basenames as src/client/assets/):
 * idle.png, auto-hit.png, manual-hit.png, bump.png, bump-big.png,
 * bump-recover.png (optional; missing packs fall back to bump.png),
 * stick.png, board.png, censer.png, add.png
 */
import {
  ADD_SRC, PLAQUE_SRC, POSE_SRC, STICK_SRC,
} from './assets/poses.ts'
import type { ArtPackFile } from './art-pack.ts'
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

/** Object-URL or remote href keyed by art-pack basename. */
export type ArtFileSrcMap = Partial<Record<ArtPackFile, string>>

function pick(
  fileMap: ArtFileSrcMap | undefined,
  file: ArtPackFile,
  viaUrl: string,
): string {
  const mapped = fileMap?.[file]
  return mapped !== undefined && mapped !== '' ? mapped : viaUrl
}

/** Pose map after applying a file map and/or {@link artBaseUrl}. */
export function resolvePoseSrc(
  artBaseUrl: string | undefined,
  fileMap?: ArtFileSrcMap,
): Readonly<Record<MuyuPose, string>> {
  const viaUrl = {
    idle: resolveArtUrl(artBaseUrl, POSE_FILE.idle, POSE_SRC.idle),
    autoHit: resolveArtUrl(artBaseUrl, POSE_FILE.autoHit, POSE_SRC.autoHit),
    manualHit: resolveArtUrl(artBaseUrl, POSE_FILE.manualHit, POSE_SRC.manualHit),
    bump: resolveArtUrl(artBaseUrl, POSE_FILE.bump, POSE_SRC.bump),
    bumpBig: resolveArtUrl(artBaseUrl, POSE_FILE.bumpBig, POSE_SRC.bumpBig),
    bumpRecover: resolveArtUrl(artBaseUrl, POSE_FILE.bumpRecover, POSE_SRC.bumpRecover),
  }
  if (fileMap === undefined) return viaUrl
  const bump = pick(fileMap, 'bump.png', viaUrl.bump)
  return {
    idle: pick(fileMap, 'idle.png', viaUrl.idle),
    autoHit: pick(fileMap, 'auto-hit.png', viaUrl.autoHit),
    manualHit: pick(fileMap, 'manual-hit.png', viaUrl.manualHit),
    bump,
    bumpBig: pick(fileMap, 'bump-big.png', viaUrl.bumpBig),
    bumpRecover: pick(fileMap, 'bump-recover.png', bump),
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

/** Stick cursor after applying a file map and/or {@link artBaseUrl}. */
export function resolveStickSrc(artBaseUrl: string | undefined, fileMap?: ArtFileSrcMap): string {
  return pick(fileMap, 'stick.png', resolveArtUrl(artBaseUrl, 'stick.png', STICK_SRC))
}

/** Plaque art after applying a file map and/or {@link artBaseUrl}. */
export function resolvePlaqueSrc(
  artBaseUrl: string | undefined,
  plaque: 'board' | 'censer',
  fileMap?: ArtFileSrcMap,
): string {
  const file = plaque === 'board' ? 'board.png' : 'censer.png'
  return pick(fileMap, file, resolveArtUrl(artBaseUrl, file, PLAQUE_SRC[plaque]))
}

/** Floating +1 after applying a file map and/or {@link artBaseUrl}. */
export function resolveAddSrc(artBaseUrl: string | undefined, fileMap?: ArtFileSrcMap): string {
  return pick(fileMap, 'add.png', resolveArtUrl(artBaseUrl, 'add.png', ADD_SRC))
}

/**
 * Known bump-recover presence for a blob/file pack. URL directories still probe.
 * @param fileMap - object URLs from a local or zip pack.
 */
export function packHasBumpRecover(fileMap: ArtFileSrcMap | undefined): boolean {
  const src = fileMap?.['bump-recover.png']
  return src !== undefined && src !== ''
}
