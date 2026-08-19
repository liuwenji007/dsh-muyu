/**
 * Pose machine for the wooden-fish overlay. Time is injected; React and
 * the merit store stay outside.
 */
import type { ResolvedMuyuConfig } from '../config.ts'

/** Character sprite the widget shows. The stick is a cursor, not a pose. */
export type MuyuPose = 'idle' | 'autoHit' | 'manualHit' | 'bump' | 'bumpBig'

/** Machine fields that are not session merit. */
export interface MuyuMachineState {
  pose: MuyuPose
  /** Manual knocks since the last return to idle. */
  combo: number
  pointerDown: boolean
  /** Clock when the current busy stretch started; null while idle. */
  waitStartedAt: number | null
  /** Clock of the last auto-knock pose; null until the first. */
  lastAutoHitAt: number | null
  /** Clock when the current bump pose should advance; null when not recovering. */
  recoverAt: number | null
  /** Clock of the first manual knock in the current combo; null after idle. */
  comboStartedAt: number | null
  /** Uncapped extra bump hold from combo duration; 0 when not recovering. */
  recoveryExtraMs: number
}

/** One input to {@link stepMuyu}. */
export type MuyuEvent =
  | { type: 'tick'; now: number; running: boolean }
  | { type: 'pointerDown'; now: number }
  | { type: 'pointerUp'; now: number }
  | { type: 'sessionChange' }

/** Next machine state plus merit to add to the current session. */
export interface MuyuStep {
  state: MuyuMachineState
  meritDelta: number
}

/**
 * Fresh overlay machine (idle, no wait, no recovery).
 * @returns the starting machine.
 */
export function initialMuyuState(): MuyuMachineState {
  return {
    pose: 'idle',
    combo: 0,
    pointerDown: false,
    waitStartedAt: null,
    lastAutoHitAt: null,
    recoverAt: null,
    comboStartedAt: null,
    recoveryExtraMs: 0,
  }
}

/**
 * Advance the pose machine.
 * @param state - previous machine.
 * @param event - clock, pointer, or session reset.
 * @param tunables - resolved overlay config.
 * @returns next machine and merit to add (0 when nothing to award).
 */
export function stepMuyu(
  state: MuyuMachineState,
  event: MuyuEvent,
  tunables: ResolvedMuyuConfig,
): MuyuStep {
  switch (event.type) {
    case 'sessionChange':
      return { state: initialMuyuState(), meritDelta: 0 }
    case 'pointerDown':
      return pointerDown(state, event.now)
    case 'pointerUp':
      return pointerUp(state, event.now, tunables)
    case 'tick':
      return tick(state, event.now, event.running, tunables)
    default: {
      const _never: never = event
      throw new Error(`unhandled muyu event: ${String(_never)}`)
    }
  }
}

function pointerDown(state: MuyuMachineState, now: number): MuyuStep {
  if (state.pointerDown) return { state, meritDelta: 0 }
  return {
    state: {
      ...state,
      pose: 'manualHit',
      combo: state.combo + 1,
      pointerDown: true,
      recoverAt: null,
      comboStartedAt: state.comboStartedAt ?? now,
    },
    meritDelta: 1,
  }
}

function pointerUp(
  state: MuyuMachineState,
  now: number,
  tunables: ResolvedMuyuConfig,
): MuyuStep {
  if (!state.pointerDown) return { state, meritDelta: 0 }
  const extra = state.comboStartedAt === null ? 0 : Math.max(0, now - state.comboStartedAt)
  const big = state.combo >= tunables.comboThreshold
  const hold = big
    ? stageHoldMs(tunables.bumpBigMs, extra, tunables.bumpBigMaxMs)
    : stageHoldMs(tunables.bumpMs, extra, tunables.bumpMaxMs)
  return {
    state: {
      ...state,
      pose: big ? 'bumpBig' : 'bump',
      pointerDown: false,
      recoverAt: now + hold,
      recoveryExtraMs: extra,
    },
    meritDelta: 0,
  }
}

function tick(
  state: MuyuMachineState,
  now: number,
  running: boolean,
  tunables: ResolvedMuyuConfig,
): MuyuStep {
  const next = syncWaitClock(state, now, running)
  if (next.pointerDown) return { state: next, meritDelta: 0 }
  if (!running && next.pose === 'autoHit') {
    return { state: endManualStreak({ ...next, pose: 'idle', recoverAt: null }), meritDelta: 0 }
  }
  const recovering = next.pose === 'bump' || next.pose === 'bumpBig'
  if (recovering) return { state: advanceRecovery(next, now, tunables), meritDelta: 0 }
  if (next.pose === 'autoHit') {
    if (next.recoverAt === null || now >= next.recoverAt) {
      return { state: { ...next, pose: 'idle', recoverAt: null }, meritDelta: 0 }
    }
    return { state: next, meritDelta: 0 }
  }
  if (running && next.waitStartedAt !== null && now - next.waitStartedAt >= tunables.autoDelayMs) {
    return autoKnock(next, now, tunables)
  }
  return { state: next, meritDelta: 0 }
}

function syncWaitClock(
  state: MuyuMachineState,
  now: number,
  running: boolean,
): MuyuMachineState {
  if (running) {
    if (state.waitStartedAt !== null) return state
    return { ...state, waitStartedAt: now, lastAutoHitAt: null }
  }
  if (state.waitStartedAt === null && state.lastAutoHitAt === null) return state
  return { ...state, waitStartedAt: null, lastAutoHitAt: null }
}

function autoKnock(
  state: MuyuMachineState,
  now: number,
  tunables: ResolvedMuyuConfig,
): MuyuStep {
  const due = state.lastAutoHitAt === null
    || now - state.lastAutoHitAt >= tunables.autoIntervalMs
  if (!due) return { state, meritDelta: 0 }
  return {
    state: endManualStreak({
      ...state,
      pose: 'autoHit',
      recoverAt: now + tunables.autoHitMs,
      lastAutoHitAt: now,
    }),
    meritDelta: 1,
  }
}

function advanceRecovery(
  state: MuyuMachineState,
  now: number,
  tunables: ResolvedMuyuConfig,
): MuyuMachineState {
  if (state.recoverAt === null || now < state.recoverAt) return state
  if (state.pose === 'bumpBig') {
    return {
      ...state,
      pose: 'bump',
      recoverAt: now + stageHoldMs(tunables.bumpMs, state.recoveryExtraMs, tunables.bumpMaxMs),
    }
  }
  return endManualStreak({ ...state, pose: 'idle', recoverAt: null })
}

function endManualStreak(state: MuyuMachineState): MuyuMachineState {
  return { ...state, combo: 0, comboStartedAt: null, recoveryExtraMs: 0 }
}

/** Hold for one bump stage: base plus combo extra, never above that stage's ceiling. */
function stageHoldMs(base: number, extra: number, max: number): number {
  return Math.min(base + extra, max)
}
