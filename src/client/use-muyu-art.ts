/**
 * Load the active art source: packaged sprites, local IDB pack, imported zip,
 * remote directory URL, or remote zip URL. Also resolves prop layout.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ResolvedMuyuPrefs } from '../config.ts'
import { collectArtPackFromZip, fetchZipBytesCapped, freezeArtBlobs, isZipArtUrl } from './art-files.ts'
import {
  loadArtPack, objectUrlsForFittedPack, objectUrlsForPack, revokeObjectUrls, type ArtPackSlot,
} from './art-idb.ts'
import {
  DEFAULT_PROPS_LAYOUT, parseLayoutJson, resolvePropsLayout, type ArtPropsLayout,
} from './art-layout.ts'
import type { ArtFileSrcMap } from './art-src.ts'
import {
  packHasBumpRecover, probeImageSrc, resolveAddSrc, resolveArtUrl, resolvePlaqueSrc, resolvePoseSrc,
  resolveStickSrc,
} from './art-src.ts'
import type { MuyuPose } from './muyu-machine.ts'

export type MuyuArtSrc = {
  poseSrc: Readonly<Record<MuyuPose, string>>
  stickSrc: string
  addSrc: string
  plaqueSrc: string
  hasBumpRecover: boolean
  props: ArtPropsLayout
}

function slotForSource(source: ResolvedMuyuPrefs['artSource']): ArtPackSlot | null {
  if (source === 'local') return 'local'
  if (source === 'zip') return 'zip'
  return null
}

async function fetchZipBundle(url: string): Promise<{ files: ArtFileSrcMap; props: ArtPropsLayout }> {
  const buffer = await fetchZipBytesCapped(url)
  const pack = await collectArtPackFromZip(buffer)
  if (!pack.ok) throw new Error(`zip pack rejected: ${pack.reason}`)
  const frozen = await freezeArtBlobs(pack.files)
  if (!frozen.ok) throw new Error(`zip pack rejected: ${frozen.reason}`)
  return {
    files: objectUrlsForPack(frozen.files),
    props: resolvePropsLayout(pack.layout?.props),
  }
}

async function fetchDirectoryLayout(base: string): Promise<ArtPropsLayout> {
  const href = resolveArtUrl(base, 'layout.json', '')
  if (href === '') return DEFAULT_PROPS_LAYOUT
  try {
    const response = await fetch(href, { cache: 'no-store' })
    if (!response.ok) return DEFAULT_PROPS_LAYOUT
    const text = await response.text()
    const parsed = parseLayoutJson(text)
    return parsed === null ? DEFAULT_PROPS_LAYOUT : parsed.props
  } catch {
    return DEFAULT_PROPS_LAYOUT
  }
}

/**
 * Resolve overlay sprites + prop layout for the current prefs.
 * Object URLs are revoked on change.
 * @param prefs - resolved user prefs.
 */
export function useMuyuArt(prefs: ResolvedMuyuPrefs): MuyuArtSrc {
  const [fileMap, setFileMap] = useState<ArtFileSrcMap | undefined>(undefined)
  const [propsLayout, setPropsLayout] = useState<ArtPropsLayout>(DEFAULT_PROPS_LAYOUT)
  const [loadedKey, setLoadedKey] = useState('')
  const fileMapRef = useRef(fileMap)
  fileMapRef.current = fileMap
  const slot = slotForSource(prefs.artSource)
  const zipUrl = prefs.artSource === 'url' && isZipArtUrl(prefs.artBaseUrl)
    ? prefs.artBaseUrl.trim()
    : ''
  const directoryUrl = prefs.artSource === 'url' && zipUrl === ''
    ? prefs.artBaseUrl
    : undefined
  const packKey = slot !== null
    ? `${slot}:${prefs.artPackRev}`
    : zipUrl !== ''
      ? `urlzip:${zipUrl}`
      : directoryUrl !== undefined && directoryUrl.trim() !== ''
        ? `urldir:${directoryUrl.trim()}`
        : ''

  useEffect(() => {
    let cancelled = false

    const adopt = (key: string, next: ArtFileSrcMap | undefined, props: ArtPropsLayout) => {
      if (cancelled) {
        revokeObjectUrls(next)
        return
      }
      setFileMap((prev) => {
        if (prev !== next) revokeObjectUrls(prev)
        return next
      })
      setPropsLayout(props)
      setLoadedKey(key)
    }

    if (prefs.artSource === 'builtin' || packKey === '') {
      adopt('', undefined, DEFAULT_PROPS_LAYOUT)
      return
    }

    if (slot !== null) {
      void loadArtPack(slot)
        .then(async (pack) => {
          if (pack === null) {
            adopt(packKey, undefined, DEFAULT_PROPS_LAYOUT)
            return
          }
          adopt(packKey, await objectUrlsForFittedPack(pack), resolvePropsLayout(pack.props))
        })
        .catch(() => { adopt(packKey, undefined, DEFAULT_PROPS_LAYOUT) })
    } else if (zipUrl !== '') {
      void fetchZipBundle(zipUrl)
        .then((bundle) => { adopt(packKey, bundle.files, bundle.props) })
        .catch(() => { adopt(packKey, undefined, DEFAULT_PROPS_LAYOUT) })
    } else if (directoryUrl !== undefined) {
      void fetchDirectoryLayout(directoryUrl)
        .then((props) => { adopt(packKey, undefined, props) })
        .catch(() => { adopt(packKey, undefined, DEFAULT_PROPS_LAYOUT) })
    }

    return () => { cancelled = true }
  }, [packKey, slot, zipUrl, directoryUrl, prefs.artSource])

  useEffect(() => () => {
    revokeObjectUrls(fileMapRef.current)
  }, [])

  const activeMap = loadedKey === packKey && packKey !== '' && slot !== null
    ? fileMap
    : loadedKey === packKey && zipUrl !== ''
      ? fileMap
      : undefined

  const activeProps = loadedKey === packKey && packKey !== ''
    ? propsLayout
    : DEFAULT_PROPS_LAYOUT

  const poseSrc = useMemo(
    () => resolvePoseSrc(directoryUrl, activeMap),
    [directoryUrl, activeMap],
  )
  const stickSrc = useMemo(
    () => resolveStickSrc(directoryUrl, activeMap),
    [directoryUrl, activeMap],
  )
  const addSrc = useMemo(
    () => resolveAddSrc(directoryUrl, activeMap),
    [directoryUrl, activeMap],
  )
  const plaqueSrc = useMemo(
    () => resolvePlaqueSrc(directoryUrl, prefs.plaque, activeMap),
    [directoryUrl, prefs.plaque, activeMap],
  )

  const [probedRecover, setProbedRecover] = useState(true)
  useEffect(() => {
    if (activeMap !== undefined) {
      setProbedRecover(packHasBumpRecover(activeMap))
      return
    }
    const base = directoryUrl?.trim() ?? ''
    if (base === '') {
      setProbedRecover(true)
      return
    }
    setProbedRecover(false)
    let cancelled = false
    void probeImageSrc(poseSrc.bumpRecover).then((ok) => {
      if (!cancelled) setProbedRecover(ok)
    })
    return () => { cancelled = true }
  }, [activeMap, directoryUrl, poseSrc.bumpRecover])

  return {
    poseSrc,
    stickSrc,
    addSrc,
    plaqueSrc,
    hasBumpRecover: probedRecover,
    props: activeProps,
  }
}
