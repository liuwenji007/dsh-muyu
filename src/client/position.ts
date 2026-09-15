/**
 * Viewport-edge placement for the wooden-fish overlay.
 * Distances are measured from the nearer edge so left-side placement
 * survives viewport zoom / resize without jumping toward the right.
 */

/** Horizontal edge a stored X offset is measured from. */
export type HorizontalEdge = 'left' | 'right'
/** Vertical edge a stored Y offset is measured from. */
export type VerticalEdge = 'top' | 'bottom'

/** Absolute viewport-edge distances in CSS pixels, with explicit anchors. */
export type MuyuPosition = {
  xEdge: HorizontalEdge
  xPx: number
  yEdge: VerticalEdge
  yPx: number
}

/** Pointer travel (px) required before a drag writes custom placement prefs. */
export const DRAG_COMMIT_PX = 4

/** Default composer-anchored placement (CSS module right/bottom, not custom). */
export function composerPosition(): MuyuPosition {
  return { xEdge: 'right', xPx: 0, yEdge: 'bottom', yPx: 0 }
}

/**
 * True once the user has left the default composer-anchored placement.
 * @param pos - stored position prefs.
 */
export function isCustomPosition(pos: MuyuPosition): boolean {
  return pos.xEdge !== 'right'
    || pos.yEdge !== 'bottom'
    || pos.xPx !== 0
    || pos.yPx !== 0
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
    xEdge: pos.xEdge,
    xPx: Math.round(pos.xPx),
    yEdge: pos.yEdge,
    yPx: Math.round(pos.yPx),
  }
}

/**
 * Map a screen-space pointer delta onto the active edge distances.
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
    xEdge: pos.xEdge,
    xPx: pos.xEdge === 'left' ? pos.xPx + dx : pos.xPx - dx,
    yEdge: pos.yEdge,
    yPx: pos.yEdge === 'top' ? pos.yPx + dy : pos.yPx - dy,
  }
}

/**
 * Choose nearer edges from a layout/visual rect.
 * @param rect - element edges in viewport coordinates.
 * @param viewportW - viewport width.
 * @param viewportH - viewport height.
 */
export function pickAnchoredPosition(
  rect: { left: number; right: number; top: number; bottom: number },
  viewportW: number,
  viewportH: number,
): MuyuPosition {
  const leftPx = rect.left
  const rightPx = viewportW - rect.right
  const topPx = rect.top
  const bottomPx = viewportH - rect.bottom
  const xEdge: HorizontalEdge = leftPx <= rightPx ? 'left' : 'right'
  const yEdge: VerticalEdge = topPx <= bottomPx ? 'top' : 'bottom'
  return roundPosition({
    xEdge,
    xPx: xEdge === 'left' ? leftPx : rightPx,
    yEdge,
    yPx: yEdge === 'top' ? topPx : bottomPx,
  })
}

/**
 * Keep at least `minVisiblePx` of the widget inside the viewport.
 * Preserves the chosen edges so a left-anchored widget stays left on resize.
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

  const maxAlong = (viewport: number) => viewport - minVisible
  const minAlong = (widget: number) => -(widget - minVisible)

  return roundPosition({
    xEdge: pos.xEdge,
    xPx: clampNum(pos.xPx, minAlong(widgetW), maxAlong(viewportW)),
    yEdge: pos.yEdge,
    yPx: clampNum(pos.yPx, minAlong(widgetH), maxAlong(viewportH)),
  })
}

/**
 * Inline CSS for a custom placement (overrides the composer-anchored module defaults).
 * @param pos - anchored position.
 */
export function positionStyle(pos: MuyuPosition): {
  left: string
  right: string
  top: string
  bottom: string
} {
  return {
    left: pos.xEdge === 'left' ? `${pos.xPx}px` : 'auto',
    right: pos.xEdge === 'right' ? `${pos.xPx}px` : 'auto',
    top: pos.yEdge === 'top' ? `${pos.yPx}px` : 'auto',
    bottom: pos.yEdge === 'bottom' ? `${pos.yPx}px` : 'auto',
  }
}

/**
 * Scale transform origin matching the anchored corner so visual edges stay glued.
 * @param pos - anchored position.
 */
export function transformOriginFor(pos: MuyuPosition): string {
  return `${pos.yEdge} ${pos.xEdge}`
}

function clampNum(value: number, min: number, max: number): number {
  if (value < min) return min
  if (value > max) return max
  return value
}
