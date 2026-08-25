/**
 * Load the active art source: packaged sprites, local IDB pack, imported zip,
 * remote directory URL, or remote zip URL.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ResolvedMuyuPrefs } from '../config.ts'
import { collectArtPackFromZip, isZipArtUrl } from './art-files.ts'
import {
  loadArtPack, objectUrlsForFittedPack, objectUrlsForPack, revokeObjectUrls, type ArtPackSlot,
} from './art-idb.ts'
import type { ArtFileSrcMap } from './art-src.ts'
import {
  packHasBumpRecover, probeImageSrc, resolveAddSrc, resolvePlaqueSrc, resolvePoseSrc,
  resolveStickSrc,
} from './art-src.ts'
import type { MuyuPose } from './muyu-machine.ts'

export type MuyuArtSrc = {
  poseSrc: Readonly<Record<MuyuPose, string>>
  stickSrc: string
  addSrc: string
  plaqueSrc: string
  hasBumpRecover: boolean
}

function slotForSource(source: ResolvedMuyuPrefs['artSource']): ArtPackSlot | null {
  if (source === 'local') return 'local'
  if (source === 'zip') return 'zip'
  return null
}

async function fetchZipFileMap(url: string): Promise<ArtFileSrcMap> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`zip fetch ${response.status}`)
  const buffer = new Uint8Array(await response.arrayBuffer())
  const pack = await collectArtPackFromZip(buffer)
  if (!pack.ok) throw new Error('zip missing required art files')
  return objectUrlsForPack(pack.files)
}

/**
 * Resolve overlay sprites for the current prefs. Object URLs are revoked on change.
 * @param prefs - resolved user prefs.
 */
export function useMuyuArt(prefs: ResolvedMuyuPrefs): MuyuArtSrc {
  const [fileMap, setFileMap] = useState<ArtFileSrcMap | undefined>(undefined)
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
      : ''

  useEffect(() => {
    let cancelled = false

    const adopt = (key: string, next: ArtFileSrcMap | undefined) => {
      if (cancelled) {
        revokeObjectUrls(next)
        return
      }
      setFileMap((prev) => {
        if (prev !== next) revokeObjectUrls(prev)
        return next
      })
      setLoadedKey(key)
    }

    if (packKey === '') {
      adopt('', undefined)
      return
    }

    if (slot !== null) {
      void loadArtPack(slot)
        .then(async (pack) => {
          if (pack === null) {
            adopt(packKey, undefined)
            return
          }
          adopt(packKey, await objectUrlsForFittedPack(pack))
        })
        .catch(() => { adopt(packKey, undefined) })
    } else {
      void fetchZipFileMap(zipUrl)
        .then((urls) => { adopt(packKey, urls) })
        .catch(() => { adopt(packKey, undefined) })
    }

    return () => { cancelled = true }
  }, [packKey, slot, zipUrl])

  useEffect(() => () => {
    revokeObjectUrls(fileMapRef.current)
  }, [])

  const activeMap = loadedKey === packKey && packKey !== '' ? fileMap : undefined

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
  }
}
