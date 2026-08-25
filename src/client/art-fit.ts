/**
 * Shared crop stage + per-pose pan/zoom. Character frames play in one slot,
 * so they rasterize to the same pixel size (idle's native canvas by default).
 */
import { isArtPackPose, type ArtPackFile } from './art-pack.ts'

export type ArtFit = {
  /** Image scale in stage pixels per source pixel. */
  scale: number
  /** Image top-left in stage pixel space. */
  offsetX: number
  offsetY: number
}

export type ArtStage = {
  width: number
  height: number
}

export const ART_FIT_SCALE_MIN = 0.05
export const ART_FIT_SCALE_MAX = 8

/**
 * Scale-to-fit, centered. Used as the default so a new pack is fully visible.
 * @param srcW - source width.
 * @param srcH - source height.
 * @param stage - crop window.
 */
export function containFit(srcW: number, srcH: number, stage: ArtStage): ArtFit {
  if (srcW <= 0 || srcH <= 0 || stage.width <= 0 || stage.height <= 0) {
    return { scale: 1, offsetX: 0, offsetY: 0 }
  }
  const scale = Math.min(stage.width / srcW, stage.height / srcH)
  return {
    scale,
    offsetX: (stage.width - srcW * scale) / 2,
    offsetY: (stage.height - srcH * scale) / 2,
  }
}

/**
 * Clamp scale and keep the stage point `(pivotX, pivotY)` glued to the same image pixel.
 * @param fit - current transform.
 * @param nextScale - requested scale.
 * @param pivotX - stage X.
 * @param pivotY - stage Y.
 */
export function zoomFit(fit: ArtFit, nextScale: number, pivotX: number, pivotY: number): ArtFit {
  const scale = Math.min(ART_FIT_SCALE_MAX, Math.max(ART_FIT_SCALE_MIN, nextScale))
  if (fit.scale <= 0) return { ...fit, scale }
  const ratio = scale / fit.scale
  return {
    scale,
    offsetX: pivotX - (pivotX - fit.offsetX) * ratio,
    offsetY: pivotY - (pivotY - fit.offsetY) * ratio,
  }
}

export function panFit(fit: ArtFit, dx: number, dy: number): ArtFit {
  return { ...fit, offsetX: fit.offsetX + dx, offsetY: fit.offsetY + dy }
}

/**
 * Natural pixel size of an image blob.
 * @param blob - PNG (or any bitmap the browser can decode).
 */
export async function blobSize(blob: Blob): Promise<{ width: number; height: number }> {
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(blob)
    const size = { width: bitmap.width, height: bitmap.height }
    bitmap.close()
    return size
  }
  return await new Promise((resolve, reject) => {
    const img = new Image()
    const href = URL.createObjectURL(blob)
    img.onload = () => {
      URL.revokeObjectURL(href)
      resolve({ width: img.naturalWidth, height: img.naturalHeight })
    }
    img.onerror = () => {
      URL.revokeObjectURL(href)
      reject(new Error('image decode failed'))
    }
    img.src = href
  })
}

/**
 * Default shared stage (idle size) and contain-fits for every pose.
 * Props are left unfitted so stick/plaque/add keep their own pixels.
 * @param files - imported pack blobs.
 */
export async function initPoseLayout(
  files: Partial<Record<ArtPackFile, Blob>>,
): Promise<{ stage: ArtStage; fits: Partial<Record<ArtPackFile, ArtFit>> }> {
  const idle = files['idle.png']
  const idleSize = idle !== undefined
    ? await blobSize(idle)
    : { width: 512, height: 512 }
  const stage: ArtStage = { width: idleSize.width, height: idleSize.height }
  const fits: Partial<Record<ArtPackFile, ArtFit>> = {}
  for (const [name, blob] of Object.entries(files)) {
    if (!isArtPackPose(name) || !(blob instanceof Blob)) continue
    const size = name === 'idle.png' ? idleSize : await blobSize(blob)
    fits[name] = containFit(size.width, size.height, stage)
  }
  return { stage, fits }
}

/**
 * Draw `blob` through `fit` into a transparent PNG the size of `stage`.
 * @param blob - source image.
 * @param fit - pan/zoom.
 * @param stage - output crop window.
 */
export async function rasterizeFit(blob: Blob, fit: ArtFit, stage: ArtStage): Promise<Blob> {
  const bitmap = await createImageBitmap(blob)
  try {
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(stage.width))
    canvas.height = Math.max(1, Math.round(stage.height))
    const ctx = canvas.getContext('2d')
    if (ctx === null) throw new Error('canvas 2d unavailable')
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(
      bitmap,
      fit.offsetX,
      fit.offsetY,
      bitmap.width * fit.scale,
      bitmap.height * fit.scale,
    )
    const png = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((next) => {
        if (next === null) reject(new Error('toBlob failed'))
        else resolve(next)
      }, 'image/png')
    })
    return png
  } finally {
    bitmap.close()
  }
}
