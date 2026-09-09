/**
 * Wooden-fish overlay: character sprite, head hot zone, and session merit plaque.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from 'react'
import { createPortal } from 'react-dom'
import clsx from 'clsx'
import type { PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import { resolveMuyuConfig } from '../config.ts'
import { initialMuyuState, stepMuyu, type MuyuEvent, type MuyuPose } from './muyu-machine.ts'
import { useMuyuArt } from './use-muyu-art.ts'
import type { createMuyuStore } from './stores.ts'
import type { MuyuKey } from './locales.ts'
import {
  applyPointerDelta,
  clampPosition,
  isCustomPosition,
  roundPosition,
  shouldCommitDrag,
  type MuyuPosition,
} from './position.ts'
import { clampScale, nudgeScale, SCALE_MAX, SCALE_MIN, SCALE_STEP } from './scale.ts'
import css from './MuyuWidget.module.css'

const POSE_ALT: Readonly<Record<MuyuPose, MuyuKey>> = {
  idle: 'pose.idle',
  autoHit: 'pose.autoHit',
  manualHit: 'pose.manualHit',
  bump: 'pose.bump',
  bumpBig: 'pose.bumpBig',
  bumpRecover: 'pose.bumpRecover',
}

const TICK_MS = 50
const PLAQUE_POP_MS = 180
const MERIT_FLOAT_MS = 800
/** Hide the lock chip after the pointer leaves the overlay. */
const LOCK_CHROME_HIDE_MS = 2500
/** Exact digits stay on the plaque below this; at and above it they become `Nk`. */
const PLAQUE_K_AT = 10_000

/**
 * Compact plaque text: 9999 stays decimal, 10000 becomes `10k`.
 * @param merit - session merit count.
 * @returns plaque label.
 */
export function formatPlaqueMerit(merit: number): string {
  return merit < PLAQUE_K_AT ? String(merit) : `${Math.floor(merit / 1_000)}k`
}

/** Composed overlay props. */
export type MuyuWidgetProps =
  & PropsRuntime<'shell.overlay'>
  & PropsStore<ReturnType<typeof createMuyuStore>>
  & PropsLocale<'muyu'>

type DragSession = {
  pointerId: number
  lastX: number
  lastY: number
  originX: number
  originY: number
  pos: MuyuPosition
}

/**
 * Convert a layout rect into viewport-edge distances.
 * @param rect - element bounding box in viewport coordinates.
 */
function positionFromRect(rect: DOMRectReadOnly): MuyuPosition {
  return {
    rightPx: window.innerWidth - rect.right,
    bottomPx: window.innerHeight - rect.bottom,
  }
}

function samePosition(a: MuyuPosition, b: MuyuPosition): boolean {
  return a.rightPx === b.rightPx && a.bottomPx === b.bottomPx
}

/**
 * Frame-corner wooden fish.
 * @param props - runtime, store, and locale.
 */
