/**
 * Wooden-fish overlay: character sprite, head hot zone, and session merit plaque.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from 'react'
import clsx from 'clsx'
import type { PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import { resolveMuyuConfig } from '../config.ts'
import { initialMuyuState, stepMuyu, type MuyuEvent, type MuyuPose } from './muyu-machine.ts'
import { useMuyuArt } from './use-muyu-art.ts'
import type { createMuyuStore } from './stores.ts'
import type { MuyuKey } from './locales.ts'
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
  const [machine, setMachine] = useState(initialMuyuState)
  const [plaquePop, setPlaquePop] = useState(false)
  const [floats, setFloats] = useState<number[]>([])
  const [stickAt, setStickAt] = useState<{ x: number; y: number } | null>(null)
  const floatSeq = useRef(0)
  const floatTimers = useRef(new Set<number>())
  const popTimer = useRef<number | undefined>(undefined)
  const reducedMotion = useRef(false)
  const machineRef = useRef(machine)
  const sessionIdRef = useRef(sessionId)
  const runningRef = useRef(running)
  const tunablesRef = useRef(tunables)
  const actionsRef = useRef(actions)
  sessionIdRef.current = sessionId
  runningRef.current = running
  tunablesRef.current = tunables
  actionsRef.current = actions

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
    return () => {
      for (const timer of floatTimers.current) window.clearTimeout(timer)
      if (popTimer.current !== undefined) window.clearTimeout(popTimer.current)
    }
  }, [])

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

  if (!tunables.enabled) return null

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

  return (
    <div className={css.root} data-pose={machine.pose}>
      <div className={css.stage}>
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
          }}
          aria-label={t('knock.aria')}
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
      {stickAt !== null && (
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
        />
      )}
    </div>
  )
}
