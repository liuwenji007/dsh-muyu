/**
 * Viewport-edge placement for the wooden-fish overlay.
 * `rightPx` / `bottomPx` are distances from the viewport right / bottom edges.
 */

/** Absolute viewport-edge distances in CSS pixels. */
export type MuyuPosition = {
  rightPx: number
  bottomPx: number
}

/** Pointer travel (px) required before a drag writes custom placement prefs. */
export const DRAG_COMMIT_PX = 4

/**
 * True once the user has left the default composer-anchored placement.
 * @param pos - stored position prefs.
 */
export function isCustomPosition(pos: MuyuPosition): boolean {
  return pos.rightPx !== 0 || pos.bottomPx !== 0
}

/**
 * Whether pointer travel is large enough to commit a custom placement.
 * @param travelPx - Euclidean distance from pointer-down to current point.
 */
export function shouldCommitDrag(travelPx: number): boolean {
  return travelPx >= DRAG_COMMIT_PX
}

/**
 * Integerize edge distances so resize clamp does not thrash prefs on subpixels.
 * @param pos - candidate position.
 */
export function roundPosition(pos: MuyuPosition): MuyuPosition {
  return {
    rightPx: Math.round(pos.rightPx),
    bottomPx: Math.round(pos.bottomPx),
  }
}

/**
 * Map a screen-space pointer delta onto right/bottom edge distances.
 * Dragging right decreases `rightPx`; dragging up (negative dy) increases `bottomPx`.
 * @param pos - position before the move.
 * @param dx - pointer delta X in screen px.
 * @param dy - pointer delta Y in screen px.
 */
export function applyPointerDelta(
  pos: MuyuPosition,
  dx: number,
  dy: number,
): MuyuPosition {
  return {
    rightPx: pos.rightPx - dx,
    bottomPx: pos.bottomPx - dy,
  }
}

/**
 * Keep at least `minVisiblePx` of the widget inside the viewport.
 * @param pos - candidate viewport-edge distances.
 * @param opts - viewport and widget metrics.
 */
export function clampPosition(
  pos: MuyuPosition,
  opts: {
    viewportW: number
    viewportH: number
    widgetW: number
    widgetH: number
    minVisiblePx?: number
  },
): MuyuPosition {
  const minVisible = opts.minVisiblePx ?? 24
  const { viewportW, viewportH, widgetW, widgetH } = opts

  // Keep at least minVisible px of the widget inside the viewport on each edge.
  const maxRight = viewportW - minVisible
  const minRight = -(widgetW - minVisible)
  const maxBottom = viewportH - minVisible
  const minBottom = -(widgetH - minVisible)

  return roundPosition({
    rightPx: clampNum(pos.rightPx, minRight, maxRight),
    bottomPx: clampNum(pos.bottomPx, minBottom, maxBottom),
  })
}

function clampNum(value: number, min: number, max: number): number {
  if (value < min) return min
  if (value > max) return max
  return value
}