export function MuyuWidget({
  useSessions,
  useStore,
  actions,
  t,
}: MuyuWidgetProps) {
  const sessionId = useSessions(s => s.current)
  const running = useSessions((s) => {
    const id = s.current
    return id !== undefined && s.byId[id]?.running === true
  })
  const prefs = useStore(s => s.prefs)
  const prefsTunables = useMemo(() => resolveMuyuConfig(prefs ?? {}), [prefs])
  const art = useMuyuArt(prefsTunables)
  const poseSrc = art.poseSrc
  const stickSrc = art.stickSrc
  const addSrc = art.addSrc
  const plaqueSrc = art.plaqueSrc
  const propsLayout = art.props
  const tunables = useMemo(
    () => ({ ...prefsTunables, hasBumpRecover: art.hasBumpRecover }),
    [prefsTunables, art.hasBumpRecover],
  )
  const plaqueSkin = propsLayout.plaque[tunables.plaque]
  const merit = useStore(s => {
    const map = s.bySession ?? {}
    return sessionId === undefined ? 0 : (map[sessionId] ?? 0)
  })
  const storedPos = useMemo(
    (): MuyuPosition => ({
      rightPx: tunables.positionRightPx,
      bottomPx: tunables.positionBottomPx,
    }),
    [tunables.positionRightPx, tunables.positionBottomPx],
  )
  const customPlacement = isCustomPosition(storedPos)
  const [locked, setLocked] = useState(true)
  const [lockChromeVisible, setLockChromeVisible] = useState(true)
  const [livePos, setLivePos] = useState<MuyuPosition | null>(null)
  const [machine, setMachine] = useState(initialMuyuState)
  const [plaquePop, setPlaquePop] = useState(false)
  const [floats, setFloats] = useState<number[]>([])
  const [stickAt, setStickAt] = useState<{ x: number; y: number } | null>(null)
  const floatSeq = useRef(0)
  const floatTimers = useRef(new Set<number>())
  const popTimer = useRef<number | undefined>(undefined)
  const lockHideTimer = useRef<number | undefined>(undefined)
  const hoveringRef = useRef(false)
  const lockedRef = useRef(true)
  const reducedMotion = useRef(false)
  const machineRef = useRef(machine)
  const sessionIdRef = useRef(sessionId)
  const runningRef = useRef(running)
  const tunablesRef = useRef(tunables)
  const actionsRef = useRef(actions)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const dragRef = useRef<DragSession | null>(null)
  const storedPosRef = useRef(storedPos)
  sessionIdRef.current = sessionId
  runningRef.current = running
  tunablesRef.current = tunables
  actionsRef.current = actions
  storedPosRef.current = storedPos
  lockedRef.current = locked

  const clearLockHideTimer = useCallback(() => {
    if (lockHideTimer.current === undefined) return
    window.clearTimeout(lockHideTimer.current)
    lockHideTimer.current = undefined
  }, [])

  const revealLockChrome = useCallback(() => {
    clearLockHideTimer()
    setLockChromeVisible(true)
  }, [clearLockHideTimer])

  const scheduleHideLockChrome = useCallback(() => {
    clearLockHideTimer()
    if (!lockedRef.current) return
    lockHideTimer.current = window.setTimeout(() => {
      lockHideTimer.current = undefined
      if (!hoveringRef.current && lockedRef.current) setLockChromeVisible(false)
    }, LOCK_CHROME_HIDE_MS)
  }, [clearLockHideTimer])

  const applyEvent = useCallback((event: MuyuEvent) => {
    const result = stepMuyu(machineRef.current, event, tunablesRef.current)
    machineRef.current = result.state
    setMachine(result.state)
    const id = sessionIdRef.current
    if (result.meritDelta > 0 && id !== undefined) {
      actionsRef.current.addMerit(id, result.meritDelta)
      if (!reducedMotion.current) {
        const floatId = floatSeq.current + 1
        floatSeq.current = floatId
        setFloats(prev => [...prev, floatId])
        const timer = window.setTimeout(() => {
          setFloats(prev => prev.filter(item => item !== floatId))
          floatTimers.current.delete(timer)
        }, MERIT_FLOAT_MS)
        floatTimers.current.add(timer)
        if (popTimer.current !== undefined) window.clearTimeout(popTimer.current)
        setPlaquePop(true)
        popTimer.current = window.setTimeout(() => {
          setPlaquePop(false)
          popTimer.current = undefined
        }, PLAQUE_POP_MS)
      }
    }
  }, [])

  useEffect(() => {
    reducedMotion.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    scheduleHideLockChrome()
    return () => {
      for (const timer of floatTimers.current) window.clearTimeout(timer)
      if (popTimer.current !== undefined) window.clearTimeout(popTimer.current)
      clearLockHideTimer()
    }
  }, [scheduleHideLockChrome, clearLockHideTimer])

  useEffect(() => {
    const next = stepMuyu(initialMuyuState(), { type: 'sessionChange' }, tunablesRef.current).state
    machineRef.current = next
    setMachine(next)
  }, [sessionId])

  useEffect(() => {
    const id = window.setInterval(() => {
      if (!tunablesRef.current.enabled) return
      applyEvent({ type: 'tick', now: Date.now(), running: runningRef.current })
    }, TICK_MS)
    return () => { window.clearInterval(id) }
  }, [applyEvent])

  useEffect(() => {
    if (!tunables.showLockButton) setLocked(true)
  }, [tunables.showLockButton])

  useEffect(() => {
    if (!locked) {
      revealLockChrome()
      return
    }
    if (!hoveringRef.current) scheduleHideLockChrome()
  }, [locked, revealLockChrome, scheduleHideLockChrome])

  // Drop live follow once prefs catch up, so we do not flash back to composer CSS.
  useEffect(() => {
    if (livePos === null) return
    if (dragRef.current !== null) return
    if (samePosition(livePos, storedPos)) setLivePos(null)
  }, [livePos, storedPos])

  const persistClamped = useCallback((pos: MuyuPosition, widgetW: number, widgetH: number) => {
    const next = clampPosition(pos, {
      viewportW: window.innerWidth,
      viewportH: window.innerHeight,
      widgetW,
      widgetH,
    })
    const prev = storedPosRef.current
    if (samePosition(next, prev)) return next
    actionsRef.current.setPrefs({
      positionRightPx: next.rightPx,
      positionBottomPx: next.bottomPx,
    })
    return next
  }, [])

  useEffect(() => {
    if (!tunables.enabled) return

    const ensureVisible = () => {
      if (dragRef.current !== null) return
      const el = rootRef.current
      if (el === null) return
      const rect = el.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return
      const absolute = positionFromRect(rect)
      const custom = isCustomPosition(storedPosRef.current)
      if (!custom) {
        const clamped = clampPosition(absolute, {
          viewportW: window.innerWidth,
          viewportH: window.innerHeight,
          widgetW: rect.width,
          widgetH: rect.height,
        })
        // Compare against rounded absolute so subpixels alone do not pin placement.
        if (!samePosition(clamped, roundPosition(absolute))) {
          actionsRef.current.setPrefs({
            positionRightPx: clamped.rightPx,
            positionBottomPx: clamped.bottomPx,
          })
        }
        return
      }
      persistClamped(storedPosRef.current, rect.width, rect.height)
    }

    const frame = window.requestAnimationFrame(ensureVisible)
    window.addEventListener('resize', ensureVisible)
    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener('resize', ensureVisible)
    }
  }, [tunables.enabled, persistClamped, storedPos])

  useEffect(() => {
    if (!tunables.enabled) return
    const el = rootRef.current
    if (el === null) return
    const onWheel = (event: WheelEvent) => {
      if (lockedRef.current) return
      event.preventDefault()
      event.stopPropagation()
      const current = tunablesRef.current.scale
      const next = nudgeScale(current, event.deltaY > 0 ? -SCALE_STEP : SCALE_STEP)
      if (next === current) return
      revealLockChrome()
      actionsRef.current.setPrefs({ scale: next })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => { el.removeEventListener('wheel', onWheel) }
  }, [tunables.enabled, revealLockChrome])

  if (!tunables.enabled) return null

  const displayPos = livePos ?? (customPlacement ? storedPos : null)
  const scale = clampScale(tunables.scale)
  const rootStyle: CSSProperties = {
    transformOrigin: 'bottom right',
    ...(scale !== 1 ? { transform: `scale(${scale})` } : {}),
    ...(displayPos === null
      ? {}
      : { right: `${displayPos.rightPx}px`, bottom: `${displayPos.bottomPx}px` }),
  }

  const setScaleBy = (delta: number) => {
    if (locked) return
    const next = nudgeScale(tunables.scale, delta)
    if (next === tunables.scale) return
    actions.setPrefs({ scale: next })
  }

  const followStick = (event: PointerEvent<HTMLButtonElement>) => {
    setStickAt({
      x: event.clientX - propsLayout.stick.hotspotX,
      y: event.clientY - propsLayout.stick.hotspotY,
    })
  }

  const onPointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    event.preventDefault()
    followStick(event)
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // jsdom's HTMLElement.setPointerCapture throws NotSupportedError; browsers capture.
    }
    applyEvent({ type: 'pointerDown', now: Date.now() })
  }

  const onPointerUp = (event: PointerEvent<HTMLButtonElement>) => {
    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }
    } catch {
      // jsdom's pointer-capture methods throw NotSupportedError; browsers release.
    }
    applyEvent({ type: 'pointerUp', now: Date.now() })
  }

  const endDrag = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (drag === null || drag.pointerId !== event.pointerId) return
    dragRef.current = null
    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }
    } catch {
      // jsdom pointer-capture stubs may throw.
    }

    const travel = Math.hypot(event.clientX - drag.originX, event.clientY - drag.originY)
    const alreadyCustom = isCustomPosition(storedPosRef.current)
    if (!shouldCommitDrag(travel)) {
      // Click / tiny nudge must not pin composer-anchored placement.
      setLivePos(alreadyCustom ? storedPosRef.current : null)
      return
    }

    const el = rootRef.current
    const rect = el?.getBoundingClientRect()
    if (rect === undefined || rect.width <= 0 || rect.height <= 0) {
      setLivePos(alreadyCustom ? storedPosRef.current : null)
      return
    }
    const next = persistClamped(positionFromRect(rect), rect.width, rect.height)
    setLivePos(next)
  }

  const onRootPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (locked) return
    if (event.button !== 0) return
    const target = event.target
    if (target instanceof Element && target.closest('[data-muyu-chrome]')) return
    const el = rootRef.current
    if (el === null) return
    event.preventDefault()
    const start = positionFromRect(el.getBoundingClientRect())
    dragRef.current = {
      pointerId: event.pointerId,
      lastX: event.clientX,
      lastY: event.clientY,
      originX: event.clientX,
      originY: event.clientY,
      pos: start,
    }
    setLivePos(start)
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // jsdom pointer-capture stubs may throw.
    }
  }

  const onRootPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (drag === null || drag.pointerId !== event.pointerId) return
    const dx = event.clientX - drag.lastX
    const dy = event.clientY - drag.lastY
    const next = applyPointerDelta(drag.pos, dx, dy)
    drag.lastX = event.clientX
    drag.lastY = event.clientY
    drag.pos = next
    setLivePos(next)
  }

  return (
    <div
      ref={rootRef}
      className={css.root}
      data-pose={machine.pose}
      data-unlocked={locked ? undefined : ''}
      data-lock-chrome={tunables.showLockButton && lockChromeVisible ? '' : undefined}
      style={rootStyle}
      onPointerEnter={() => {
        hoveringRef.current = true
        revealLockChrome()
      }}
      onPointerLeave={() => {
        hoveringRef.current = false
        scheduleHideLockChrome()
      }}
      onPointerDown={onRootPointerDown}
      onPointerMove={onRootPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      <div className={css.stage}>
        {tunables.showLockButton && (
          <div
            className={css.chrome}
            data-muyu-chrome=""
            onPointerDown={(event) => { event.stopPropagation() }}
          >
            {!locked && (
              <button
                type="button"
                className={css.scaleBtn}
                tabIndex={lockChromeVisible ? 0 : -1}
                aria-hidden={!lockChromeVisible}
                aria-label={t('scale.down.aria')}
                disabled={scale <= SCALE_MIN}
                onClick={(event) => {
                  event.stopPropagation()
                  setScaleBy(-SCALE_STEP)
                }}
              >
                −
              </button>
            )}
            <button
              type="button"
              className={css.lock}
              data-muyu-lock=""
              tabIndex={lockChromeVisible ? 0 : -1}
              aria-hidden={!lockChromeVisible}
              aria-pressed={!locked}
              aria-label={locked ? t('lock.aria') : t('unlock.aria')}
              onClick={(event) => {
                event.stopPropagation()
                setLocked(prev => !prev)
              }}
            >
              {locked ? (
                <svg className={css.lockIcon} viewBox="0 0 16 16" aria-hidden="true">
                  <path
                    fill="currentColor"
                    d="M8 1a3 3 0 0 0-3 3v2H4a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V7a1 1 0 0 0-1-1h-1V4a3 3 0 0 0-3-3zm1 5H7V4a1 1 0 1 1 2 0v2z"
                  />
                </svg>
              ) : (
                <svg className={css.lockIcon} viewBox="0 0 16 16" aria-hidden="true">
                  <path
                    fill="currentColor"
                    d="M8 1a3 3 0 0 0-3 3h2a1 1 0 1 1 2 0 1 1 0 0 1 1 1h2a3 3 0 0 0-4-2.83V4a3 3 0 0 0-3-3zm-4 6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1H4z"
                  />
                </svg>
              )}
            </button>
            {!locked && (
              <button
                type="button"
                className={css.scaleBtn}
                tabIndex={lockChromeVisible ? 0 : -1}
                aria-hidden={!lockChromeVisible}
                aria-label={t('scale.up.aria')}
                disabled={scale >= SCALE_MAX}
                onClick={(event) => {
                  event.stopPropagation()
                  setScaleBy(SCALE_STEP)
                }}
              >
                +
              </button>
            )}
          </div>
        )}
        <img
          className={css.sprite}
          src={poseSrc[machine.pose]}
          alt={t(POSE_ALT[machine.pose])}
          draggable={false}
        />
        <button
          type="button"
          className={css.hotzone}
          style={{
            top: `${propsLayout.hotzone.top}%`,
            left: `${propsLayout.hotzone.left}%`,
            width: `${propsLayout.hotzone.width}%`,
            height: `${propsLayout.hotzone.height}%`,
            pointerEvents: locked ? undefined : 'none',
          }}
          aria-label={t('knock.aria')}
          tabIndex={locked ? 0 : -1}
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onPointerCancel={(event) => {
            onPointerUp(event)
            setStickAt(null)
          }}
          onPointerMove={followStick}
          onPointerLeave={() => { setStickAt(null) }}
        />
        {floats.map(id => (
          <img
            key={id}
            className={css.meritFloat}
            src={addSrc}
            alt=""
            draggable={false}
            aria-hidden="true"
            data-merit-float=""
            style={{
              top: `${propsLayout.add.top}%`,
              left: `${propsLayout.add.left}%`,
              maxWidth: propsLayout.add.maxPx,
              maxHeight: propsLayout.add.maxPx,
            }}
          />
        ))}
      </div>
      <div
        className={clsx(css.plaque, plaquePop && css.plaquePop)}
        data-plaque={tunables.plaque}
        aria-label={t('plaque.aria')}
        style={{
          width: `min(${plaqueSkin.widthPx}px, 22vw)`,
          marginBottom: plaqueSkin.marginBottom,
          marginLeft: plaqueSkin.marginLeft,
        }}
      >
        <img
          className={css.plaqueBoard}
          src={plaqueSrc}
          alt=""
          draggable={false}
          aria-hidden="true"
          data-plaque-board=""
        />
        <div
          className={css.plaqueCopy}
          style={{
            top: `${plaqueSkin.text.top}%`,
            left: `${plaqueSkin.text.left}%`,
            width: `${plaqueSkin.text.width}%`,
            height: `${plaqueSkin.text.height}%`,
          }}
        >
          <span className={css.plaqueValue}>{formatPlaqueMerit(merit)}</span>
        </div>
      </div>
      {locked && stickAt !== null && createPortal(
        <img
          className={css.stickCursor}
          src={stickSrc}
          alt=""
          draggable={false}
          aria-hidden="true"
          data-stick-cursor=""
          style={{
            left: stickAt.x,
            top: stickAt.y,
            maxWidth: propsLayout.stick.maxPx,
            maxHeight: propsLayout.stick.maxPx,
          }}
        />,
        document.body,
      )}
    </div>
  )
}
