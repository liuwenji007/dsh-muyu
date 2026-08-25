/**
 * Settings section: feel prefs, local working pack, and remote URL/zip.
 * Writes the exclusive store; does not touch Host yaml or settingsScope.
 */
import { useEffect, useRef, useState } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import { resolveMuyuPrefs, type MuyuPrefs } from '../config.ts'
import type { PropsLocale, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import { downloadBuiltinArtPack, downloadStoredArtPack, bakeArtPackForShare, isArtPackPose } from './art-pack.ts'
import { ArtWorkbench, type ArtWorkbenchHandle } from './ArtWorkbench.tsx'
import { blobSize, containFit, initPoseLayout } from './art-fit.ts'
import {
  ART_PACK_MAX_ZIP_BYTES, collectArtPackAsync, collectArtPackFromZip, freezeArtBlobs,
  type CollectArtPackResult,
} from './art-files.ts'
import {
  clearArtPack, defaultLibraryLabel, deleteLibraryPack, layoutFromPack, listLibraryPacks,
  loadArtPack, loadLibraryPack, renameLibraryPack, revokeObjectUrls, saveArtPack,
  saveArtPackLayout, saveLibraryPack,
  type ArtPackLayoutInput, type LibraryPack, type StoredArtPack,
} from './art-idb.ts'
import { resolvePropsLayout } from './art-layout.ts'
import type { createMuyuStore } from './stores.ts'
import css from './MuyuSettings.module.css'

/** Composed settings-page props. */
export type MuyuSettingsProps =
  & PropsStore<ReturnType<typeof createMuyuStore>>
  & PropsLocale<'muyu'>

type ImportStatus = 'idle' | 'ok' | 'fail' | 'missing' | 'empty' | 'tooLarge' | 'notImage'

type ConfirmDialog =
  | { kind: 'editWorkbench'; packId: string; label: string }
  | {
    kind: 'saveLibrary'
    canReplace: boolean
    replaceLabel: string
    mode: 'replace' | 'new'
    name: string
  }

const ART_SOURCE_KEYS = [
  ['builtin', 'settings.artSource.builtin'],
  ['local', 'settings.artSource.local'],
  ['library', 'settings.artSource.library'],
  ['url', 'settings.artSource.url'],
] as const

/** Copy FileList before clearing the input — the list is live and would go empty. */
function snapshotFiles(list: FileList | null): File[] {
  return list === null ? [] : Array.from(list)
}

function filesFromPicked(files: readonly File[]): Array<{ name: string; blob: Blob }> {
  return files.map((file) => ({
    name: file.webkitRelativePath !== '' ? file.webkitRelativePath : file.name,
    blob: file,
  }))
}

function bindDirectoryInput(el: HTMLInputElement | null): void {
  if (el === null) return
  el.webkitdirectory = true
  el.multiple = true
}

async function buildLayout(
  files: Parameters<typeof initPoseLayout>[0],
  imported: Extract<CollectArtPackResult, { ok: true }>['layout'],
): Promise<ArtPackLayoutInput> {
  if (imported?.stage !== undefined && imported.fits !== undefined) {
    return {
      stage: imported.stage,
      fits: imported.fits,
      props: resolvePropsLayout(imported.props),
    }
  }
  const pose = await initPoseLayout(files)
  return {
    stage: pose.stage,
    fits: pose.fits,
    props: resolvePropsLayout(imported?.props),
  }
}

/**
 * Wooden-fish prefs form.
 * @param props - store and locale.
 */
export function MuyuSettings({ useStore, actions, t }: MuyuSettingsProps) {
  const prefs = useStore(s => s.prefs ?? resolveMuyuPrefs())
  const [exportStatus, setExportStatus] = useState<'idle' | 'done' | 'fail'>('idle')
  const [libraryStatus, setLibraryStatus] = useState<ImportStatus>('idle')
  const [localStatus, setLocalStatus] = useState<ImportStatus>('idle')
  const [libraryMissing, setLibraryMissing] = useState<string[]>([])
  const [localMissing, setLocalMissing] = useState<string[]>([])
  const [localNames, setLocalNames] = useState<string[]>([])
  const [localPack, setLocalPack] = useState<StoredArtPack | null>(null)
  const [library, setLibrary] = useState<LibraryPack[]>([])
  const [thumbs, setThumbs] = useState<Record<string, string>>({})
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editLabel, setEditLabel] = useState('')
  const [localMessage, setLocalMessage] = useState('')
  const [libraryEditId, setLibraryEditId] = useState<string | null>(null)
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialog | null>(null)
  const skipLocalReload = useRef(false)
  const localPackRef = useRef(localPack)
  localPackRef.current = localPack
  const workbenchRef = useRef<ArtWorkbenchHandle>(null)
  const libraryEditIdRef = useRef(libraryEditId)
  libraryEditIdRef.current = libraryEditId

  const activeLibraryId = prefs.artSource === 'library' ? prefs.artPackId : ''

  const patch = (next: MuyuPrefs) => {
    try {
      resolveMuyuPrefs({ ...prefs, ...next })
    } catch {
      return
    }
    actions.setPrefs(next)
  }

  const bumpRev = (next: MuyuPrefs) => {
    patch({ ...next, artPackRev: prefs.artPackRev + 1 })
  }

  const refreshLibrary = async () => {
    const packs = await listLibraryPacks()
    setLibrary(packs)
    const nextThumbs: Record<string, string> = {}
    for (const pack of packs) {
      const idle = pack.files['idle.png']
      if (idle instanceof Blob) nextThumbs[pack.id] = URL.createObjectURL(idle)
    }
    setThumbs((prev) => {
      revokeObjectUrls(prev)
      return nextThumbs
    })
    return packs
  }

  useEffect(() => () => { revokeObjectUrls(thumbs) }, [thumbs])

  useEffect(() => {
    if (skipLocalReload.current) {
      skipLocalReload.current = false
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const [local, packs] = await Promise.all([loadArtPack('local'), refreshLibrary()])
        if (cancelled) return
        let nextLocal = local
        if (nextLocal !== null && (nextLocal.stage === undefined || nextLocal.fits === undefined)) {
          const pose = await initPoseLayout(nextLocal.files)
          nextLocal = await saveArtPackLayout('local', {
            stage: pose.stage,
            fits: pose.fits,
            props: resolvePropsLayout(nextLocal.props),
          }) ?? { ...nextLocal, ...pose, props: resolvePropsLayout(nextLocal.props) }
        }
        if (cancelled) return
        setLocalPack(nextLocal)
        setLocalNames(nextLocal?.names ?? [])
        // Legacy zip-only prefs → first library pack after migrate.
        if ((prefs.artSource === 'zip' || prefs.artSource === 'library') && prefs.artPackId === '' && packs[0] !== undefined) {
          bumpRev({ artSource: 'library', artPackId: packs[0].id })
        }
      } catch {
        if (!cancelled) {
          setLocalPack(null)
          setLocalNames([])
          setLibrary([])
        }
      }
    })()
    return () => { cancelled = true }
  }, [prefs.artPackRev])

  const onNumber = (key: 'autoDelayMs' | 'autoIntervalMs' | 'comboThreshold') => (
    event: { currentTarget: { value: string } },
  ) => {
    const n = Number(event.currentTarget.value)
    if (!Number.isFinite(n)) return
    patch({ [key]: n })
  }

  const onExport = () => {
    try {
      downloadBuiltinArtPack()
      setExportStatus('done')
    } catch {
      setExportStatus('fail')
    }
  }

  const rejectLibrary = (collected: Extract<CollectArtPackResult, { ok: false }>) => {
    setLibraryMissing(collected.missingRequired)
    setLibraryStatus(
      collected.reason === 'tooLarge' ? 'tooLarge'
        : collected.reason === 'notImage' ? 'notImage'
          : collected.names.length === 0 ? 'empty'
            : 'missing',
    )
  }

  const rejectLocal = (collected: Extract<CollectArtPackResult, { ok: false }>) => {
    setLocalMissing(collected.missingRequired)
    setLocalMessage('')
    setLocalStatus(
      collected.reason === 'tooLarge' ? 'tooLarge'
        : collected.reason === 'notImage' ? 'notImage'
          : collected.names.length === 0 ? 'empty'
            : 'missing',
    )
  }

  const applyToLocal = async (collected: CollectArtPackResult) => {
    if (!collected.ok) {
      rejectLocal(collected)
      return
    }
    try {
      const frozen = await freezeArtBlobs(collected.files)
      if (!frozen.ok) {
        rejectLocal(frozen)
        return
      }
      const layout = await buildLayout(frozen.files, collected.layout)
      skipLocalReload.current = true
      const saved = await saveArtPack('local', frozen.files, layout)
      setLocalNames(frozen.names)
      setLocalPack(saved)
      setLibraryEditId(null)
      bumpRev({ artSource: 'local', artPackId: '' })
      setLocalMissing([])
      setLocalMessage('')
      setLocalStatus('ok')
    } catch {
      setLocalMessage('')
      setLocalStatus('fail')
    }
  }

  /** Patch known filenames into the workshop slot (same basename replaces). */
  const mergeIntoLocal = async (collected: CollectArtPackResult) => {
    if (!collected.ok) {
      rejectLocal(collected)
      return
    }
    try {
      const frozen = await freezeArtBlobs(collected.files, { requireComplete: false })
      if (!frozen.ok) {
        rejectLocal(frozen)
        return
      }
      const base = localPackRef.current
      const mergedFiles = { ...(base?.files ?? {}), ...frozen.files }
      let layout: ArtPackLayoutInput
      if (collected.layout?.stage !== undefined && collected.layout.fits !== undefined) {
        layout = {
          stage: collected.layout.stage,
          fits: collected.layout.fits,
          props: resolvePropsLayout(collected.layout.props ?? base?.props),
        }
      } else if (base?.stage !== undefined && base.fits !== undefined) {
        const fits = { ...base.fits }
        for (const name of frozen.names) {
          if (!isArtPackPose(name)) continue
          const blob = mergedFiles[name]
          if (!(blob instanceof Blob)) continue
          const size = await blobSize(blob)
          fits[name] = containFit(size.width, size.height, base.stage)
        }
        layout = {
          stage: base.stage,
          fits,
          props: resolvePropsLayout(base.props),
        }
      } else {
        layout = await buildLayout(mergedFiles, collected.layout)
      }
      skipLocalReload.current = true
      const saved = await saveArtPack('local', mergedFiles, layout)
      setLocalNames(saved.names)
      setLocalPack(saved)
      setLibraryEditId(null)
      bumpRev({ artSource: 'local', artPackId: '' })
      setLocalMissing([])
      setLocalMessage('')
      setLocalStatus('ok')
    } catch {
      setLocalMessage('')
      setLocalStatus('fail')
    }
  }

  const applyToLibrary = async (collected: CollectArtPackResult, labelHint?: string) => {
    if (!collected.ok) {
      rejectLibrary(collected)
      return
    }
    try {
      const frozen = await freezeArtBlobs(collected.files)
      if (!frozen.ok) {
        rejectLibrary(frozen)
        return
      }
      const layout = await buildLayout(frozen.files, collected.layout)
      const saved = await saveLibraryPack({
        label: defaultLibraryLabel(labelHint),
        files: frozen.files,
        layout,
      })
      await refreshLibrary()
      bumpRev({ artSource: 'library', artPackId: saved.id })
      setLibraryMissing([])
      setLibraryStatus('ok')
    } catch {
      setLibraryStatus('fail')
    }
  }

  const onLocalFolder = (event: { currentTarget: HTMLInputElement }) => {
    const picked = snapshotFiles(event.currentTarget.files)
    event.currentTarget.value = ''
    if (picked.length === 0) {
      setLocalStatus('empty')
      return
    }
    void (async () => {
      await applyToLocal(await collectArtPackAsync(filesFromPicked(picked)))
    })()
  }

  const onLocalFiles = (event: { currentTarget: HTMLInputElement }) => {
    const picked = snapshotFiles(event.currentTarget.files)
    event.currentTarget.value = ''
    if (picked.length === 0) {
      setLocalStatus('empty')
      return
    }
    void (async () => {
      await mergeIntoLocal(await collectArtPackAsync(filesFromPicked(picked), { requireComplete: false }))
    })()
  }

  const onLibraryZip = (event: { currentTarget: HTMLInputElement }) => {
    const file = snapshotFiles(event.currentTarget.files)[0]
    event.currentTarget.value = ''
    if (file === undefined) {
      setLibraryStatus('empty')
      return
    }
    if (file.size > ART_PACK_MAX_ZIP_BYTES) {
      setLibraryStatus('tooLarge')
      return
    }
    void (async () => {
      try {
        const bytes = new Uint8Array(await file.arrayBuffer())
        await applyToLibrary(await collectArtPackFromZip(bytes), file.name)
      } catch {
        setLibraryStatus('fail')
      }
    })()
  }

  const onLibraryFolder = (event: { currentTarget: HTMLInputElement }) => {
    const picked = snapshotFiles(event.currentTarget.files)
    event.currentTarget.value = ''
    if (picked.length === 0) {
      setLibraryStatus('empty')
      return
    }
    void (async () => {
      await applyToLibrary(await collectArtPackAsync(filesFromPicked(picked)))
    })()
  }

  const onClearLocal = () => {
    void (async () => {
      try {
        await clearArtPack('local')
        setLocalNames([])
        setLocalPack(null)
        setLibraryEditId(null)
        bumpRev({
          artSource: prefs.artSource === 'local' ? 'builtin' : prefs.artSource,
          artPackId: prefs.artSource === 'local' ? '' : prefs.artPackId,
        })
        setLocalMessage('')
        setLocalStatus('idle')
      } catch {
        setLocalStatus('fail')
      }
    })()
  }

  const fillTemplate = (template: string, values: Record<string, string>) => (
    Object.entries(values).reduce(
      (text, [key, value]) => text.replaceAll(`{${key}}`, value),
      template,
    )
  )

  const onSaveLocalToLibrary = () => {
    if (localPackRef.current === null) return
    const existingId = libraryEditIdRef.current
    const existing = existingId === null
      ? undefined
      : library.find(pack => pack.id === existingId)
    setConfirmDialog({
      kind: 'saveLibrary',
      canReplace: existing !== undefined,
      replaceLabel: existing?.label ?? '',
      mode: existing !== undefined ? 'replace' : 'new',
      name: existing?.label ?? defaultLibraryLabel('制作'),
    })
  }

  /** Switch the overlay to a library pack without touching the workbench. */
  const onUseLibrary = (id: string) => {
    bumpRev({ artSource: 'library', artPackId: id })
  }

  const loadLibraryIntoWorkbench = async (id: string) => {
    const pack = await loadLibraryPack(id)
    if (pack === null) {
      setLibraryStatus('fail')
      return
    }
    let layout = layoutFromPack(pack)
    if (layout === null) {
      const pose = await initPoseLayout(pack.files)
      layout = {
        stage: pose.stage,
        fits: pose.fits,
        props: resolvePropsLayout(pack.props),
      }
    }
    skipLocalReload.current = true
    const saved = await saveArtPack('local', pack.files, layout)
    setLocalPack(saved)
    setLocalNames(saved.names)
    setLibraryEditId(id)
    setLocalMessage('')
    bumpRev({ artSource: 'library', artPackId: id })
  }

  const askEditLibrary = (id: string, label: string) => {
    setConfirmDialog({ kind: 'editWorkbench', packId: id, label })
  }

  const commitSaveToLibrary = async (replace: boolean, name: string) => {
    const pack = localPackRef.current
    if (pack === null) return
    try {
      const flushed = workbenchRef.current?.flushLayout() ?? null
      const layout = flushed ?? layoutFromPack(pack)
      if (layout === null || layout.stage === undefined || layout.fits === undefined) {
        setLocalMessage(t('settings.artLocal.saveLibraryFail'))
        setLocalStatus('fail')
        return
      }
      const full = {
        stage: layout.stage,
        fits: layout.fits,
        props: resolvePropsLayout(layout.props),
      }
      const baked = await bakeArtPackForShare(pack.files, full)
      const existingId = libraryEditIdRef.current
      const label = name.trim() === '' ? defaultLibraryLabel('制作') : name.trim()
      const saved = await saveLibraryPack({
        id: replace && existingId !== null ? existingId : undefined,
        label,
        files: baked.files,
        layout: baked.layout,
      })
      setLibraryEditId(saved.id)
      await refreshLibrary()
      bumpRev({ artSource: 'library', artPackId: saved.id })
      setLocalMessage(t('settings.artLocal.savedLibrary'))
      setLocalStatus('ok')
      setLibraryStatus('ok')
    } catch {
      setLocalMessage(t('settings.artLocal.saveLibraryFail'))
      setLocalStatus('fail')
      setLibraryStatus('fail')
    }
  }

  const onConfirmDialog = () => {
    const dialog = confirmDialog
    if (dialog === null) return
    if (dialog.kind === 'editWorkbench') {
      setConfirmDialog(null)
      void loadLibraryIntoWorkbench(dialog.packId).catch(() => {
        setLibraryStatus('fail')
      })
      return
    }
    if (dialog.mode === 'new' && dialog.name.trim() === '') return
    setConfirmDialog(null)
    void commitSaveToLibrary(dialog.mode === 'replace', dialog.name)
  }

  const onDeleteLibrary = (id: string) => {
    void (async () => {
      try {
        await deleteLibraryPack(id)
        const packs = await refreshLibrary()
        if (activeLibraryId === id) {
          const next = packs[0]
          bumpRev(next === undefined
            ? { artSource: 'builtin', artPackId: '' }
            : { artSource: 'library', artPackId: next.id })
        } else {
          bumpRev({})
        }
      } catch {
        setLibraryStatus('fail')
      }
    })()
  }

  const onRenameCommit = (id: string) => {
    void (async () => {
      try {
        await renameLibraryPack(id, editLabel)
        setEditingId(null)
        await refreshLibrary()
        bumpRev({})
      } catch {
        setLibraryStatus('fail')
      }
    })()
  }

  const onCommitLayout = (layout: ArtPackLayoutInput) => {
    setLocalPack(prev => prev === null ? prev : {
      ...prev,
      stage: layout.stage,
      fits: layout.fits,
      props: layout.props,
    })
    skipLocalReload.current = true
    void saveArtPackLayout('local', layout).then(() => {
      bumpRev({})
    }).catch(() => {
      skipLocalReload.current = false
      setLocalStatus('fail')
    })
  }

  const onExportLocal = () => {
    const pack = localPackRef.current
    if (pack === null) return
    const flushed = workbenchRef.current?.flushLayout() ?? null
    const layout = flushed ?? layoutFromPack(pack)
    if (layout === null || layout.stage === undefined || layout.fits === undefined) {
      setExportStatus('fail')
      return
    }
    setExportStatus('idle')
    void downloadStoredArtPack(pack.files, {
      stage: layout.stage,
      fits: layout.fits,
      props: resolvePropsLayout(layout.props),
    }).then(() => {
      setExportStatus('done')
    }).catch(() => {
      setExportStatus('fail')
    })
  }

  useEffect(() => {
    if (exportStatus !== 'done') return
    const timer = window.setTimeout(() => { setExportStatus('idle') }, 2500)
    return () => { window.clearTimeout(timer) }
  }, [exportStatus])

  const statusHint = (status: ImportStatus, missing: string[]) => (
    status === 'ok'
      ? t('settings.artImport.ok')
      : status === 'fail'
        ? t('settings.artImport.fail')
        : status === 'tooLarge'
          ? t('settings.artImport.tooLarge')
          : status === 'notImage'
            ? t('settings.artImport.notImage')
            : status === 'missing'
              ? `${t('settings.artImport.missing')} ${missing.join(', ')}`
              : status === 'empty'
                ? t('settings.artImport.empty')
                : ''
  )

  const libraryHint = statusHint(libraryStatus, libraryMissing)
  const localHint = statusHint(localStatus, localMissing)
  const sourceActive = (source: (typeof ART_SOURCE_KEYS)[number][0]) => {
    if (source === 'library') return prefs.artSource === 'library' || prefs.artSource === 'zip'
    return prefs.artSource === source
  }

  return (
    <form className={css.page} onSubmit={(event) => { event.preventDefault() }}>
      <h2 className={css.title}>{t('settings.title')}</h2>

      <section className={css.section} aria-label={t('settings.section.feel')}>
        <div className={css.sectionHead}>
          <h3 className={css.sectionTitle}>{t('settings.section.feel')}</h3>
        </div>

        <div className={`${css.row} ${css.rowAfterHead}`}>
          <div className={css.rowLabel}>
            <span className={css.label}>{t('settings.enabled')}</span>
            <span className={css.hint}>{t('settings.enabled.hint')}</span>
          </div>
          <div className={css.control}>
            <input
              className={css.check}
              type="checkbox"
              checked={prefs.enabled}
              onChange={(event) => { patch({ enabled: event.currentTarget.checked }) }}
            />
          </div>
        </div>

        <div className={css.row}>
          <div className={css.rowLabel}>
            <span className={css.label}>{t('settings.plaque')}</span>
          </div>
          <div className={css.control}>
            <select
              className={css.select}
              value={prefs.plaque}
              onChange={(event) => {
                const value = event.currentTarget.value
                if (value === 'board' || value === 'censer') patch({ plaque: value })
              }}
            >
              <option value="censer">{t('settings.plaque.censer')}</option>
              <option value="board">{t('settings.plaque.board')}</option>
            </select>
          </div>
        </div>

        <div className={css.row}>
          <div className={css.rowLabel}>
            <span className={css.label}>{t('settings.autoDelayMs')}</span>
          </div>
          <div className={css.control}>
            <input
              className={css.input}
              type="number"
              min={0}
              step={1}
              value={prefs.autoDelayMs}
              onChange={onNumber('autoDelayMs')}
            />
            <span className={css.suffix}>{t('settings.ms')}</span>
          </div>
        </div>

        <div className={css.row}>
          <div className={css.rowLabel}>
            <span className={css.label}>{t('settings.autoIntervalMs')}</span>
          </div>
          <div className={css.control}>
            <input
              className={css.input}
              type="number"
              min={1}
              step={1}
              value={prefs.autoIntervalMs}
              onChange={onNumber('autoIntervalMs')}
            />
            <span className={css.suffix}>{t('settings.ms')}</span>
          </div>
        </div>

        <div className={css.row}>
          <div className={css.rowLabel}>
            <span className={css.label}>{t('settings.comboThreshold')}</span>
          </div>
          <div className={css.control}>
            <input
              className={css.input}
              type="number"
              min={1}
              step={1}
              value={prefs.comboThreshold}
              onChange={onNumber('comboThreshold')}
            />
          </div>
        </div>
      </section>

      <section className={css.section} aria-label={t('settings.section.art')}>
        <div className={css.sectionHead}>
          <h3 className={css.sectionTitle}>{t('settings.section.art')}</h3>
          <p className={css.sectionHint}>{t('settings.artSource.hint')}</p>
        </div>

        <fieldset className={css.sourceList}>
          <legend className={css.label}>{t('settings.artSource')}</legend>
          <div className={css.seg} role="radiogroup" aria-label={t('settings.artSource')}>
            {ART_SOURCE_KEYS.map(([source, key]) => (
              <button
                key={source}
                type="button"
                className={sourceActive(source) ? `${css.segBtn} ${css.segOn}` : css.segBtn}
                role="radio"
                aria-checked={sourceActive(source)}
                onClick={() => {
                  if (source === 'library') {
                    const id = prefs.artPackId || library[0]?.id || ''
                    if (id === '') return
                    onUseLibrary(id)
                    return
                  }
                  patch({ artSource: source })
                }}
              >
                {t(key)}
              </button>
            ))}
          </div>
        </fieldset>
      </section>

      <section className={css.section} aria-label={t('settings.section.artLibrary')}>
        <div className={css.sectionHead}>
          <h3 className={css.sectionTitle}>{t('settings.section.artLibrary')}</h3>
          <p className={css.sectionHint}>{t('settings.artLibrary.hint')}</p>
        </div>

        <div className={css.toolbar}>
          <div className={css.actions}>
            <label className={css.fileButton}>
              <input
                className={css.fileInput}
                type="file"
                accept=".zip,application/zip"
                onChange={onLibraryZip}
              />
              {t('settings.artLibrary.importZip')}
            </label>
            <label className={css.fileButton}>
              <input
                className={css.fileInput}
                type="file"
                multiple
                ref={bindDirectoryInput}
                onChange={onLibraryFolder}
              />
              {t('settings.artLibrary.importFolder')}
            </label>
          </div>
        </div>

        {library.length === 0 ? (
          <p className={css.meta}>{t('settings.artLibrary.empty')}</p>
        ) : (
          <ul className={css.libraryList}>
            {library.map((pack) => {
              const active = activeLibraryId === pack.id
              return (
                <li key={pack.id} className={active ? `${css.libraryItem} ${css.libraryItemActive}` : css.libraryItem}>
                  <div className={css.libraryThumb}>
                    {thumbs[pack.id] !== undefined ? (
                      <img src={thumbs[pack.id]} alt="" draggable={false} />
                    ) : (
                      <span className={css.libraryThumbEmpty} />
                    )}
                  </div>
                  <div className={css.libraryBody}>
                    {editingId === pack.id ? (
                      <input
                        className={css.input}
                        value={editLabel}
                        autoFocus
                        onChange={(event) => { setEditLabel(event.currentTarget.value) }}
                        onBlur={() => { onRenameCommit(pack.id) }}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') onRenameCommit(pack.id)
                          if (event.key === 'Escape') setEditingId(null)
                        }}
                      />
                    ) : (
                      <button
                        type="button"
                        className={css.libraryName}
                        onClick={() => {
                          setEditingId(pack.id)
                          setEditLabel(pack.label)
                        }}
                        title={t('settings.artLibrary.rename')}
                      >
                        {pack.label}
                        {active ? ` · ${t('settings.artLibrary.active')}` : ''}
                      </button>
                    )}
                    <p className={css.meta}>
                      {pack.names.length} {t('settings.artLibrary.files')}
                      {' · '}
                      {new Date(pack.savedAt).toLocaleString()}
                    </p>
                    <div className={css.actions}>
                      <Button
                        variant={active ? 'primary' : 'outline'}
                        size="sm"
                        type="button"
                        disabled={active}
                        onClick={() => { onUseLibrary(pack.id) }}
                      >
                        {active ? t('settings.artLibrary.using') : t('settings.artLibrary.use')}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        type="button"
                        onClick={() => { askEditLibrary(pack.id, pack.label) }}
                      >
                        {t('settings.artLibrary.edit')}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        type="button"
                        onClick={() => { onDeleteLibrary(pack.id) }}
                      >
                        {t('settings.artLibrary.delete')}
                      </Button>
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
        {libraryHint !== '' && (
          <p
            className={libraryStatus === 'ok' ? `${css.status} ${css.statusOk}` : `${css.status} ${css.statusError}`}
            role={libraryStatus === 'ok' ? 'status' : 'alert'}
          >
            {libraryHint}
          </p>
        )}
      </section>

      <section className={css.section} aria-label={t('settings.section.artLocal')}>
        <div className={css.sectionHead}>
          <h3 className={css.sectionTitle}>{t('settings.section.artLocal')}</h3>
          <p className={css.sectionHint}>{t('settings.artLocal.hint')}</p>
        </div>

        <div className={css.toolbar}>
          <div className={css.actions}>
            <label className={css.fileButton}>
              <input
                className={css.fileInput}
                type="file"
                multiple
                ref={bindDirectoryInput}
                onChange={onLocalFolder}
              />
              {t('settings.artLocal.folder')}
            </label>
            <label className={css.fileButton}>
              <input
                className={css.fileInput}
                type="file"
                accept=".png,image/png"
                multiple
                onChange={onLocalFiles}
              />
              {t('settings.artLocal.files')}
            </label>
          </div>
          <Button
            variant="outline"
            size="sm"
            type="button"
            disabled={localNames.length === 0}
            onClick={onClearLocal}
          >
            {t('settings.artLocal.clear')}
          </Button>
        </div>
        <p className={css.meta}>
          {localNames.length === 0
            ? t('settings.artLocal.empty')
            : `${t('settings.artLocal.loaded')} ${localNames.length} ${t('settings.artLocal.count')}`}
        </p>
        {localMessage === '' && localHint !== '' && (
          <p
            className={localStatus === 'ok' ? `${css.status} ${css.statusOk}` : `${css.status} ${css.statusError}`}
            role={localStatus === 'ok' ? 'status' : 'alert'}
          >
            {localHint}
          </p>
        )}
        {localPack !== null && localPack.stage !== undefined && (
          <div className={css.panel}>
            <h4 className={css.panelTitle}>{t('settings.artFit.title')}</h4>
            <ArtWorkbench ref={workbenchRef} pack={localPack} t={t} onCommitLayout={onCommitLayout} />
            <div className={css.toolbar}>
              <p className={css.hint}>{t('settings.artExport.localHint')}</p>
              <div className={css.actions}>
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  onClick={onSaveLocalToLibrary}
                >
                  {t('settings.artLocal.saveLibrary')}
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  type="button"
                  onClick={onExportLocal}
                >
                  {t('settings.artExport.local')}
                </Button>
              </div>
            </div>
            {localMessage !== '' && (
              <p
                className={localStatus === 'ok' ? `${css.status} ${css.statusOk}` : `${css.status} ${css.statusError}`}
                role={localStatus === 'ok' ? 'status' : 'alert'}
              >
                {localMessage}
              </p>
            )}
            {exportStatus === 'done' && (
              <p className={`${css.status} ${css.statusOk}`} role="status">{t('settings.artExport.done')}</p>
            )}
            {exportStatus === 'fail' && (
              <p className={`${css.status} ${css.statusError}`} role="alert">{t('settings.artExport.fail')}</p>
            )}
          </div>
        )}
        {localPack === null && localMessage !== '' && (
          <p
            className={localStatus === 'ok' ? `${css.status} ${css.statusOk}` : `${css.status} ${css.statusError}`}
            role={localStatus === 'ok' ? 'status' : 'alert'}
          >
            {localMessage}
          </p>
        )}
      </section>

      <section className={css.section} aria-label={t('settings.section.artRemote')}>
        <div className={css.sectionHead}>
          <h3 className={css.sectionTitle}>{t('settings.section.artRemote')}</h3>
          <p className={css.sectionHint}>{t('settings.artRemote.hint')}</p>
        </div>

        <div className={`${css.row} ${css.rowAfterHead}`}>
          <div className={css.rowLabel}>
            <span className={css.label}>{t('settings.artBaseUrl')}</span>
            <span className={css.hint}>{t('settings.artBaseUrl.hint')}</span>
          </div>
        </div>
        <div className={css.row}>
          <input
            className={`${css.input} ${css.inputWide}`}
            type="url"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            placeholder={t('settings.artBaseUrl.placeholder')}
            value={prefs.artBaseUrl ?? ''}
            onChange={(event) => {
              const artBaseUrl = event.currentTarget.value
              patch({
                artBaseUrl,
                artSource: artBaseUrl.trim() === '' && prefs.artSource === 'url'
                  ? 'builtin'
                  : artBaseUrl.trim() === ''
                    ? prefs.artSource
                    : 'url',
              })
            }}
          />
        </div>

        <div className={css.toolbar}>
          <div className={css.actions}>
            <Button variant="outline" size="sm" type="button" onClick={onExport}>
              {t('settings.artExport')}
            </Button>
          </div>
        </div>
        <p className={css.hint}>{t('settings.artExport.hint')}</p>
      </section>

      {confirmDialog !== null && (
        <div
          className={css.dialogBackdrop}
          role="presentation"
          onClick={() => { setConfirmDialog(null) }}
        >
          <div
            className={css.dialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="muyu-confirm-title"
            onClick={(event) => { event.stopPropagation() }}
          >
            {confirmDialog.kind === 'editWorkbench' ? (
              <>
                <div className={css.dialogHead}>
                  <h4 className={css.dialogTitle} id="muyu-confirm-title">
                    {t('settings.artLibrary.editConfirm.title')}
                  </h4>
                  <p className={css.dialogBody}>
                    {fillTemplate(t('settings.artLibrary.editConfirm.body'), { name: confirmDialog.label })}
                  </p>
                </div>
                <div className={css.dialogContent}>
                  <p className={css.dialogWarn}>{t('settings.artLibrary.editConfirm.warn')}</p>
                </div>
                <div className={css.dialogActions}>
                  <Button variant="outline" size="sm" type="button" onClick={() => { setConfirmDialog(null) }}>
                    {t('settings.confirm.cancel')}
                  </Button>
                  <Button variant="primary" size="sm" type="button" onClick={onConfirmDialog}>
                    {t('settings.artLibrary.editConfirm.ok')}
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div className={css.dialogHead}>
                  <h4 className={css.dialogTitle} id="muyu-confirm-title">
                    {t('settings.artLocal.saveConfirm.title')}
                  </h4>
                  <p className={css.dialogBody}>{t('settings.artLocal.saveConfirm.body')}</p>
                </div>
                <div className={css.dialogContent}>
                  {confirmDialog.canReplace ? (
                    <div className={css.dialogChoices} role="radiogroup" aria-label={t('settings.artLocal.saveConfirm.title')}>
                      <label className={confirmDialog.mode === 'replace' ? `${css.dialogChoice} ${css.dialogChoiceOn}` : css.dialogChoice}>
                        <div className={css.dialogChoiceRow}>
                          <input
                            type="radio"
                            name="muyu-save-mode"
                            checked={confirmDialog.mode === 'replace'}
                            onChange={() => {
                              setConfirmDialog({
                                ...confirmDialog,
                                mode: 'replace',
                                name: confirmDialog.replaceLabel,
                              })
                            }}
                          />
                          <span className={css.dialogChoiceText}>
                            <span className={css.dialogChoiceTitle}>{t('settings.artLocal.saveConfirm.replace')}</span>
                            <span className={css.dialogChoiceHint}>
                              {fillTemplate(t('settings.artLocal.saveConfirm.replaceHint'), {
                                name: confirmDialog.replaceLabel,
                              })}
                            </span>
                          </span>
                        </div>
                      </label>
                      <label className={confirmDialog.mode === 'new' ? `${css.dialogChoice} ${css.dialogChoiceOn}` : css.dialogChoice}>
                        <div className={css.dialogChoiceRow}>
                          <input
                            type="radio"
                            name="muyu-save-mode"
                            checked={confirmDialog.mode === 'new'}
                            onChange={() => {
                              setConfirmDialog({
                                ...confirmDialog,
                                mode: 'new',
                                name: confirmDialog.name.trim() === confirmDialog.replaceLabel
                                  ? ''
                                  : confirmDialog.name,
                              })
                            }}
                          />
                          <span className={css.dialogChoiceText}>
                            <span className={css.dialogChoiceTitle}>{t('settings.artLocal.saveConfirm.asNew')}</span>
                            <span className={css.dialogChoiceHint}>{t('settings.artLocal.saveConfirm.asNewHint')}</span>
                          </span>
                        </div>
                        {confirmDialog.mode === 'new' && (
                          <label className={css.dialogField}>
                            <span className={css.dialogFieldLabel}>{t('settings.artLocal.saveConfirm.name')}</span>
                            <input
                              className={`${css.input} ${css.dialogInput}`}
                              value={confirmDialog.name}
                              placeholder={t('settings.artLocal.saveConfirm.namePlaceholder')}
                              autoFocus
                              onClick={(event) => { event.stopPropagation() }}
                              onChange={(event) => {
                                setConfirmDialog({ ...confirmDialog, name: event.currentTarget.value })
                              }}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter') onConfirmDialog()
                              }}
                            />
                          </label>
                        )}
                      </label>
                    </div>
                  ) : (
                    <label className={css.dialogField}>
                      <span className={css.dialogFieldLabel}>{t('settings.artLocal.saveConfirm.name')}</span>
                      <input
                        className={`${css.input} ${css.dialogInput}`}
                        value={confirmDialog.name}
                        placeholder={t('settings.artLocal.saveConfirm.namePlaceholder')}
                        autoFocus
                        onChange={(event) => {
                          setConfirmDialog({ ...confirmDialog, name: event.currentTarget.value })
                        }}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') onConfirmDialog()
                        }}
                      />
                    </label>
                  )}
                </div>
                <div className={css.dialogActions}>
                  <Button variant="outline" size="sm" type="button" onClick={() => { setConfirmDialog(null) }}>
                    {t('settings.confirm.cancel')}
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    type="button"
                    disabled={confirmDialog.mode === 'new' && confirmDialog.name.trim() === ''}
                    onClick={onConfirmDialog}
                  >
                    {t('settings.artLocal.saveConfirm.ok')}
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </form>
  )
}
