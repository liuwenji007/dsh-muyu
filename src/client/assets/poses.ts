/** Pose sprite URLs. Replace files of the same basename to swap art. */
import idle from './idle.png'
import autoHit from './auto-hit.png'
import manualHit from './manual-hit.png'
import bump from './bump.png'
import bumpBig from './bump-big.png'
import bumpRecover from './bump-recover.png'
import stick from './stick.png'
import board from './board.png'
import censer from './censer.png'
import add from './add.png'
import type { MuyuPose } from '../muyu-machine.ts'

/** Sprite URL for each character pose. */
export const POSE_SRC: Readonly<Record<MuyuPose, string>> = {
  idle,
  autoHit,
  manualHit,
  bump,
  bumpBig,
  bumpRecover,
}

/** Wooden-stick cursor image (not composited onto the character). */
export const STICK_SRC: string = stick

/** Merit plaque art keyed by the `plaque` config (`board` or `censer`). */
export const PLAQUE_SRC: Readonly<Record<'board' | 'censer', string>> = {
  board,
  censer,
}

/** Floating +1 image shown after a knock that awards merit. */
export const ADD_SRC: string = add
