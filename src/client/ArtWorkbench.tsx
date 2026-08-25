/**
 * Local-pack workbench: align poses, then tune hotzone / stick / add / plaque.
 * Commits a full layout (stage + fits + props) so remix packs travel with placement.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from 'react'
import clsx from 'clsx'
import { ART_PACK_POSES, type ArtPackFile } from './art-pack.ts'
import {
  ART_FIT_SCALE_MAX, ART_FIT_SCALE_MIN, blobSize, centerCopyFit, containFit, panFit, zoomFit,
  type ArtFit, type ArtStage,
} from './art-fit.ts'
import {
  clonePropsLayout, DEFAULT_PROPS_LAYOUT, resolvePropsLayout,
  type ArtPropsLayout, type PlaqueSkinLayout,
} from './art-layout.ts'
import { objectUrlsForPack, revokeObjectUrls, type ArtPackLayoutInput, type StoredArtPack } from './art-idb.ts'
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

type WorkMode = 'poses' | 'hotzone' | 'stick' | 'add' | 'plaque'

const MODE_LABEL: Readonly<Record<WorkMode, MuyuKey>> = {
  poses: 'settings.artFit.mode.poses',
  hotzone: 'settings.artFit.mode.hotzone',
  stick: 'settings.artFit.mode.stick',
  add: 'settings.artFit.mode.add',
  plaque: 'settings.artFit.mode.plaque',
}

const STAGE_VIEW = 240
const THUMB_W = 56
/** Plaque edit preview stays large; `widthPx` only affects the live overlay. */
const PLAQUE_VIEW = 200

export type ArtWorkbenchProps = {
  pack: StoredArtPack
  t: (key: MuyuKey) => string
  onCommitLayout: (layout: ArtPackLayoutInput) => void
}

function poseFilesIn(pack: StoredArtPack): Array<(typeof ART_PACK_POSES)[number]> {
  return ART_PACK_POSES.filter(name => pack.files[name] instanceof Blob)
}

function placed(
  fit: ArtFit,
  size: { width: number; height: number },
  pxPerStage: number,
): CSSProperties {
  return {
    left: fit.offsetX * pxPerStage,
    top: fit.offsetY * pxPerStage,
    width: size.width * fit.scale * pxPerStage,
    height: size.height * fit.scale * pxPerStage,
  }
}

function rectStyle(rect: { top: number; left: number; width: number; height: number }): CSSProperties {
  return {
    top: `${rect.top}%`,
    left: `${rect.left}%`,
    width: `${rect.width}%`,
    height: `${rect.height}%`,
  }
}

/**
 * Pose + prop layout editor for a loaded local pack.
 * @param props - pack, translator, persist callback.
 */
