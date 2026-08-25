/**
 * Local-pack workbench: preview each pose, pan/zoom inside a shared crop, then
 * the overlay plays those cropped frames so generated art can be aligned.
 */
import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react'
import clsx from 'clsx'
import { ART_PACK_POSES, type ArtPackFile } from './art-pack.ts'
import {
  ART_FIT_SCALE_MAX, ART_FIT_SCALE_MIN, blobSize, centerCopyFit, containFit, panFit, zoomFit,
  type ArtFit, type ArtStage,
} from './art-fit.ts'
import { objectUrlsForPack, revokeObjectUrls, type StoredArtPack } from './art-idb.ts'
import type { MuyuKey } from './locales.ts'
import css from './ArtWorkbench.module.css'

const POSE_LABEL: Readonly<Record<(typeof ART_PACK_POSES)[number], MuyuKey>> = {
  'idle.png': 'pose.idle',
  'auto-hit.png': 'pose.autoHit',
  'manual-hit.png': 'pose.manualHit',
  'bump.png': 'pose.bump',
  'bump-big.png': 'pose.bumpBig',
  'bump-recover.png': 'pose.bumpRecover',
}

const STAGE_VIEW = 240
const THUMB_W = 56

export type ArtWorkbenchProps = {
  pack: StoredArtPack
  t: (key: MuyuKey) => string
  onCommitLayout: (layout: { stage: ArtStage; fits: Partial<Record<ArtPackFile, ArtFit>> }) => void
}

function poseFilesIn(pack: StoredArtPack): Array<(typeof ART_PACK_POSES)[number]> {
  return ART_PACK_POSES.filter(name => pack.files[name] instanceof Blob)
}

function placed(
  fit: ArtFit,
  size: { width: number; height: number },
  pxPerStage: number,
): { left: number; top: number; width: number; height: number } {
  return {
    left: fit.offsetX * pxPerStage,
    top: fit.offsetY * pxPerStage,
    width: size.width * fit.scale * pxPerStage,
    height: size.height * fit.scale * pxPerStage,
  }
}

/**
 * Pose alignment editor for a loaded local pack.
 * @param props - pack, translator, persist callback.
 */
