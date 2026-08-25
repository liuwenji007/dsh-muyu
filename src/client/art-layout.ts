/**
 * Pack layout: pose crop (stage/fits) plus prop placement (hotzone / stick / add / plaque).
 * Serializes to `layout.json` so remix packs carry alignment with their PNGs.
 */
import type { ArtPackFile } from './art-pack.ts'
import type { ArtFit, ArtStage } from './art-fit.ts'
import { ART_TUNABLES } from '../config.ts'

/** Rectangle in percent of the parent box (0–100). */
export type RectPct = {
  top: number
  left: number
  width: number
  height: number
}

/** Head knock target over the character sprite. */
export type HotzoneLayout = RectPct

/** Stick cursor: hotspot in CSS px from the displayed image top-left, plus max edge. */
export type StickLayout = {
  hotspotX: number
  hotspotY: number
  maxPx: number
}

/** Floating +1 start position over the character stage (%). */
export type AddLayout = {
  top: number
  left: number
  maxPx: number
}

/** One plaque skin: outer size/offset vs character, and text box inside the art. */
export type PlaqueSkinLayout = {
  widthPx: number
  marginBottom: number
  marginLeft: number
  text: RectPct
}

export type PlaqueLayout = {
  board: PlaqueSkinLayout
  censer: PlaqueSkinLayout
}

/** Prop placement for the overlay chrome. */
export type ArtPropsLayout = {
  hotzone: HotzoneLayout
  stick: StickLayout
  add: AddLayout
  plaque: PlaqueLayout
}

/** Full pack layout persisted in IndexedDB and `layout.json`. */
export type ArtPackLayout = {
  stage: ArtStage
  fits: Partial<Record<ArtPackFile, ArtFit>>
  props: ArtPropsLayout
}

/** Defaults matching the shipped CSS / {@link ART_TUNABLES}. */
export const DEFAULT_PROPS_LAYOUT: ArtPropsLayout = {
  hotzone: { top: 0, left: 10, width: 80, height: 55 },
  stick: {
    hotspotX: ART_TUNABLES.stickHotspotX,
    hotspotY: ART_TUNABLES.stickHotspotY,
    maxPx: 72,
  },
  add: { top: 12, left: 50, maxPx: 36 },
  plaque: {
    board: {
      widthPx: 60,
      marginBottom: 20,
      marginLeft: -44,
      text: { top: 28, left: 20, width: 60, height: 30 },
    },
    censer: {
      widthPx: 72,
      marginBottom: 16,
      marginLeft: -50,
      text: { top: 62, left: 26, width: 48, height: 14 },
    },
  },
}

const LAYOUT_VERSION = 1

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min
  return Math.min(max, Math.max(min, n))
}

function clampPct(n: number): number {
  return clamp(n, 0, 100)
}

function asFinite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function parseRectPct(raw: unknown, fallback: RectPct): RectPct {
  if (raw === null || typeof raw !== 'object') return { ...fallback }
  const o = raw as Record<string, unknown>
  return {
    top: clampPct(asFinite(o.top, fallback.top)),
    left: clampPct(asFinite(o.left, fallback.left)),
    width: clampPct(asFinite(o.width, fallback.width)),
    height: clampPct(asFinite(o.height, fallback.height)),
  }
}

function parseStick(raw: unknown, fallback: StickLayout): StickLayout {
  if (raw === null || typeof raw !== 'object') return { ...fallback }
  const o = raw as Record<string, unknown>
  return {
    hotspotX: clamp(asFinite(o.hotspotX, fallback.hotspotX), -200, 200),
    hotspotY: clamp(asFinite(o.hotspotY, fallback.hotspotY), -200, 200),
    maxPx: clamp(asFinite(o.maxPx, fallback.maxPx), 16, 160),
  }
}

function parseAdd(raw: unknown, fallback: AddLayout): AddLayout {
  if (raw === null || typeof raw !== 'object') return { ...fallback }
  const o = raw as Record<string, unknown>
  return {
    top: clampPct(asFinite(o.top, fallback.top)),
    left: clampPct(asFinite(o.left, fallback.left)),
    maxPx: clamp(asFinite(o.maxPx, fallback.maxPx), 12, 96),
  }
}