export function ArtWorkbench({ pack, t, onCommitLayout }: ArtWorkbenchProps) {
  const poses = useMemo(() => poseFilesIn(pack), [pack.files])
  const [mode, setMode] = useState<WorkMode>('poses')
  const [selected, setSelected] = useState<(typeof ART_PACK_POSES)[number]>('idle.png')
  const [ghost, setGhost] = useState(true)
  const [fits, setFits] = useState<Partial<Record<ArtPackFile, ArtFit>>>(() => pack.fits ?? {})
  const [stage, setStage] = useState<ArtStage | undefined>(pack.stage)
  const [propsLayout, setPropsLayout] = useState<ArtPropsLayout>(
    () => resolvePropsLayout(pack.props),
  )
  const [plaqueKind, setPlaqueKind] = useState<'board' | 'censer'>('censer')
  const [sizes, setSizes] = useState<Partial<Record<ArtPackFile, { width: number; height: number }>>>({})
  const stageEl = useRef<HTMLDivElement>(null)
  const stickEl = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ x: number; y: number } | null>(null)
  const rectDrag = useRef<{ kind: 'move' | 'resize'; startX: number; startY: number; origin: { top: number; left: number; width: number; height: number } } | null>(null)
  const wheelTimer = useRef<number | undefined>(undefined)
  const fitsRef = useRef(fits)
  const stageHold = useRef(stage)
  const propsRef = useRef(propsLayout)
  fitsRef.current = fits
  stageHold.current = stage
  propsRef.current = propsLayout

  const originals = useMemo(() => objectUrlsForPack(pack.files), [pack.files])
  useEffect(() => () => { revokeObjectUrls(originals) }, [originals])

  useEffect(() => {
    setFits(pack.fits ?? {})
    setStage(pack.stage)
    setPropsLayout(resolvePropsLayout(pack.props))
  }, [pack.savedAt])

  useEffect(() => {
    if (poses.length === 0) return
    if (!poses.includes(selected)) setSelected(poses[0]!)
  }, [poses, selected])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const next: Partial<Record<ArtPackFile, { width: number; height: number }>> = {}
      for (const name of ART_PACK_POSES) {
        const blob = pack.files[name]
        if (!(blob instanceof Blob)) continue
        try {
          next[name] = await blobSize(blob)
        } catch {
          // skip
        }
      }
      for (const name of ['stick.png', 'add.png', 'board.png', 'censer.png'] as const) {
        const blob = pack.files[name]
        if (!(blob instanceof Blob)) continue
        try {
          next[name] = await blobSize(blob)
        } catch {
          // skip
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
    onCommitLayout({
      stage: currentStage,
      fits: fitsRef.current,
      props: propsRef.current,
    })
  }

  const writeFit = (name: ArtPackFile, next: ArtFit) => {
    const merged = { ...fitsRef.current, [name]: next }
    fitsRef.current = merged
    setFits(merged)
  }

  const writeProps = (next: ArtPropsLayout) => {
    propsRef.current = next
    setPropsLayout(next)
  }

  const patchProps = (patch: (prev: ArtPropsLayout) => ArtPropsLayout) => {
    writeProps(patch(propsRef.current))
  }

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || mode !== 'poses') return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = { x: event.clientX, y: event.clientY }
  }

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (drag === null || active === undefined || mode !== 'poses') return
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
    if (mode === 'poses') {
      if (active === undefined || stage === undefined || size === undefined) return
      writeFit(active, containFit(size.width, size.height, stage))
      persist()
      return
    }
    const defaults = DEFAULT_PROPS_LAYOUT
    if (mode === 'hotzone') patchProps(p => ({ ...p, hotzone: { ...defaults.hotzone } }))
    else if (mode === 'stick') patchProps(p => ({ ...p, stick: { ...defaults.stick } }))
    else if (mode === 'add') patchProps(p => ({ ...p, add: { ...defaults.add } }))
    else if (mode === 'plaque') {
      patchProps(p => ({
        ...p,
        plaque: {
          ...p.plaque,
          [plaqueKind]: clonePropsLayout(defaults).plaque[plaqueKind],
        },
      }))
    }
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

  const onStickClick = (event: PointerEvent<HTMLDivElement>) => {
    const el = stickEl.current
    if (el === null) return
    const rect = el.getBoundingClientRect()
    const x = event.clientX - rect.left
    const y = event.clientY - rect.top
    patchProps(p => ({
      ...p,
      stick: { ...p.stick, hotspotX: Math.round(x), hotspotY: Math.round(y) },
    }))
    persist()
  }

  const beginRectDrag = (
    event: PointerEvent<HTMLElement>,
    kind: 'move' | 'resize',
    origin: { top: number; left: number; width: number; height: number },
    apply: (next: { top: number; left: number; width: number; height: number }) => void,
  ) => {
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    const box = event.currentTarget.parentElement?.getBoundingClientRect()
    rectDrag.current = {
      kind,
      startX: event.clientX,
      startY: event.clientY,
      origin: { ...origin },
    }
    const onMove = (ev: globalThis.PointerEvent) => {
      const drag = rectDrag.current
      if (drag === null || box === undefined) return
      const dxPct = ((ev.clientX - drag.startX) / box.width) * 100
      const dyPct = ((ev.clientY - drag.startY) / box.height) * 100
      if (drag.kind === 'move') {
        apply({
          ...drag.origin,
          left: Math.min(100 - drag.origin.width, Math.max(0, drag.origin.left + dxPct)),
          top: Math.min(100 - drag.origin.height, Math.max(0, drag.origin.top + dyPct)),
        })
      } else {
        apply({
          ...drag.origin,
          width: Math.min(100 - drag.origin.left, Math.max(8, drag.origin.width + dxPct)),
          height: Math.min(100 - drag.origin.top, Math.max(8, drag.origin.height + dyPct)),
        })
      }
    }
    const onUp = () => {
      rectDrag.current = null
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      persist()
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  useEffect(() => {
    const el = stageEl.current
    if (el === null || active === undefined || mode !== 'poses') return
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
  }, [active, mode])

  if (poses.length === 0 || stage === undefined) return null

  const idleFit = fits['idle.png']
  const idleSize = sizes['idle.png']
  const idleUrl = originals['idle.png']
  const plaqueSkin: PlaqueSkinLayout = propsLayout.plaque[plaqueKind]
  const plaqueUrl = originals[plaqueKind === 'board' ? 'board.png' : 'censer.png']

  return (
    <div className={css.workbench}>
      <p className={css.hint}>
        {mode === 'poses' ? t('settings.artFit.hint') : t('settings.artFit.propsHint')}
      </p>

      <div className={css.modeRow} role="tablist" aria-label={t('settings.artFit.title')}>
        {(Object.keys(MODE_LABEL) as WorkMode[]).map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={mode === id}
            className={clsx(css.modeBtn, mode === id && css.modeOn)}
            onClick={() => { setMode(id) }}
          >
            {t(MODE_LABEL[id])}
          </button>
        ))}
      </div>

      {mode === 'poses' && (
        <>
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
        </>
      )}

      {mode === 'hotzone' && idleUrl !== undefined && idleFit !== undefined && idleSize !== undefined && (
        <div className={css.editor}>
          <div className={css.stage} style={{ width: viewW, height: viewH }}>
            <img
              className={css.layer}
              src={idleUrl}
              alt=""
              draggable={false}
              style={placed(idleFit, idleSize, previewScale)}
            />
            <div
              className={css.overlayRect}
              style={rectStyle(propsLayout.hotzone)}
              onPointerDown={(event) => {
                beginRectDrag(event, 'move', propsLayout.hotzone, (next) => {
                  patchProps(p => ({ ...p, hotzone: next }))
                })
              }}
            >
              <span
                className={css.resizeHandle}
                onPointerDown={(event) => {
                  beginRectDrag(event, 'resize', propsLayout.hotzone, (next) => {
                    patchProps(p => ({ ...p, hotzone: next }))
                  })
                }}
              />
            </div>
          </div>
          <div className={css.controls}>
            <p className={css.current}>{t('settings.artFit.mode.hotzone')}</p>
            <p className={css.fieldHint}>{t('settings.artFit.hotzoneHint')}</p>
            <button className={css.button} type="button" onClick={resetCurrent}>
              {t('settings.artFit.reset')}
            </button>
          </div>
        </div>
      )}

      {mode === 'stick' && originals['stick.png'] !== undefined && (
        <div className={css.editor}>
          <div
            ref={stickEl}
            className={css.stickStage}
            style={{ maxWidth: propsLayout.stick.maxPx, maxHeight: propsLayout.stick.maxPx }}
            onClick={onStickClick}
          >
            <img
              className={css.stickImg}
              src={originals['stick.png']}
              alt=""
              draggable={false}
              style={{ maxWidth: propsLayout.stick.maxPx, maxHeight: propsLayout.stick.maxPx }}
            />
            <span
              className={css.hotspot}
              style={{ left: propsLayout.stick.hotspotX, top: propsLayout.stick.hotspotY }}
            />
          </div>
          <div className={css.controls}>
            <p className={css.current}>{t('settings.artFit.mode.stick')}</p>
            <p className={css.fieldHint}>{t('settings.artFit.stickHint')}</p>
            <label className={css.scaleRow}>
              <span>{t('settings.artFit.maxPx')}</span>
              <input
                className={css.slider}
                type="range"
                min={16}
                max={160}
                step={1}
                value={propsLayout.stick.maxPx}
                onChange={(event) => {
                  const maxPx = Number(event.currentTarget.value)
                  patchProps(p => ({ ...p, stick: { ...p.stick, maxPx } }))
                }}
                onPointerUp={persist}
                onKeyUp={persist}
              />
              <span className={css.scaleVal}>{propsLayout.stick.maxPx}</span>
            </label>
            <button className={css.button} type="button" onClick={resetCurrent}>
              {t('settings.artFit.reset')}
            </button>
          </div>
        </div>
      )}

      {mode === 'add' && idleUrl !== undefined && idleFit !== undefined && idleSize !== undefined && (
        <div className={css.editor}>
          <div className={css.stage} style={{ width: viewW, height: viewH }}>
            <img
              className={css.layer}
              src={idleUrl}
              alt=""
              draggable={false}
              style={placed(idleFit, idleSize, previewScale)}
            />
            {originals['add.png'] !== undefined && (
              <img
                className={css.addPreview}
                src={originals['add.png']}
                alt=""
                draggable={false}
                style={{
                  top: `${propsLayout.add.top}%`,
                  left: `${propsLayout.add.left}%`,
                  maxWidth: propsLayout.add.maxPx,
                  maxHeight: propsLayout.add.maxPx,
                }}
                onPointerDown={(event) => {
                  if (event.button !== 0) return
                  event.preventDefault()
                  const box = event.currentTarget.parentElement?.getBoundingClientRect()
                  if (box === undefined) return
                  const origin = { ...propsLayout.add }
                  const startX = event.clientX
                  const startY = event.clientY
                  const onMove = (ev: globalThis.PointerEvent) => {
                    const left = Math.min(100, Math.max(0, origin.left + ((ev.clientX - startX) / box.width) * 100))
                    const top = Math.min(100, Math.max(0, origin.top + ((ev.clientY - startY) / box.height) * 100))
                    patchProps(p => ({ ...p, add: { ...p.add, left, top } }))
                  }
                  const onUp = () => {
                    window.removeEventListener('pointermove', onMove)
                    window.removeEventListener('pointerup', onUp)
                    persist()
                  }
                  window.addEventListener('pointermove', onMove)
                  window.addEventListener('pointerup', onUp)
                }}
              />
            )}
          </div>
          <div className={css.controls}>
            <p className={css.current}>{t('settings.artFit.mode.add')}</p>
            <p className={css.fieldHint}>{t('settings.artFit.addHint')}</p>
            <label className={css.scaleRow}>
              <span>{t('settings.artFit.maxPx')}</span>
              <input
                className={css.slider}
                type="range"
                min={12}
                max={96}
                step={1}
                value={propsLayout.add.maxPx}
                onChange={(event) => {
                  const maxPx = Number(event.currentTarget.value)
                  patchProps(p => ({ ...p, add: { ...p.add, maxPx } }))
                }}
                onPointerUp={persist}
                onKeyUp={persist}
              />
              <span className={css.scaleVal}>{propsLayout.add.maxPx}</span>
            </label>
            <button className={css.button} type="button" onClick={resetCurrent}>
              {t('settings.artFit.reset')}
            </button>
          </div>
        </div>
      )}

      {mode === 'plaque' && (
        <div className={css.editor}>
          <div className={css.plaquePreview} style={{ width: PLAQUE_VIEW }}>
            {plaqueUrl !== undefined && (
              <img className={css.plaqueImg} src={plaqueUrl} alt="" draggable={false} />
            )}
            <div
              className={css.overlayRect}
              style={rectStyle(plaqueSkin.text)}
              onPointerDown={(event) => {
                beginRectDrag(event, 'move', plaqueSkin.text, (next) => {
                  patchProps(p => ({
                    ...p,
                    plaque: {
                      ...p.plaque,
                      [plaqueKind]: { ...p.plaque[plaqueKind], text: next },
                    },
                  }))
                })
              }}
            >
              <span className={css.textSample}>88</span>
              <span
                className={css.resizeHandle}
                onPointerDown={(event) => {
                  beginRectDrag(event, 'resize', plaqueSkin.text, (next) => {
                    patchProps(p => ({
                      ...p,
                      plaque: {
                        ...p.plaque,
                        [plaqueKind]: { ...p.plaque[plaqueKind], text: next },
                      },
                    }))
                  })
                }}
              />
            </div>
          </div>
          <div className={`${css.controls} ${css.controlsNarrow}`}>
            <p className={css.current}>{t('settings.artFit.mode.plaque')}</p>
            <div className={css.seg}>
              <button
                type="button"
                className={clsx(css.modeBtn, plaqueKind === 'censer' && css.modeOn)}
                onClick={() => { setPlaqueKind('censer') }}
              >
                {t('settings.plaque.censer')}
              </button>
              <button
                type="button"
                className={clsx(css.modeBtn, plaqueKind === 'board' && css.modeOn)}
                onClick={() => { setPlaqueKind('board') }}
              >
                {t('settings.plaque.board')}
              </button>
            </div>
            <p className={css.fieldHint}>{t('settings.artFit.plaqueHint')}</p>
            <label className={css.scaleRow}>
              <span>{t('settings.artFit.widthPx')}</span>
              <input
                className={css.slider}
                type="range"
                min={24}
                max={160}
                step={1}
                value={plaqueSkin.widthPx}
                onChange={(event) => {
                  const widthPx = Number(event.currentTarget.value)
                  patchProps(p => ({
                    ...p,
                    plaque: {
                      ...p.plaque,
                      [plaqueKind]: { ...p.plaque[plaqueKind], widthPx },
                    },
                  }))
                }}
                onPointerUp={persist}
                onKeyUp={persist}
              />
              <span className={css.scaleVal}>{plaqueSkin.widthPx}</span>
            </label>
            <label className={css.scaleRow}>
              <span>{t('settings.artFit.marginLeft')}</span>
              <input
                className={css.slider}
                type="range"
                min={-120}
                max={40}
                step={1}
                value={plaqueSkin.marginLeft}
                onChange={(event) => {
                  const marginLeft = Number(event.currentTarget.value)
                  patchProps(p => ({
                    ...p,
                    plaque: {
                      ...p.plaque,
                      [plaqueKind]: { ...p.plaque[plaqueKind], marginLeft },
                    },
                  }))
                }}
                onPointerUp={persist}
                onKeyUp={persist}
              />
              <span className={css.scaleVal}>{plaqueSkin.marginLeft}</span>
            </label>
            <button className={css.button} type="button" onClick={resetCurrent}>
              {t('settings.artFit.reset')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