export function ArtWorkbench({ pack, t, onCommitLayout }: ArtWorkbenchProps) {
  const poses = useMemo(() => poseFilesIn(pack), [pack.files])
  const [selected, setSelected] = useState<(typeof ART_PACK_POSES)[number]>('idle.png')
  const [ghost, setGhost] = useState(true)
  const [fits, setFits] = useState<Partial<Record<ArtPackFile, ArtFit>>>(() => pack.fits ?? {})
  const [stage, setStage] = useState<ArtStage | undefined>(pack.stage)
  const [sizes, setSizes] = useState<Partial<Record<ArtPackFile, { width: number; height: number }>>>({})
  const stageEl = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ x: number; y: number } | null>(null)
  const wheelTimer = useRef<number | undefined>(undefined)
  const fitsRef = useRef(fits)
  const stageHold = useRef(stage)
  fitsRef.current = fits
  stageHold.current = stage

  const originals = useMemo(() => objectUrlsForPack(pack.files), [pack.files])
  useEffect(() => () => { revokeObjectUrls(originals) }, [originals])

  useEffect(() => {
    setFits(pack.fits ?? {})
    setStage(pack.stage)
  }, [pack.savedAt])

  useEffect(() => {
    if (poses.length === 0) return
    if (!poses.includes(selected)) setSelected(poses[0]!)
  }, [poses, selected])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const next: Partial<Record<ArtPackFile, { width: number; height: number }>> = {}
      for (const name of poses) {
        const blob = pack.files[name]
        if (!(blob instanceof Blob)) continue
        try {
          next[name] = await blobSize(blob)
        } catch {
          // skip undecodable frames
        }
      }
      if (!cancelled) setSizes(next)
    })()
    return () => { cancelled = true }
  }, [pack.files, poses])

  useEffect(() => () => {
    if (wheelTimer.current !== undefined) window.clearTimeout(wheelTimer.current)
  }, [])

  const active = poses.includes(selected) ? selected : poses[0]
  const fit = active !== undefined ? fits[active] : undefined
  const size = active !== undefined ? sizes[active] : undefined
  const previewScale = stage !== undefined
    ? STAGE_VIEW / Math.max(stage.width, stage.height)
    : 1
  const viewW = (stage?.width ?? STAGE_VIEW) * previewScale
  const viewH = (stage?.height ?? STAGE_VIEW) * previewScale
  const thumbPx = stage !== undefined ? THUMB_W / stage.width : 1

  const persist = () => {
    const currentStage = stageHold.current
    if (currentStage === undefined) return
    onCommitLayout({ stage: currentStage, fits: fitsRef.current })
  }

  const writeFit = (name: ArtPackFile, next: ArtFit) => {
    const merged = { ...fitsRef.current, [name]: next }
    fitsRef.current = merged
    setFits(merged)
  }

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = { x: event.clientX, y: event.clientY }
  }

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (drag === null || active === undefined) return
    const current = fitsRef.current[active]
    if (current === undefined) return
    const dx = (event.clientX - drag.x) / previewScale
    const dy = (event.clientY - drag.y) / previewScale
    dragRef.current = { x: event.clientX, y: event.clientY }
    writeFit(active, panFit(current, dx, dy))
  }

  const endDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (dragRef.current === null) return
    dragRef.current = null
    try {
      event.currentTarget.releasePointerCapture(event.pointerId)
    } catch {
      // not captured
    }
    persist()
  }

  const onScale = (value: number) => {
    if (active === undefined || stage === undefined) return
    const current = fitsRef.current[active]
    if (current === undefined) return
    writeFit(active, zoomFit(current, value, stage.width / 2, stage.height / 2))
  }

  const resetCurrent = () => {
    if (active === undefined || stage === undefined || size === undefined) return
    writeFit(active, containFit(size.width, size.height, stage))
    persist()
  }

  const copyToPoses = () => {
    if (active === undefined || stage === undefined) return
    const source = fitsRef.current[active]
    const sourceSize = sizes[active]
    if (source === undefined || sourceSize === undefined) return
    const merged = { ...fitsRef.current }
    for (const name of poses) {
      const destSize = sizes[name]
      if (destSize === undefined) continue
      merged[name] = name === active
        ? { ...source }
        : centerCopyFit(source, sourceSize, destSize)
    }
    fitsRef.current = merged
    setFits(merged)
    persist()
  }

  useEffect(() => {
    const el = stageEl.current
    if (el === null || active === undefined) return
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      const current = fitsRef.current[active]
      const currentStage = stageHold.current
      if (current === undefined || currentStage === undefined) return
      const rect = el.getBoundingClientRect()
      const px = STAGE_VIEW / Math.max(currentStage.width, currentStage.height)
      const next = zoomFit(
        current,
        current.scale * (event.deltaY > 0 ? 0.94 : 1.06),
        (event.clientX - rect.left) / px,
        (event.clientY - rect.top) / px,
      )
      writeFit(active, next)
      if (wheelTimer.current !== undefined) window.clearTimeout(wheelTimer.current)
      wheelTimer.current = window.setTimeout(() => { persist() }, 180)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => { el.removeEventListener('wheel', onWheel) }
  }, [active])

  if (poses.length === 0 || stage === undefined) return null

  const idleFit = fits['idle.png']
  const idleSize = sizes['idle.png']
  const idleUrl = originals['idle.png']

  return (
    <div className={css.workbench}>
      <p className={css.hint}>{t('settings.artFit.hint')}</p>
      <div className={css.strip} role="list">
        {poses.map((name) => {
          const thumbFit = fits[name]
          const thumbSize = sizes[name]
          const href = originals[name]
          return (
            <button
              key={name}
              type="button"
              role="listitem"
              className={clsx(css.thumb, name === active && css.thumbActive)}
              aria-pressed={name === active}
              onClick={() => { setSelected(name) }}
            >
              <span className={css.thumbStage} style={{ width: THUMB_W, aspectRatio: `${stage.width} / ${stage.height}` }}>
                {href !== undefined && thumbFit !== undefined && thumbSize !== undefined && (
                  <img
                    className={css.placed}
                    src={href}
                    alt=""
                    draggable={false}
                    style={placed(thumbFit, thumbSize, thumbPx)}
                  />
                )}
              </span>
              <span className={css.thumbLabel}>{t(POSE_LABEL[name])}</span>
            </button>
          )
        })}
      </div>

      {active !== undefined && fit !== undefined && (
        <div className={css.editor}>
          <div
            ref={stageEl}
            className={css.stage}
            style={{ width: viewW, height: viewH }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          >
            {ghost && active !== 'idle.png' && idleUrl !== undefined && idleFit !== undefined && idleSize !== undefined && (
              <img
                className={css.ghost}
                src={idleUrl}
                alt=""
                draggable={false}
                style={placed(idleFit, idleSize, previewScale)}
              />
            )}
            {originals[active] !== undefined && size !== undefined && (
              <img
                className={css.layer}
                src={originals[active]}
                alt={t(POSE_LABEL[active])}
                draggable={false}
                style={placed(fit, size, previewScale)}
              />
            )}
          </div>
          <div className={css.controls}>
            <p className={css.current}>{t(POSE_LABEL[active])}</p>
            <label className={css.scaleRow}>
              <span>{t('settings.artFit.scale')}</span>
              <input
                className={css.slider}
                type="range"
                min={ART_FIT_SCALE_MIN}
                max={ART_FIT_SCALE_MAX}
                step={0.01}
                value={fit.scale}
                onChange={(event) => { onScale(Number(event.currentTarget.value)) }}
                onPointerUp={persist}
                onKeyUp={persist}
              />
              <span className={css.scaleVal}>{Math.round(fit.scale * 100)}%</span>
            </label>
            <label className={css.checkRow}>
              <input
                type="checkbox"
                checked={ghost}
                onChange={(event) => { setGhost(event.currentTarget.checked) }}
              />
              <span>{t('settings.artFit.ghost')}</span>
            </label>
            <div className={css.actions}>
              <button className={css.button} type="button" onClick={resetCurrent}>
                {t('settings.artFit.reset')}
              </button>
              <button className={css.button} type="button" onClick={copyToPoses}>
                {t('settings.artFit.copy')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
