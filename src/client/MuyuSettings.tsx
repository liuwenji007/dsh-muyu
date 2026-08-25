/**
 * Settings section: feel prefs, local working pack, and remote URL/zip.
 * Writes the exclusive store; does not touch Host yaml or settingsScope.
 */
import { useEffect, useRef, useState } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import { resolveMuyuPrefs, type MuyuPrefs } from '../config.ts'
import type { PropsLocale, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import { downloadBuiltinArtPack, downloadStoredArtPack } from './art-pack.ts'
import { ArtWorkbench } from './ArtWorkbench.tsx'
import { initPoseLayout } from './art-fit.ts'
import {
  ART_PACK_MAX_ZIP_BYTES, collectArtPackAsync, collectArtPackFromZip, freezeArtBlobs,
  type CollectArtPackResult,
} from './art-files.ts'
import {
  clearArtPack, layoutFromPack, loadArtPack, saveArtPack, saveArtPackLayout,
  type ArtPackLayoutInput, type StoredArtPack,
} from './art-idb.ts'
import { resolvePropsLayout } from './art-layout.ts'
import type { createMuyuStore } from './stores.ts'
import css from './MuyuSettings.module.css'

/** Composed settings-page props. */
export type MuyuSettingsProps =
  & PropsStore<ReturnType<typeof createMuyuStore>>
  & PropsLocale<'muyu'>

type ImportStatus = 'idle' | 'ok' | 'fail' | 'missing' | 'empty' | 'tooLarge' | 'notImage'

const ART_SOURCE_KEYS = [
  ['builtin', 'settings.artSource.builtin'],
  ['local', 'settings.artSource.local'],
  ['url', 'settings.artSource.url'],
  ['zip', 'settings.artSource.zip'],
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

/**
 * Wooden-fish prefs form.
 * @param props - store and locale.
 */
export function MuyuSettings({ useStore, actions, t }: MuyuSettingsProps) {
  const prefs = useStore(s => s.prefs ?? resolveMuyuPrefs())
  const [exportStatus, setExportStatus] = useState<'idle' | 'done' | 'fail'>('idle')
  const [importStatus, setImportStatus] = useState<ImportStatus>('idle')
  const [missingNames, setMissingNames] = useState<string[]>([])
  const [localNames, setLocalNames] = useState<string[]>([])
  const [localPack, setLocalPack] = useState<StoredArtPack | null>(null)
  const [zipNames, setZipNames] = useState<string[]>([])
  const skipLocalReload = useRef(false)

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

  useEffect(() => {
    if (skipLocalReload.current) {
      skipLocalReload.current = false
      return
    }
    let cancelled = false
    void Promise.all([loadArtPack('local'), loadArtPack('zip')]).then(async ([local, zip]) => {
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
      setZipNames(zip?.names ?? [])
    }).catch(() => {
      if (!cancelled) {
        setLocalPack(null)
        setLocalNames([])
        setZipNames([])
      }
    })
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

  const rejectCollected = (collected: Extract<CollectArtPackResult, { ok: false }>) => {
    setMissingNames(collected.missingRequired)
    setImportStatus(
      collected.reason === 'tooLarge' ? 'tooLarge'
        : collected.reason === 'notImage' ? 'notImage'
          : 'missing',
    )
  }

  const applyCollected = async (
    slot: 'local' | 'zip',
    collected: CollectArtPackResult,
  ) => {
    if (!collected.ok) {
      rejectCollected(collected)
      return
    }
    try {
      const frozen = await freezeArtBlobs(collected.files)
      if (!frozen.ok) {
        rejectCollected(frozen)
        return
      }
      const imported = collected.layout
      let layout: ArtPackLayoutInput | undefined
      if (imported?.stage !== undefined && imported.fits !== undefined) {
        layout = {
          stage: imported.stage,
          fits: imported.fits,
          props: resolvePropsLayout(imported.props),
        }
      } else {
        const pose = await initPoseLayout(frozen.files)
        layout = {
          stage: pose.stage,
          fits: pose.fits,
          props: resolvePropsLayout(imported?.props),
        }
      }
      const saved = await saveArtPack(slot, frozen.files, layout)
      if (slot === 'local') {
        setLocalNames(frozen.names)
        setLocalPack(saved)
      }
      else setZipNames(frozen.names)
      bumpRev({ artSource: slot })
      setMissingNames([])
      setImportStatus('ok')
    } catch {
      setImportStatus('fail')
    }
  }

  const onLocalChange = (event: { currentTarget: HTMLInputElement }) => {
    const picked = snapshotFiles(event.currentTarget.files)
    event.currentTarget.value = ''
    if (picked.length === 0) {
      setImportStatus('empty')
      return
    }
    void (async () => {
      await applyCollected('local', await collectArtPackAsync(filesFromPicked(picked)))
    })()
  }

  const onZipChange = (event: { currentTarget: HTMLInputElement }) => {
    const file = snapshotFiles(event.currentTarget.files)[0]
    event.currentTarget.value = ''
    if (file === undefined) {
      setImportStatus('empty')
      return
    }
    if (file.size > ART_PACK_MAX_ZIP_BYTES) {
      setImportStatus('tooLarge')
      return
    }
    void (async () => {
      try {
        const bytes = new Uint8Array(await file.arrayBuffer())
        await applyCollected('zip', await collectArtPackFromZip(bytes))
      } catch {
        setImportStatus('fail')
      }
    })()
  }

  const onClearLocal = () => {
    void (async () => {
      try {
        await clearArtPack('local')
        setLocalNames([])
        setLocalPack(null)
        bumpRev({ artSource: prefs.artSource === 'local' ? 'builtin' : prefs.artSource })
        setImportStatus('idle')
      } catch {
        setImportStatus('fail')
      }
    })()
  }

  const onClearZip = () => {
    void (async () => {
      try {
        await clearArtPack('zip')
        setZipNames([])
        bumpRev({ artSource: prefs.artSource === 'zip' ? 'builtin' : prefs.artSource })
        setImportStatus('idle')
      } catch {
        setImportStatus('fail')
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
      setImportStatus('fail')
    })
  }

  const onExportLocal = () => {
    if (localPack === null) return
    const layout = layoutFromPack(localPack)
    if (layout === null) {
      setExportStatus('fail')
      return
    }
    void downloadStoredArtPack(localPack.files, layout).then(() => {
      setExportStatus('done')
    }).catch(() => {
      setExportStatus('fail')
    })
  }

  const importHint = importStatus === 'ok'
    ? t('settings.artImport.ok')
    : importStatus === 'fail'
      ? t('settings.artImport.fail')
      : importStatus === 'tooLarge'
        ? t('settings.artImport.tooLarge')
        : importStatus === 'notImage'
          ? t('settings.artImport.notImage')
          : importStatus === 'missing'
            ? `${t('settings.artImport.missing')} ${missingNames.join(', ')}`
            : importStatus === 'empty'
              ? t('settings.artImport.empty')
              : ''

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
                className={prefs.artSource === source ? `${css.segBtn} ${css.segOn}` : css.segBtn}
                role="radio"
                aria-checked={prefs.artSource === source}
                onClick={() => { patch({ artSource: source }) }}
              >
                {t(key)}
              </button>
            ))}
          </div>
        </fieldset>
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
                onChange={onLocalChange}
              />
              {t('settings.artLocal.folder')}
            </label>
            <label className={css.fileButton}>
              <input
                className={css.fileInput}
                type="file"
                accept=".png,image/png"
                multiple
                onChange={onLocalChange}
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
        {importHint !== '' && (
          <p
            className={importStatus === 'ok' ? `${css.status} ${css.statusOk}` : `${css.status} ${css.statusError}`}
            role={importStatus === 'ok' ? 'status' : 'alert'}
          >
            {importHint}
          </p>
        )}
        {localPack !== null && localPack.stage !== undefined && (
          <div className={css.panel}>
            <h4 className={css.panelTitle}>{t('settings.artFit.title')}</h4>
            <ArtWorkbench pack={localPack} t={t} onCommitLayout={onCommitLayout} />
          </div>
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
            <label className={css.fileButton}>
              <input
                className={css.fileInput}
                type="file"
                accept=".zip,application/zip"
                onChange={onZipChange}
              />
              {t('settings.artZip')}
            </label>
            <Button variant="outline" size="sm" type="button" onClick={onExport}>
              {t('settings.artExport')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              type="button"
              disabled={localPack === null || localPack.stage === undefined}
              onClick={onExportLocal}
            >
              {t('settings.artExport.local')}
            </Button>
          </div>
          <Button
            variant="outline"
            size="sm"
            type="button"
            disabled={zipNames.length === 0}
            onClick={onClearZip}
          >
            {t('settings.artZip.clear')}
          </Button>
        </div>
        <p className={css.hint}>{t('settings.artZip.hint')}</p>
        <p className={css.meta}>
          {zipNames.length === 0
            ? t('settings.artZip.empty')
            : `${t('settings.artZip.loaded')} ${zipNames.length} ${t('settings.artLocal.count')}`}
        </p>
        <p className={css.hint}>{t('settings.artExport.hint')}</p>
        {importHint !== '' && (
          <p
            className={importStatus === 'ok' ? `${css.status} ${css.statusOk}` : `${css.status} ${css.statusError}`}
            role={importStatus === 'ok' ? 'status' : 'alert'}
          >
            {importHint}
          </p>
        )}
        {exportStatus === 'done' && (
          <p className={`${css.status} ${css.statusOk}`} role="status">{t('settings.artExport.done')}</p>
        )}
        {exportStatus === 'fail' && (
          <p className={`${css.status} ${css.statusError}`} role="alert">{t('settings.artExport.fail')}</p>
        )}
      </section>
    </form>
  )
}