function parsePlaqueSkin(raw: unknown, fallback: PlaqueSkinLayout): PlaqueSkinLayout {
  if (raw === null || typeof raw !== 'object') {
    return { ...fallback, text: { ...fallback.text } }
  }
  const o = raw as Record<string, unknown>
  return {
    widthPx: clamp(asFinite(o.widthPx, fallback.widthPx), 24, 160),
    marginBottom: clamp(asFinite(o.marginBottom, fallback.marginBottom), -80, 80),
    marginLeft: clamp(asFinite(o.marginLeft, fallback.marginLeft), -120, 40),
    text: parseRectPct(o.text, fallback.text),
  }
}

/**
 * Fill missing prop fields from defaults. Safe for packs imported before props existed.
 * @param partial - stored or parsed props, or undefined.
 */
export function resolvePropsLayout(partial?: Partial<ArtPropsLayout> | null): ArtPropsLayout {
  const d = DEFAULT_PROPS_LAYOUT
  if (partial === undefined || partial === null) {
    return structuredClone(d)
  }
  return {
    hotzone: parseRectPct(partial.hotzone, d.hotzone),
    stick: parseStick(partial.stick, d.stick),
    add: parseAdd(partial.add, d.add),
    plaque: {
      board: parsePlaqueSkin(partial.plaque?.board, d.plaque.board),
      censer: parsePlaqueSkin(partial.plaque?.censer, d.plaque.censer),
    },
  }
}

function parseFit(raw: unknown): ArtFit | undefined {
  if (raw === null || typeof raw !== 'object') return undefined
  const o = raw as Record<string, unknown>
  const scale = asFinite(o.scale, NaN)
  const offsetX = asFinite(o.offsetX, NaN)
  const offsetY = asFinite(o.offsetY, NaN)
  if (!Number.isFinite(scale) || !Number.isFinite(offsetX) || !Number.isFinite(offsetY)) return undefined
  return { scale: clamp(scale, 0.01, 16), offsetX, offsetY }
}

function parseStage(raw: unknown): ArtStage | undefined {
  if (raw === null || typeof raw !== 'object') return undefined
  const o = raw as Record<string, unknown>
  const width = asFinite(o.width, NaN)
  const height = asFinite(o.height, NaN)
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) return undefined
  return { width: Math.round(width), height: Math.round(height) }
}

/** Partial layout from `layout.json` (any subset is ok). */
export type ParsedArtLayout = {
  stage?: ArtStage
  fits?: Partial<Record<ArtPackFile, ArtFit>>
  props: ArtPropsLayout
}

/**
 * Parse `layout.json` text. Invalid JSON / shape → null.
 * @param text - raw file contents.
 */
export function parseLayoutJson(text: string): ParsedArtLayout | null {
  let raw: unknown
  try {
    raw = JSON.parse(text) as unknown
  } catch {
    return null
  }
  if (raw === null || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const fitsRaw = o.fits
  let fits: Partial<Record<ArtPackFile, ArtFit>> | undefined
  if (fitsRaw !== null && typeof fitsRaw === 'object') {
    fits = {}
    for (const [name, value] of Object.entries(fitsRaw as Record<string, unknown>)) {
      const fit = parseFit(value)
      if (fit !== undefined) fits[name as ArtPackFile] = fit
    }
  }
  return {
    stage: parseStage(o.stage),
    fits,
    props: resolvePropsLayout(o.props as Partial<ArtPropsLayout> | undefined),
  }
}

/**
 * Serialize a full layout for zip / directory packs.
 * @param layout - stage, fits, props.
 */
export function serializeLayoutJson(layout: ArtPackLayout): string {
  return `${JSON.stringify({
    version: LAYOUT_VERSION,
    stage: layout.stage,
    fits: layout.fits,
    props: layout.props,
  }, null, 2)}\n`
}

/**
 * Deep-clone props (workbench edits must not mutate defaults).
 * @param props - source.
 */
export function clonePropsLayout(props: ArtPropsLayout): ArtPropsLayout {
  return structuredClone(props)
}
